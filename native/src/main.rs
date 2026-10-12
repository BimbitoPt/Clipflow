use anyhow::Result;
use clap::Parser;
use clipflow::{Cli, Cmd};

/// Directory holding the local ONNX TTS weights (`public/models`),
/// resolved relative to the running binary.
pub fn default_models_dir() -> std::path::PathBuf {
    match std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("../public/models")))
    {
        Some(joined) => joined.canonicalize().unwrap_or(joined),
        None => std::path::PathBuf::from("../public/models"),
    }
}

/// Resolve the models dir: (a) the `--models` flag path as given if it
/// exists, else (b) exe-relative `current_exe().parent()/../public/models`
/// canonicalized if it exists, else an error naming BOTH tried paths.
pub fn resolve_models_dir(flag: &str) -> anyhow::Result<std::path::PathBuf> {
    let flag_path = std::path::PathBuf::from(flag);
    if flag_path.exists() {
        return Ok(flag_path);
    }
    let exe_path: Option<std::path::PathBuf> = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("../public/models")))
        .map(|joined| joined.canonicalize().unwrap_or(joined));
    if let Some(ref p) = exe_path {
        if p.exists() {
            return Ok(p.clone());
        }
    }
    let exe_display = exe_path
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "<unknown exe-relative path>".to_string());
    anyhow::bail!(
        "models dir not found; tried flag path {:?} and exe-relative {:?}",
        flag_path.display().to_string(),
        exe_display
    );
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Voice {
    Ort,
    Sapi,
    Off,
}

/// Resolve `--voice`: `auto` picks the system voice on Windows (where the
/// ort SpeechT5 voice sounds robotic) and ort everywhere else.
fn resolve_voice(flag: &str) -> anyhow::Result<Voice> {
    match flag {
        "auto" => Ok(if cfg!(windows) { Voice::Sapi } else { Voice::Ort }),
        "on" => Ok(Voice::Ort),
        "sapi" => Ok(Voice::Sapi),
        "off" => Ok(Voice::Off),
        other => anyhow::bail!(
            "invalid voice {other:?}; valid values: auto, on, sapi, off"
        ),
    }
}

/// Word onset times within one cue from sparse SAPI anchors:
/// forward-fill at 0.38s steps, then compress any overrun back into
/// `[cue_start, cue_end - 0.2]`.
fn fill_cue_starts(
    n_words: usize,
    anchors: &[(usize, f64)],
    cue_start: f64,
    cue_end: f64,
) -> Vec<f64> {
    let mut starts = vec![cue_start; n_words];
    let mut known: Vec<Option<f64>> = vec![None; n_words];
    for &(idx, t) in anchors {
        if idx < n_words && known[idx].is_none() {
            known[idx] = Some(t);
        }
    }
    let first = (0..n_words).find(|&i| known[i].is_some()).unwrap_or(0);
    starts[first] = known[first].unwrap_or(cue_start);
    for i in first + 1..n_words {
        starts[i] = known[i].unwrap_or(starts[i - 1] + 0.38);
    }
    for i in (0..first).rev() {
        starts[i] = (starts[i + 1] - 0.38).max(cue_start);
    }
    // Compress trailing overrun into the cue end.
    if n_words > 0 {
        let last = n_words - 1;
        if starts[last] > cue_end - 0.2 {
            let anchor = starts[first].min(cue_end - 0.2);
            let span = (cue_end - 0.2 - anchor).max(0.3);
            let tail = n_words - first;
            for k in 0..tail {
                starts[first + k] = anchor + span * k as f64 / tail as f64;
            }
        }
    }
    starts
}

