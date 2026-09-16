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

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Render {
            idea,
            pack,
            voice,
            out,
            models,
        } => {
            if pack != "mstudio" {
                anyhow::bail!("unsupported pack {pack:?} — supported: mstudio");
            }
            let out_dir = std::path::PathBuf::from(&out);
            std::fs::create_dir_all(&out_dir)?;
            let models_dir = resolve_models_dir(&models)?;

            let script = clipflow::script::build_script(&idea)?;
            let cue_texts: Vec<String> =
                script.cues.iter().map(|c| c.text.clone()).collect();
            let assets = clipflow::broll::assign_cue_assets(&idea, &cue_texts);
            let public_dir = models_dir
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| std::path::PathBuf::from("public"));
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
            let slug = slug_for(&idea);
            if slug.is_empty() {
                anyhow::bail!("slug empty for idea {idea:?} — need alphanumeric words");
            }
            // Intermediates live in a per-process temp dir (left on disk for post-failure debugging, OS temp hygiene on success).
            let tmp_intermediates =
                std::env::temp_dir().join(format!("clipflow-{}", std::process::id()));
            std::fs::create_dir_all(&tmp_intermediates)?;
            let narration = format!(
                "{} {} {}",
                script.hook,
                script.beats.join(" "),
                script.cta
            );

            let (wav, wav_duration): (Option<std::path::PathBuf>, f64) =
                match voice.as_str() {
                    "on" => {
                        let wav_path = tmp_intermediates.join(format!("{slug}.wav"));
                        let dur =
                            clipflow::tts::synth_to_wav(&models_dir, &narration, &wav_path)?;
                        (Some(wav_path), dur)
                    }
                    "sapi" => {
                        let wav_path = tmp_intermediates.join(format!("{slug}.wav"));
                        let dur = clipflow::tts::synth_sapi_to_wav(&narration, &wav_path)?;
                        (Some(wav_path), dur)
                    }
                    "off" => (None, 45.0),
                    other => anyhow::bail!(
                        "invalid voice {other:?}; valid values: on, sapi, off"
                    ),
                };

            let words_45s = clipflow::planner::plan_words(&script);
            let counts: Vec<usize> = script
                .cues
                .iter()
                .map(|c| c.text.split_whitespace().count())
                .collect();
            let bounds = clipflow::planner::cue_bounds(&counts, wav_duration);

            let ass_path = tmp_intermediates.join(format!("{slug}.ass"));
            clipflow::captions::write_ass(&script, &words_45s, &bounds, wav_duration, &ass_path)?;

            let mp4_path = out_dir.join(format!("{slug}-916.mp4"));
            let job = clipflow::render::Job {
                images,
                wav,
                ass: ass_path,
                out: mp4_path.clone(),
            };
            clipflow::render::render(&job, &bounds)?;

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
}
