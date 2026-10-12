use crate::script::{CueKind, Script};

pub const VIDEO_SECS: f64 = 45.0;

#[derive(Debug, Clone)]
pub struct WordCue {
    pub word: String,
    pub start: f64,
    pub end: f64,
    pub cue_kind: CueKind,
}

pub fn plan_words(script: &Script) -> Vec<WordCue> {
    let mut out = Vec::new();
    for cue in &script.cues {
        let tokens: Vec<&str> = cue.text.split_whitespace().collect();
        if tokens.is_empty() {
            continue;
        }
        let n = tokens.len() as f64;
        let span = cue.end - cue.start;
        for (i, tok) in tokens.iter().enumerate() {
            let i = i as f64;
            out.push(WordCue {
                word: tok.to_string(),
                start: cue.start + span * i / n,
                end: cue.start + span * (i + 1.0) / n,
                cue_kind: cue.kind,
            });
        }
    }
    out
}

pub fn rescale(words: &[WordCue], total_secs: f64) -> Vec<WordCue> {
    let factor = total_secs / VIDEO_SECS;
    words
        .iter()
        .map(|w| WordCue {
            word: w.word.clone(),
            start: w.start * factor,
            end: w.end * factor,
            cue_kind: w.cue_kind,
        })
        .collect()
}

/// Count-proportional gapless partition of `total_secs` from 0.
/// Cue `i` gets `total_secs * counts[i] / sum`. All-zero/empty counts →
/// equal split. Caption AND visual cue timing derive from this with the
/// real wav duration (rescaling 45s engine spans mis-syncs speech).
pub fn cue_bounds(counts: &[usize], total_secs: f64) -> Vec<(f64, f64)> {
    let n = counts.len();
    assert!(n > 0, "cue_bounds needs at least one cue");
    let sum: usize = counts.iter().sum();
    let shares: Vec<f64> = if sum == 0 {
        vec![1.0 / n as f64; n]
    } else {
        counts.iter().map(|c| *c as f64 / sum as f64).collect()
    };
    let mut out = Vec::with_capacity(n);
    let mut t = 0.0;
    for s in shares {
        let end = t + total_secs * s;
        out.push((t, end));
        t = end;
    }
    if let Some(last) = out.last_mut() { last.1 = total_secs; }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::script::{build_script, Plan};

    const EPS: f64 = 1e-9;

    #[test]
    fn words_partition_every_cue_without_gaps() {
        let s = build_script("fixed-price websites that ship in two weeks", "mstudio", Plan::Short).unwrap();
        let words = plan_words(&s);
        assert!(!words.is_empty());
        assert!((words.first().unwrap().start - 0.0).abs() < EPS);
        assert!((words.last().unwrap().end - 45.0).abs() < EPS);
        for w in words.windows(2) {
            assert!(w[1].start + EPS >= w[0].start);
            assert!(w[1].end > w[0].start);
        }
        for cue in &s.cues {
            let mut dur = 0.0;
            let mut count = 0;
            for w in &words {
                if w.start + EPS >= cue.start && w.start < cue.end {
                    dur += w.end - w.start;
                    count += 1;
                }
            }
            assert!(count > 0);
            assert!(((cue.end - cue.start) - dur).abs() < 1e-6);
        }
    }

    #[test]
    fn rescale_maps_45s_words_to_wav_duration() {
        let s = build_script("fixed-price websites that ship in two weeks", "mstudio", Plan::Short).unwrap();
        let words = plan_words(&s);
        let scaled = rescale(&words, 42.12);
        assert!((scaled.first().unwrap().start - 0.0).abs() < EPS);
        assert!((scaled.last().unwrap().end - 42.12).abs() < 1e-6);
        assert_eq!(scaled.len(), words.len());
    }

    #[test]
    fn cue_bounds_are_count_proportional_and_gapless() {
        let b = cue_bounds(&[28, 13, 11, 18, 9], 42.12);
        assert_eq!(b.len(), 5);
        assert!((b[0].0 - 0.0).abs() < EPS);
        assert!((b[4].1 - 42.12).abs() < 1e-6);
        for w in b.windows(2) {
            assert!((w[1].0 - w[0].1).abs() < 1e-9);
        }
        let hook_expect = 42.12 * 28.0 / 79.0;
        assert!((b[0].1 - hook_expect).abs() < 1e-6);
    }
}
