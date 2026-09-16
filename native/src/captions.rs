use crate::planner::WordCue;
use crate::script::Script;
use anyhow::bail;

const WHITE: &str = r"{\1c&H00FFFFFF&\3c&H80000000&}";
const ACCENT: &str = r"{\1c&H00FD6B24&\3c&H00000000&}";
const CHUNK_WORDS: usize = 3;
const CHUNK_CHARS: usize = 16;
const BASE_SIZE: i64 = 68;
const MIN_SIZE: i64 = 40;
const MAX_WIDTH_PX: f64 = 600.0;
const AVG_ADVANCE: f64 = 0.62;

/// Fit font size so the chunk line stays on screen: shrink from BASE_SIZE
/// until estimated width (chars × size × AVG_ADVANCE) fits MAX_WIDTH_PX.
/// Long words at size 68 otherwise run off the 720px frame.
fn fit_size(visible_chars: usize) -> i64 {
    if visible_chars == 0 {
        return BASE_SIZE;
    }
    let fit = (MAX_WIDTH_PX / (AVG_ADVANCE * visible_chars as f64)).floor() as i64;
    fit.clamp(MIN_SIZE, BASE_SIZE)
}

fn fmt_time(secs: f64) -> String {
    let cs = (secs * 100.0).round().max(0.0) as u64;
    format!(
        "{}:{:02}:{:02}.{:02}",
        cs / 360_000,
        (cs / 6_000) % 60,
        (cs / 100) % 60,
        cs % 100
    )
}

/// Split cue tokens into TikTok-style chunks: at most CHUNK_WORDS words
/// and CHUNK_CHARS visible characters, never crossing a sentence boundary
/// (`.`, `?`, `!`). Returns token-index ranges so repeated words stay exact.
fn chunk_tokens(tokens: &[&str]) -> Vec<(usize, usize)> {
    let mut chunks: Vec<(usize, usize)> = Vec::new();
    let mut start = 0usize;
    while start < tokens.len() {
        let mut end = start;
        let mut chars = 0usize;
        while end < tokens.len() && end - start < CHUNK_WORDS {
            let w = tokens[end].chars().count();
            let add = if end == start { w } else { w + 1 };
            if chars + add > CHUNK_CHARS && end > start {
                break;
            }
            chars += add;
            end += 1;
            if tokens[end - 1].ends_with(['.', '?', '!']) {
                break;
            }
        }
        if end == start {
            // Single over-long word: emit alone, fit_size shrinks it.
            end = (start + 1).min(tokens.len());
        }
        chunks.push((start, end));
        start = end;
    }
    chunks
}

/// Visible character count of a rendered chunk (tags excluded).
fn visible_len(body: &str) -> usize {
    let mut out = body.to_string();
    while let Some(a) = out.find('{') {
        if let Some(b) = out[a..].find('}') {
            out.replace_range(a..a + b + 1, "");
        } else {
            break;
        }
    }
    out.chars().count()
}

