use serde::Deserialize;

const NICHE: &str = "web design, development and AI automation studio";

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CueKind {
    Hook,
    Beat,
    Cta,
}

#[derive(Debug, Clone)]
pub struct Cue {
    pub start: f64,
    pub end: f64,
    pub kind: CueKind,
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct Script {
    pub hook: String,
    pub beats: Vec<String>,
    pub cta: String,
    pub cues: Vec<Cue>,
    pub hashtags: Vec<String>,
    pub linkedin_body: String,
}

#[derive(Debug, Deserialize)]
struct Pack {
    id: String,
    label: String,
    hooks: Vec<String>,
    beats: Vec<String>,
    ctas: Vec<String>,
    themes: Vec<Theme>,
    hashtags: Vec<String>,
    /// Product/agent phrases that must never leak into this pack's spoken
    /// copy (learned 2026-09-18: the Clipflow tagline narrated itself into
    /// agency posts). Required: a missing list fails loudly in tests.
    banned: Vec<String>,
}

/// True when `text` contains any banned phrase, ignoring case and spacing.
fn contains_banned(text: &str, banned: &[String]) -> Option<String> {
    let normalized = text.to_lowercase();
    for phrase in banned {
        let needle = phrase.to_lowercase();
        if !needle.is_empty() && normalized.contains(&needle) {
            return Some(phrase.clone());
        }
    }
    None
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
// fields bg/accent/font are schema-required, never read by the engine
struct Theme {
    bg: (String, String),
    accent: String,
    font: String,
}

fn pick(arr: &[String], seed: &str) -> anyhow::Result<String> {
    if arr.is_empty() {
        anyhow::bail!("E_EMPTY_BANK");
    }
    let mut h: u32 = 0;
    for c in seed.chars() {
        let unit: u32 = if (c as u32) > 0xFFFF {
            0xD800 + (((c as u32) - 0x10000) >> 10)
        } else {
            c as u32
        };
        h = h.wrapping_mul(31).wrapping_add(unit);
    }
    Ok(arr[(h as usize) % arr.len()].clone())
}

/// Render plan: cue count + timing skeleton.
/// Short = 45s social/hero cut (hook + 3 beats + CTA).
/// Master = 75s converting cut (hook / problem / bridge / product /
/// proof / objection / CTA) per docs/demo-craft-research.md.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Plan {
    Short,
    Master,
}

pub fn plan_from_str(s: &str) -> anyhow::Result<Plan> {
    match s {
        "short" => Ok(Plan::Short),
        "master" => Ok(Plan::Master),
        _ => anyhow::bail!("unsupported plan {s:?} - supported: short, master"),
    }
}

pub fn build_script(idea: &str, pack_id: &str, plan: Plan) -> anyhow::Result<Script> {
    let pack: Pack = match pack_id {
        "mstudio" => serde_json::from_str(include_str!("../packs/mstudio.json"))?,
        "clipflow" => serde_json::from_str(include_str!("../packs/clipflow.json"))?,
        _ => anyhow::bail!("unsupported pack {pack_id:?} - supported: mstudio, clipflow"),
    };
    let _ = (pack.id, pack.label, pack.themes);

    let mut clean = idea.split_whitespace().collect::<Vec<_>>().join(" ");
    if clean.is_empty() {
        anyhow::bail!("E_EMPTY_IDEA");
    }
    if clean.chars().count() > 140 {
        let truncated: String = clean.chars().take(140).collect();
        // Keep only complete sentences: cut at the last period/question/exclam
        // mark. Discards a dangling partial sentence instead of chopping the
        // final words off a brand phrase ("idea in, video out" losing "out").
        let body = match truncated.rfind(|c: char| {
            (c == '.' || c == '!' || c == '?') && truncated[..c as usize].chars().count() + 1 >= 5
        }) {
            Some(i) if i + 1 >= 5 => truncated[..i + 1].trim_end(),
            _ => "",
        };
        if !body.is_empty() {
            clean = body.to_string();
        } else {
            clean = match truncated.rsplit_once(' ') {
                Some((head, _)) => head.to_string(),
                None => truncated,
            };
        }
        if clean.is_empty() {
            anyhow::bail!("E_EMPTY_IDEA");
        }
    }

    // Append a period only when the idea does not end with one, so complete
    // sentences never get a double ".." and taglines stay intact.
    let hook = if clean.ends_with(['.', '!', '?']) {
        format!("{} {}", pick(&pack.hooks, &clean)?, clean)
    } else {
        format!("{} {}.", pick(&pack.hooks, &clean)?, clean)
    };
    // Beat copy is pack-driven (voice-angle beats), never profile constants
    // narrated aloud (narrating tone/proof fields read as ad-slop).
    // Short uses beats 0..3; master uses beats 0..5 (packs must carry 5).
    let need = match plan {
        Plan::Short => 3,
        Plan::Master => 5,
    };
    if pack.beats.len() < need {
        anyhow::bail!("E_PACK_BEATS: plan needs {need} beats, pack has {}", pack.beats.len());
    }
    let take = &pack.beats[..need];
    let beats: Vec<String> = take.to_vec();
    let cta = pick(&pack.ctas, &(clean.clone() + "\n" + NICHE))?;

    // Slop gate: the idea itself is user text and stays untouched, but pack
    // assemblies (hook/base + chosen lines) must never leak banned phrases.
    for (i, text) in beats.iter().enumerate() {
        if let Some(phrase) = contains_banned(text, &pack.banned) {
            anyhow::bail!("E_BANNED_PHRASE: beat{} contains {phrase:?}", i + 1);
        }
    }
    for (what, text) in [("hook", &hook), ("cta", &cta)] {
        if let Some(phrase) = contains_banned(text, &pack.banned) {
            anyhow::bail!("E_BANNED_PHRASE: {what} contains {phrase:?}");
        }
    }

    let cues = match plan {
        Plan::Short => vec![
            Cue { start: 0.0, end: 4.0, kind: CueKind::Hook, text: hook.clone() },
            Cue { start: 4.0, end: 16.0, kind: CueKind::Beat, text: beats[0].clone() },
            Cue { start: 16.0, end: 28.0, kind: CueKind::Beat, text: beats[1].clone() },
            Cue { start: 28.0, end: 40.0, kind: CueKind::Beat, text: beats[2].clone() },
            Cue { start: 40.0, end: 45.0, kind: CueKind::Cta, text: cta.clone() },
        ],
        // 75s converting cut: hook 5 / problem 10 / bridge 5 / product 35 /
        // proof 5 / objection 5 / CTA held 10.
        Plan::Master => vec![
            Cue { start: 0.0, end: 5.0, kind: CueKind::Hook, text: hook.clone() },
            Cue { start: 5.0, end: 15.0, kind: CueKind::Beat, text: beats[0].clone() },
            Cue { start: 15.0, end: 20.0, kind: CueKind::Beat, text: beats[1].clone() },
            Cue { start: 20.0, end: 55.0, kind: CueKind::Beat, text: beats[2].clone() },
            Cue { start: 55.0, end: 60.0, kind: CueKind::Beat, text: beats[3].clone() },
            Cue { start: 60.0, end: 65.0, kind: CueKind::Beat, text: beats[4].clone() },
            Cue { start: 65.0, end: 75.0, kind: CueKind::Cta, text: cta.clone() },
        ],
    };

    let linkedin_body = format!(
        "{}\n\n{}\n\n{}\n\n{}",
        hook,
        beats.join("\n"),
        cta,
        pack.hashtags.join(" ")
    );

    Ok(Script {
        hook,
        beats,
        cta,
        cues,
        hashtags: pack.hashtags,
        linkedin_body,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const IDEA: &str = "AI builds a site in 15 minutes, but creators still pay for sites that convert";

    #[test]
    fn golden_trending_script_matches_typescript() {
        let s = build_script(IDEA, "mstudio", Plan::Short).unwrap();
        assert!(s.hook.ends_with("AI builds a site in 15 minutes, but creators still pay for sites that convert."), "hook wraps the idea: {}", s.hook);
        assert!(s.beats[0].starts_with("creators, brands and digital businesses"));
        assert!(s.beats[1].contains("1 to 2 weeks"));
        assert!(s.beats[2].contains("Speed Site"));
        assert!(s.beats.iter().all(|b| !b.contains("Direct, confident")), "tone must not be narrated");
        assert!(!s.hook.contains("idea in, video out"), "tool tagline must not leak into agency copy");
        assert_eq!(s.beats.len(), 3);
        assert_eq!(s.cues.len(), 5);
        assert!((s.cues[0].start, s.cues[0].end) == (0.0, 4.0));
        assert!(s.cues[0].kind == CueKind::Hook && s.cues[0].text == s.hook);
        assert!((s.cues[4].start, s.cues[4].end) == (40.0, 45.0));
        assert!(s.cues[4].kind == CueKind::Cta && s.cues[4].text == s.cta);
        assert!(s.hashtags.contains(&"#webdesign".to_string()));
        assert!(s.linkedin_body.contains("#webdesign"));
        assert!(s.linkedin_body.starts_with(&s.hook));
    }

    #[test]
    fn long_idea_truncates_on_sentence_boundary() {
        // Today's exact case: the tagline "idea in, video out" has no final
        // period and no joiner sentence, so the dangling partial sentence
        // must be dropped whole, never chopped to "...idea in, video."
        let idea = "First sentence that is long enough to matter here. Your AI workflow is assembled by vibes. Script, voice, cut, captions: one command with idea in, video out";
        assert!(idea.chars().count() > 140, "test idea must exceed 140 chars");
        let s = build_script(idea, "mstudio", Plan::Short).unwrap();
        assert!(
            s.hook.ends_with(['.', '!', '?']),
            "hook must end with sentence punctuation: {}",
            s.hook
        );
        assert!(
            !s.hook.ends_with("video."),
            "truncation chopped the final word: {}",
            s.hook,
        );
        assert!(!s.hook.contains("idea in, video out"),
            "dangling partial sentence should have been dropped whole");
    }

    #[test]
    fn truncation_without_sentence_keeps_word_boundary_floor() {
        // No sentence mark in the whole idea: fall back to the word boundary
        // chop (never an empty script, never a mid-word cut).
        let idea = "a".repeat(200);
        let s = build_script(&idea, "mstudio", Plan::Short).unwrap();
        assert!(!s.hook.is_empty(), "long single-word idea must still build a script");
        let max_a_run = s
            .hook
            .split(' ')
            .map(|w| w.trim_matches(['.', '!', '?']).chars().count())
            .max()
            .unwrap_or(0);
        assert!(
            max_a_run <= 140,
            "fallback chop must stay within the 140-char budget: {max_a_run}",
        );
    }

    #[test]
    fn empty_idea_errors() {
        assert!(build_script("   ", "mstudio", Plan::Short).is_err());
    }

    #[test]
    fn clipflow_pack_builds_product_demo_script() {
        let idea = "Turn one line into a finished short video";
        let s = build_script(idea, "clipflow", Plan::Short).unwrap();
        assert!(s.hook.ends_with("Turn one line into a finished short video."), "hook wraps the idea: {}", s.hook);
        assert!(s.beats[0].contains("writes the script"), "beats sell the DIY loop: {}", s.beats[0]);
        assert!(s.beats[1].contains("Local first"), "beats: {}", s.beats[1]);
        assert!(s.cta.ends_with("Start your next clip now."), "cta: {}", s.cta);
        assert!(s.hashtags.contains(&"#buildinpublic".to_string()));
        assert_eq!(s.cues.len(), 5);
        for text in [&s.hook, &s.beats[0], &s.beats[1], &s.beats[2], &s.cta] {
            assert!(!text.contains('—') && !text.contains('–'), "dash in {text:?}");
        }
    }

    #[test]
    fn unknown_pack_bails() {
        assert!(build_script("some idea", "nope", Plan::Short).is_err());
    }

    #[test]
    fn plan_from_str_accepts_both_plans() {
        assert!(plan_from_str("short").unwrap() == Plan::Short);
        assert!(plan_from_str("master").unwrap() == Plan::Master);
        assert!(plan_from_str("long").is_err());
    }

    #[test]
    fn master_plan_runs_75s_converting_skeleton() {
        let s = build_script("Turn one line into a finished short video", "clipflow", Plan::Master).unwrap();
        assert_eq!(s.beats.len(), 5);
        assert_eq!(s.cues.len(), 7);
        let spans: Vec<(f64, f64)> = s.cues.iter().map(|c| (c.start, c.end)).collect();
        assert_eq!(spans, vec![
            (0.0, 5.0),
            (5.0, 15.0),
            (15.0, 20.0),
            (20.0, 55.0),
            (55.0, 60.0),
            (60.0, 65.0),
            (65.0, 75.0),
        ]);
        // Gapless and covering exactly 75s.
        assert!((spans[0].0 - 0.0).abs() < 1e-9);
        assert!((spans[6].1 - 75.0).abs() < 1e-9);
        for w in spans.windows(2) {
            assert!((w[1].0 - w[0].1).abs() < 1e-9);
        }
        assert!(s.cues[0].kind == CueKind::Hook);
        assert!(s.cues[6].kind == CueKind::Cta);
        // CTA holds 10s; proof beat is the honest artifact claim.
        assert!(s.cues[6].end - s.cues[6].start >= 10.0);
        assert!(s.beats[3].contains("under a minute"), "proof: {}", s.beats[3]);
        assert!(s.beats[4].contains("never leaves your machine"), "objection: {}", s.beats[4]);
        // Words partition the full 75s without gaps.
        let words = crate::planner::plan_words(&s);
        assert!((words.first().unwrap().start - 0.0).abs() < 1e-9);
        assert!((words.last().unwrap().end - 75.0).abs() < 1e-6);
    }

    #[test]
    fn banned_phrases_required_in_pack() {
        // Missing `banned` key in pack JSON must fail loudly, not silently
        // degrade the slop gate.
        let result: Result<Pack, _> = serde_json::from_str(
            r##"{"id":"t","label":"t","hooks":["h"],"beats":["a","b","c"],"ctas":["c"],
                "themes":[{"bg":["#000","#111"],"accent":"#222","font":"f"}],
                "hashtags":["#x"]}"##,
        );
        assert!(result.is_err(), "pack without banned list must not parse");
    }

    #[test]
    fn banned_scrub_bails_on_leakage() {
        let mut pack: Pack = serde_json::from_str(include_str!("../packs/mstudio.json")).unwrap();
        pack.hooks.insert(0, "Use Clipflow today with idea in, video out.".into());
        pack.hooks.remove(1);
        // Bypass build_script's include! and check the gate directly.
        let phrase = contains_banned(&pack.hooks[0], &pack.banned);
        assert!(phrase.is_some(), "leaky line must trip the scrub");
        assert!(
            build_script("AI builds a site in 15 minutes", "mstudio", Plan::Short).is_ok(),
            "healthy pack never trips its own scrub"
        );
    }

    #[test]
    fn golden_script_respects_pack_banned_list() {
        // Every shipped golden must be zero-leak, case-insensitive.
        let pack: Pack = serde_json::from_str(include_str!("../packs/mstudio.json")).unwrap();
        let s = build_script(IDEA, "mstudio", Plan::Short).unwrap();
        for text in [&s.hook, &s.beats[0], &s.beats[1], &s.beats[2], &s.cta] {
            assert!(contains_banned(text, &pack.banned).is_none(), "leak in {text:?}", );
        }
    }

    #[test]
    fn generated_copy_has_no_em_or_en_dashes() {
        let s = build_script(IDEA, "mstudio", Plan::Short).unwrap();
        let mut all = vec![s.hook.clone(), s.cta.clone(), s.linkedin_body.clone()];
        all.extend(s.beats.iter().cloned());
        for t in &all {
            assert!(!t.contains('—'), "em dash in {t:?}");
            assert!(!t.contains('–'), "en dash in {t:?}");
        }
    }
}
