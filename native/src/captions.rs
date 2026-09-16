use crate::planner::WordCue;
use crate::script::{CueKind, Script};
use anyhow::bail;

const WHITE: &str = r"{\1c&H00FFFFFF&\3c&H80000000&}";
const ACCENT: &str = r"{\1c&H00FD6B24&\3c&H00000000&}";
const WRAP_WIDTH: usize = 20;

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

/// Greedy 20-char wrap over `split_whitespace` tokens; returns lines of
/// token indices so the highlighted occurrence stays exact when a word
/// repeats inside its cue.
fn wrap_tokens(tokens: &[&str]) -> Vec<Vec<usize>> {
    let mut lines: Vec<Vec<usize>> = Vec::new();
    let mut width = 0usize;
    for (i, tok) in tokens.iter().enumerate() {
        let w = tok.chars().count();
        match lines.last_mut() {
            Some(line) if width + 1 + w <= WRAP_WIDTH => {
                line.push(i);
                width += 1 + w;
            }
            _ => {
                lines.push(vec![i]);
                width = w;
            }
        }
    }
    lines
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
         Style: Cap,Arial,58,&H00FFFFFF,&H000019FF,&H80000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,5,48,48,170,1\n\
         Style: Pill,Arial,40,&H00FD6B24,&H000019FF,&H80000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,0,8,48,48,110,1\n\
         [Events]\n\
         Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n",
    );

    let mut beat_n = 0usize;
    for (ci, cue) in script.cues.iter().enumerate() {
        let label = match cue.kind {
            CueKind::Hook => "HOOK".to_string(),
            CueKind::Cta => "CTA".to_string(),
            CueKind::Beat => {
                beat_n += 1;
                format!("BEAT {beat_n}")
            }
        };
        let (pill_start, pill_end) = bounds[ci];
        out.push_str(&format!(
            "Dialogue: 0,{},{},Pill,,0,0,0,,{}\n",
            fmt_time(pill_start),
            fmt_time(pill_end),
            label
        ));

        let tokens: Vec<&str> = cue.text.split_whitespace().collect();
        if tokens.is_empty() {
            continue;
        }
        let lines = wrap_tokens(&tokens);
        // Char-weighted proportional split of the cue span:
        // weight = len(word) + 1. Last word end snaps to the cue end.
        let weights: Vec<f64> = tokens
            .iter()
            .map(|t| t.chars().count() as f64 + 1.0)
            .collect();
        let total_w: f64 = weights.iter().sum();
        let span = pill_end - pill_start;
        let mut t = pill_start;
        // The j-th word of this cue highlights the j-th cue token, so
        // repeated words (e.g. "your" twice in the hook) light up the
        // correct occurrence.
        for (j, &w) in weights.iter().enumerate() {
            let dur = if total_w > 0.0 {
                span * w / total_w
            } else {
                span / tokens.len() as f64
            };
            let wstart = t;
            let wend = if j + 1 == tokens.len() {
                pill_end
            } else {
                t + dur
            };
            let mut rendered: Vec<String> = Vec::with_capacity(lines.len());
            for line in &lines {
                let mut s = String::from(WHITE);
                for (li, &ti) in line.iter().enumerate() {
                    if li > 0 {
                        s.push(' ');
                    }
                    if ti == j {
                        s.push_str(ACCENT);
                        s.push_str(tokens[ti]);
                        s.push_str(WHITE);
                    } else {
                        s.push_str(tokens[ti]);
                    }
                }
                rendered.push(s);
            }
            out.push_str(&format!(
                "Dialogue: 0,{},{},Cap,,0,0,0,,{}\n",
                fmt_time(wstart),
                fmt_time(wend),
                rendered.join(r"\N")
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::planner::{cue_bounds, plan_words};
    use crate::script::build_script;

    const IDEA: &str = "AI builds a site in 15 minutes, but creators still pay for sites that convert";

    #[test]
    fn trending_ass_has_84_dialogues_and_bounds() {
        // 79 engine words (28+13+11+18+9 — em/en dashes are standalone
        // whitespace tokens) + 5 pills = 84 events. Bounds are
        // count-proportional over total_secs (hook ≈ 42.12*28/79 ≈ 14.93s),
        // NOT rescaled engine spans.
        let s = build_script(IDEA).unwrap();
        let words = plan_words(&s);
        assert_eq!(words.len(), 79);
        let counts: Vec<usize> = s
            .cues
            .iter()
            .map(|c| c.text.split_whitespace().count())
            .collect();
        let bounds = cue_bounds(&counts, 42.12);
        let p = std::env::temp_dir().join("clipflow-cap-fixture.ass");
        write_ass(&s, &words, &bounds, 42.12, &p).unwrap();
        let text = std::fs::read_to_string(&p).unwrap();
        assert_eq!(text.matches("Dialogue:").count(), 84);
        assert!(text.contains("0:00:00.00"));
        assert!(text.contains("HOOK"));
        assert!(text.contains(r"{\1c&H00FD6B24&\3c&H00000000&}"));
        assert!(text.contains("0:00:42.12"));
        assert!(text.contains("0:00:14.93"));
    }
}