/// Fallback timed words when no engine word times exist (ort/off paths):
/// count-proportional cue bounds, even word split within (mirrors the
/// caption timing contract so visuals stay aligned).
fn proportional_timed(
    script: &clipflow::script::Script,
    total_secs: f64,
) -> Vec<(String, f64, f64)> {
    let counts: Vec<usize> = script
        .cues
        .iter()
        .map(|c| c.text.split_whitespace().count())
        .collect();
    let bounds = clipflow::planner::cue_bounds(&counts, total_secs);
    let mut timed = Vec::new();
    for (cue, &(cs, ce)) in script.cues.iter().zip(bounds.iter()) {
        let toks: Vec<&str> = cue.text.split_whitespace().collect();
        let n = toks.len().max(1);
        for (k, tok) in toks.iter().enumerate() {
            let s = cs + (ce - cs) * k as f64 / n as f64;
            let e = if k + 1 == toks.len() {
                ce
            } else {
                cs + (ce - cs) * (k + 1) as f64 / n as f64
            };
            timed.push((tok.to_string(), s, e));
        }
    }
    timed
}

fn slug_for(idea: &str) -> String {
    idea.split_whitespace()
        .take(3)
        .map(|t| {
            t.to_lowercase()
                .chars()
                .filter(|c| c.is_ascii_alphanumeric())
                .collect::<String>()
        })
        .filter(|s: &String| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

/// One full render lane: assets -> voice -> captions -> broll cuts -> mp4
/// + post copy. Deterministic overwrite per (idea, variant); variant > 1
/// gets a `-vN` slug suffix so takes never collide.
fn render_lane(
    idea: &str,
    voice: &str,
    out_dir: &std::path::Path,
    public_dir: &std::path::Path,
    models_dir: &std::path::Path,
    script: &clipflow::script::Script,
    cue_assets: Option<&str>,
    variant: u32,
) -> Result<()> {
    let base_slug = slug_for(idea);
    if base_slug.is_empty() {
        anyhow::bail!("slug empty for idea {idea:?} — need alphanumeric words");
    }
    let slug = if variant > 1 {
        format!("{base_slug}-v{variant}")
    } else {
        base_slug
    };
    let cue_texts: Vec<String> = script.cues.iter().map(|c| c.text.clone()).collect();
    // Cross-day footage rotation state lives next to the broll dir
    // (models_dir.parent() = repo-root public/), shared by CLI and worker.
    let usage_path = Some(public_dir.join(".broll-usage.json"));
    let assets = match cue_assets {
        Some(list) => clipflow::broll::pinned_cue_assets(list, cue_texts.len())?,
        None if variant > 1 => {
            clipflow::broll::assign_cue_assets_variant(&idea, &cue_texts, &usage_path, variant)
        }
        None => {
            clipflow::broll::assign_cue_assets_with_usage(&idea, &cue_texts, &usage_path)
        }
    };
    let mut images: Vec<std::path::PathBuf> = Vec::new();
    for entry in &assets {
        let rel = entry.src.trim_start_matches('/');
        let p = public_dir.join(rel);
        if !p.exists() {
            anyhow::bail!("missing broll file: {}", p.display());
        }
        images.push(p);
    }

    // Deterministic overwrite: re-runs of the same idea refresh outputs (`-y` semantics) and different ideas sharing a slug collide by design (frozen naming rule).
    // Machine-parseable first-asset line for cover tooling
    // (scripts/render-cover.mjs grabs a caption-free frame from
    // this asset instead of the caption-burned render).
    println!("first-asset: {}", assets[0].src);
    // Intermediates live in a per-process temp dir (left on disk for post-failure debugging, OS temp hygiene on success).
    let tmp_intermediates =
        std::env::temp_dir().join(format!("clipflow-{}", std::process::id()));
    std::fs::create_dir_all(&tmp_intermediates)?;

    // Timed words + cue bounds + optional wav, per voice engine.
    // SAPI uses per-cue synthesis with real word onsets; ort/off
    // fall back to proportional spans (no word times available).
    const MAX_SEG_SECS: f64 = 2.4;
    let (wav, timed): (Option<std::path::PathBuf>, Vec<(String, f64, f64)>) =
        match resolve_voice(voice)? {
                    Voice::Sapi => {
                        let mut cue_wavs = Vec::new();
                        let mut bounds: Vec<(f64, f64)> = Vec::new();
                        let mut timed: Vec<(String, f64, f64)> = Vec::new();
                        let mut t = 0.0;
                        for cue in &script.cues {
                            let wav_path = tmp_intermediates.join(format!(
                                "{slug}-{}.wav",
                                timed.len()
                            ));
                            let (dur, anchors) = clipflow::tts::synth_sapi_cue(
                                &cue.text,
                                &wav_path,
                            )?;
                            let toks: Vec<&str> = cue.text.split_whitespace().collect();
                            let end = t + dur;
                            // Anchors are cue-relative; offset into video time.
                            let abs_anchors: Vec<(usize, f64)> = anchors
                                .iter()
                                .map(|a| (a.word_index, t + a.start_secs))
                                .collect();
                            let starts = fill_cue_starts(toks.len(), &abs_anchors, t, end);
                            for (k, tok) in toks.iter().enumerate() {
                                let s = starts[k];
                                let e = if k + 1 < toks.len() {
                                    starts[k + 1]
                                } else {
                                    end
                                };
                                timed.push((tok.to_string(), s, e.max(s + 0.05)));
                            }
                            bounds.push((t, end));
                            cue_wavs.push(wav_path);
                            t = end;
                        }
                        let wav_path = tmp_intermediates.join(format!("{slug}.wav"));
                        clipflow::tts::concat_wavs_16k_mono(&cue_wavs, &wav_path)?;
                        let _ = bounds;
                        (Some(wav_path), timed)
                    }
                    Voice::Ort => {
                        let narration = format!(
                            "{} {} {}",
                            script.hook,
                            script.beats.join(" "),
                            script.cta
                        );
                        let wav_path = tmp_intermediates.join(format!("{slug}.wav"));
                        let dur = clipflow::tts::synth_to_wav(
                            &models_dir,
                            &narration,
                            &wav_path,
                        )?;
                        (Some(wav_path), proportional_timed(script, dur))
                    }
                    Voice::Off => {
                        let total = script.cues.last().map(|c| c.end).unwrap_or(45.0);
                        (None, proportional_timed(script, total))
                    }
                };

            // Retention cuts: subdivide every cue span into ≤2.4s segments,
            // cycling the assigned assets round-robin (never repeating the
            // previous segment). Segment spans derive from the timed words.
            let mut seg_images: Vec<std::path::PathBuf> = Vec::new();
            let mut seg_spans: Vec<(f64, f64)> = Vec::new();
            let mut prev_asset = usize::MAX;
            // Re-derive cue spans from timed words grouped by cue order.
            let cue_counts: Vec<usize> = script
                .cues
                .iter()
                .map(|c| c.text.split_whitespace().count())
                .collect();
            let mut k = 0usize;
            for (ci, cue) in script.cues.iter().enumerate() {
                let n = cue_counts[ci];
                let cstart = if k == 0 { 0.0 } else { timed[k - 1].2 };
                let cend = timed
                    .get(k + n.saturating_sub(1))
                    .map(|w| w.2)
                    .unwrap_or(cstart);
                let _ = cue;
                let mut s = cstart;
                let mut sk = 0usize;
                while s < cend {
                    let e = (s + MAX_SEG_SECS).min(cend);
                    let mut ai = (ci + sk) % images.len().max(1);
                    if ai == prev_asset {
                        ai = (ai + 1) % images.len().max(1);
                    }
                    seg_images.push(images[ai].clone());
                    seg_spans.push((s, e));
                    prev_asset = ai;
                    s = e;
                    sk += 1;
                }
                k += n;
            }

            let ass_path = tmp_intermediates.join(format!("{slug}.ass"));
            clipflow::captions::write_ass_timed(&timed, &ass_path)?;

            let mp4_path = out_dir.join(format!("{slug}-916.mp4"));
            let job = clipflow::render::Job {
                images: seg_images,
                wav,
                ass: ass_path,
                out: mp4_path.clone(),
            };
            clipflow::render::render(&job, &seg_spans)?;

            let tiktok = format!("{} {}", script.hook, script.hashtags.join(" "));
            let combined = format!("{} {}", script.hook, script.cta);
            let x: String = combined.chars().take(280).collect();

            let tiktok_path = out_dir.join(format!("{slug}-tiktok.txt"));
            let x_path = out_dir.join(format!("{slug}-x.txt"));
            let linkedin_path = out_dir.join(format!("{slug}-linkedin.txt"));
            std::fs::write(&tiktok_path, &tiktok)?;
            std::fs::write(&x_path, &x)?;
            std::fs::write(&linkedin_path, &script.linkedin_body)?;

            for p in [&mp4_path, &tiktok_path, &x_path, &linkedin_path] {
                println!("{}", p.display());
            }
    Ok(())
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Rate { entries, models } => {
            let models_dir = resolve_models_dir(&models)?;
            let public_dir = models_dir
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| std::path::PathBuf::from("public"));
            let usage_path = Some(public_dir.join(".broll-usage.json"));
            let mut ratings = Vec::new();
            for raw in &entries {
                let (src, val) = raw
                    .split_once('=')
                    .ok_or_else(|| anyhow::anyhow!("--rate expects <src>=<rating>, got {raw:?}"))?;
                let v: i32 = val.parse()?;
                ratings.push((src.trim().to_string(), v));
            }
            clipflow::broll::rate_usage(&ratings, &usage_path)?;
            println!(
                "saved {} rating(s) to {}",
                ratings.len(),
                usage_path.as_ref().unwrap_or(&public_dir).display()
            );
        }
        Cmd::Render {
            idea,
            pack,
            voice,
            out,
            plan,
            models,
            cue_assets,
            variants,
        } => {
            if pack != "mstudio" && pack != "clipflow" {
                anyhow::bail!("unsupported pack {pack:?} — supported: mstudio, clipflow");
            }
            let plan = clipflow::script::plan_from_str(&plan)?;
            if cue_assets.is_some() && variants > 1 {
                anyhow::bail!("--cue-assets is mutually exclusive with --variants: pin one take or let the engine vary");
            }
            let out_dir = std::path::PathBuf::from(&out);
            std::fs::create_dir_all(&out_dir)?;
            let models_dir = resolve_models_dir(&models)?;

            let script = clipflow::script::build_script(&idea, &pack, plan)?;
            let public_dir = models_dir
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| std::path::PathBuf::from("public"));
            for variant in 1..=variants {
                render_lane(
                    &idea,
                    &voice,
                    &out_dir,
                    &public_dir,
                    &models_dir,
                    &script,
                    cue_assets.as_deref(),
                    variant,
                )?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_models_dir_missing_mentions_both_paths() {
        let err = resolve_models_dir("definitely/not/here-xyz")
            .expect_err("nonexistent flag with missing exe-relative dir must err");
        let msg = format!("{err:#}");
        assert!(msg.contains("definitely/not/here-xyz"), "flag path missing: {msg}");
        // Exe-relative path uses native separators (backslashes on Windows).
        assert!(
            msg.contains("public/models")
                || msg.contains("public\\models")
                || msg.contains("models"),
            "exe-relative path missing: {msg}"
        );
    }

    #[test]
    fn resolve_voice_maps_flags() {
        assert_eq!(resolve_voice("on").unwrap(), Voice::Ort);
        assert_eq!(resolve_voice("sapi").unwrap(), Voice::Sapi);
        assert_eq!(resolve_voice("off").unwrap(), Voice::Off);
        assert!(resolve_voice("bogus").is_err());
    }

    #[test]
    fn resolve_voice_auto_prefers_system_voice_on_windows() {
        assert_eq!(
            resolve_voice("auto").unwrap(),
            if cfg!(windows) { Voice::Sapi } else { Voice::Ort }
        );
    }

    #[test]
    fn fill_cue_starts_offsets_anchors_into_video_time() {
        // Anchors arrive cue-relative; caller offsets them. A missing tail
        // word fills forward but never past cue_end - 0.2.
        let starts = fill_cue_starts(4, &[(0, 36.1), (1, 36.5), (2, 37.0)], 36.0, 38.0);
        assert!((starts[0] - 36.1).abs() < 1e-9);
        assert!((starts[1] - 36.5).abs() < 1e-9);
        assert!(starts[3] <= 38.0 - 0.2 + 1e-9);
        assert!(starts.windows(2).all(|w| w[1] >= w[0]));
    }
}