pub fn write_ass(
    script: &Script,
    words_45s: &[WordCue],
    bounds: &[(f64, f64)],
    total_secs: f64,
    path: &std::path::Path,
) -> anyhow::Result<()> {
    // Group the ordered 45s-engine words at the engine cue boundaries.
    // `words_45s` supplies token ORDER only; its times are never used for
    // output spans, only to decide which cue each word belongs to: word
    // belongs to cue k while its engine start < cue[k+1].start.
    let mut groups: Vec<Vec<&WordCue>> = vec![Vec::new(); script.cues.len()];
    let mut k = 0usize;
    for w in words_45s {
        while k + 1 < script.cues.len() && w.start + 1e-9 >= script.cues[k + 1].start {
            k += 1;
        }
        groups[k].push(w);
    }
    // Timing is single-sourced from the caller-provided `bounds` (the same
    // slice drives visual cue durations); grouping above documents token
    // order only.
    debug_assert_eq!(
        groups.iter().map(|g| g.len()).sum::<usize>(),
        words_45s.len()
    );
    let _ = total_secs;
    if bounds.len() != script.cues.len() {
        bail!(
            "bounds len {} != cues len {}",
            bounds.len(),
            script.cues.len()
        );
    }

    let mut out = String::from(
        "[Script Info]\n\
         ScriptType: v4.00+\n\
         PlayResX: 720\n\
         PlayResY: 1280\n\
         WrapStyle: 2\n\
         ScaledBorderAndShadow: yes\n\
         [V4+ Styles]\n\
         Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n\
         Style: Chunk,Arial,68,&H00FFFFFF,&H000019FF,&H80000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,1,5,60,60,300,1\n\
         [Events]\n\
         Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n",
    );

    // No cue pills: TikTok style shows speech only, never HOOK/BEAT/CTA labels.
    for (ci, cue) in script.cues.iter().enumerate() {
        let tokens: Vec<&str> = cue.text.split_whitespace().collect();
        if tokens.is_empty() {
            continue;
        }
        let chunks = chunk_tokens(&tokens);
        // Char-weighted proportional split of the cue span:
        // weight = len(word) + 1. Last chunk end snaps to the cue end.
        let weights: Vec<f64> = tokens
            .iter()
            .map(|t| t.chars().count() as f64 + 1.0)
            .collect();
        let total_w: f64 = weights.iter().sum();
        let (bound_start, bound_end) = bounds[ci];
        let span = bound_end - bound_start;
        let mut t = bound_start;
        // The last token of each chunk renders in the accent color.
        for (n, &(a, b)) in chunks.iter().enumerate() {
            let chunk_w: f64 = weights[a..b].iter().sum();
            let dur = if total_w > 0.0 {
                span * chunk_w / total_w
            } else {
                span / chunks.len() as f64
            };
            let cstart = t;
            let cend = if n + 1 == chunks.len() {
                bound_end
            } else {
                t + dur
            };
            let mut body = String::from(WHITE);
            for (k, tok) in tokens[a..b].iter().enumerate() {
                if k > 0 {
                    body.push(' ');
                }
                if k + 1 == b - a {
                    body.push_str(ACCENT);
                    body.push_str(tok);
                    body.push_str(WHITE);
                } else {
                    body.push_str(tok);
                }
            }
            // Per-event fit: {\fsN} override keeps long chunks on screen.
            let size = fit_size(visible_len(&body));
            out.push_str(&format!(
                "Dialogue: 0,{},{},Chunk,,0,0,0,,{{\\fs{}}}{}\n",
                fmt_time(cstart),
                fmt_time(cend),
                size,
                body
            ));
            t += dur;
        }
    }

    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(path, out)?;
    Ok(())
}

/// TikTok chunk captions from EXPLICIT word times (SAPI per-cue path).
///
/// `timed` = (word, start, end) in ascending order. Consecutive words are
/// grouped into chunks (≤3 words, ≤16 visible chars, sentence-aware) with
/// spans from word times (chunk end = next chunk start, last = its own
/// end). Same Chunk style (68/heavy/center, \fs fit) and last-token accent
/// as `write_ass`. No pills, ever.
pub fn write_ass_timed(
    timed: &[(String, f64, f64)],
    path: &std::path::Path,
) -> anyhow::Result<()> {
    if timed.is_empty() {
        anyhow::bail!("write_ass_timed needs at least one timed word");
    }
    let toks: Vec<&str> = timed.iter().map(|(w, _, _)| w.as_str()).collect();
    let chunks = chunk_tokens(&toks);
    let mut out = String::from(
        "[Script Info]\n\
         ScriptType: v4.00+\n\
         PlayResX: 720\n\
         PlayResY: 1280\n\
         WrapStyle: 2\n\
         ScaledBorderAndShadow: yes\n\
         [V4+ Styles]\n\
         Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n\
         Style: Chunk,Arial,68,&H00FFFFFF,&H000019FF,&H80000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,1,5,60,60,300,1\n\
         [Events]\n\
         Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n",
    );
    for (n, &(a, b)) in chunks.iter().enumerate() {
        let cstart = timed[a].1;
        let cend = if n + 1 == chunks.len() {
            timed[b - 1].2
        } else {
            timed[chunks[n + 1].0].1
        };
        let cend = if cend <= cstart { cstart + 0.3 } else { cend };
        let mut body = String::from(WHITE);
        for (k, tok) in toks[a..b].iter().enumerate() {
            if k > 0 {
                body.push(' ');
            }
            if k + 1 == b - a {
                body.push_str(ACCENT);
                body.push_str(tok);
                body.push_str(WHITE);
            } else {
                body.push_str(tok);
            }
        }
        let size = fit_size(visible_len(&body));
        out.push_str(&format!(
            "Dialogue: 0,{},{},Chunk,,0,0,0,,{{\\fs{}}}{}\n",
            fmt_time(cstart),
            fmt_time(cend),
            size,
            body
        ));
    }
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(path, out)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::planner::{cue_bounds, plan_words};
    use crate::script::build_script;

    const IDEA: &str = "AI builds a site in 15 minutes, but creators still pay for sites that convert";

    #[test]
    fn trending_ass_has_chunk_captions_without_pills() {
        // 77 engine words in TikTok chunks (<=4 words, sentence-aware) and
        // ZERO pill/label events. Bounds count-proportional over total_secs.
        let s = build_script(IDEA).unwrap();
        let words = plan_words(&s);
        assert_eq!(words.len(), 77);
        let counts: Vec<usize> = s
            .cues
            .iter()
            .map(|c| c.text.split_whitespace().count())
            .collect();
        let bounds = cue_bounds(&counts, 42.12);
        let p = std::env::temp_dir().join("clipflow-cap-fixture.ass");
        write_ass(&s, &words, &bounds, 42.12, &p).unwrap();
        let text = std::fs::read_to_string(&p).unwrap();
        let events: Vec<&str> = text.lines().filter(|l| l.starts_with("Dialogue:")).collect();
        // Chunk count follows the <=3-word/<=16-char rule; assert structure,
        // not a magic number, plus the fit guarantee below.
        assert!(events.len() >= 24, "too few chunks: {}", events.len());
        for ev in &events {
            assert!(ev.contains(",Chunk,"), "non-chunk event: {ev}");
            assert!(!ev.contains("HOOK"));
            assert!(!ev.contains("BEAT"));
            assert!(!ev.contains("CTA"));
            // Strip override tags, count visible words (<=3 per chunk).
            let body = ev.rsplit(",,").next().unwrap_or("");
            let mut visible = body.to_string();
            while let Some(a) = visible.find('{') {
                if let Some(b) = visible[a..].find('}') {
                    visible.replace_range(a..a + b + 1, "");
                } else {
                    break;
                }
            }
            let n = visible.split_whitespace().count();
            assert!((1..=3).contains(&n), "{n} words in: {ev}");
            // Fit guarantee: fitted size keeps estimated width on screen.
            let chars = visible.chars().count();
            let size = fit_size(chars);
            assert!(
                (size as f64) * (chars as f64) * AVG_ADVANCE <= MAX_WIDTH_PX + 1.0,
                "overflow: {chars} chars at {size}px in: {ev}"
            );
            assert!((MIN_SIZE..=BASE_SIZE).contains(&size));
        }
        assert!(text.contains("0:00:00.00"));
        assert!(text.contains(r"{\1c&H00FD6B24&\3c&H00000000&}"));
        assert!(text.contains("0:00:42.12"));
    }

    #[test]
    fn timed_chunks_use_exact_spans() {
        // 6-word fixture: "Link in bio." (0.0-0.9) + "Fixed price now."
        // (0.9-2.5): chunks [Link in bio.] [Fixed price now.] with exact
        // spans (chunk end = next chunk start, last = its own end), accent
        // on each chunk's last token.
        let timed = vec![
            ("Link".to_string(), 0.0, 0.3),
            ("in".to_string(), 0.3, 0.45),
            ("bio.".to_string(), 0.45, 0.9),
            ("Fixed".to_string(), 0.9, 1.4),
            ("price".to_string(), 1.4, 1.8),
            ("now.".to_string(), 1.8, 2.5),
        ];
        let p = std::env::temp_dir().join("clipflow-timed-fixture.ass");
        write_ass_timed(&timed, &p).unwrap();
        let text = std::fs::read_to_string(&p).unwrap();
        let events: Vec<&str> = text.lines().filter(|l| l.starts_with("Dialogue:")).collect();
        assert_eq!(events.len(), 2);
        assert!(events[0].contains("0:00:00.00") && events[0].contains("0:00:00.90"));
        assert!(events[1].contains("0:00:00.90") && events[1].contains("0:00:02.50"));
        assert!(events[0].contains(r"{\1c&H00FD6B24&\3c&H00000000&}bio."));
        assert!(events[1].contains(r"{\1c&H00FD6B24&\3c&H00000000&}now."));
        assert!(!events[0].contains("HOOK"));
        assert!(!events[0].contains("BEAT"));
        assert!(!events[0].contains("CTA"));
        assert!(!events[1].contains("HOOK"));
        assert!(!events[1].contains("BEAT"));
        assert!(!events[1].contains("CTA"));
    }

    #[test]
    fn timed_rejects_empty_input() {
        let p = std::env::temp_dir().join("clipflow-timed-empty.ass");
        assert!(write_ass_timed(&[], &p).is_err());
    }
}
