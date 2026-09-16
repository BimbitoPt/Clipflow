use serde::Deserialize;

const NICHE: &str = "web design, development and AI automation studio";
const AUDIENCE: &str = "creators, personal brands and digital businesses";
const OFFER: &str = "fixed-price Speed Site, Brand + Website System and AI Automation Build";
const TONE: &str = "direct, confident, zero fluff";
const PROOF: &str = "ships in 1–2 weeks, documented handoff, you own the code";

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
    pub beats: [String; 3],
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
    ctas: Vec<String>,
    themes: Vec<Theme>,
    hashtags: Vec<String>,
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

pub fn build_script(idea: &str) -> anyhow::Result<Script> {
    let pack: Pack = serde_json::from_str(include_str!("../packs/mstudio.json"))?;
    let _ = (pack.id, pack.label, pack.themes);

    let mut clean = idea.split_whitespace().collect::<Vec<_>>().join(" ");
    if clean.is_empty() {
        anyhow::bail!("E_EMPTY_IDEA");
    }
    if clean.chars().count() > 140 {
        let truncated: String = clean.chars().take(140).collect();
        clean = match truncated.rsplit_once(' ') {
            Some((head, _)) => head.to_string(),
            None => truncated,
        };
        if clean.is_empty() {
            anyhow::bail!("E_EMPTY_IDEA");
        }
    }

    let hook = format!("{} {}.", pick(&pack.hooks, &clean)?, clean);
    let beats: [String; 3] = [
        format!("{AUDIENCE} keep losing to competitors who look finished."),
        format!("Proof: {PROOF}."),
        format!("You get {OFFER} — {TONE}."),
    ];
    let cta = pick(&pack.ctas, &(clean.clone() + "\n" + NICHE))?;

    let cues = vec![
        Cue { start: 0.0, end: 4.0, kind: CueKind::Hook, text: hook.clone() },
        Cue { start: 4.0, end: 16.0, kind: CueKind::Beat, text: beats[0].clone() },
        Cue { start: 16.0, end: 28.0, kind: CueKind::Beat, text: beats[1].clone() },
        Cue { start: 28.0, end: 40.0, kind: CueKind::Beat, text: beats[2].clone() },
        Cue { start: 40.0, end: 45.0, kind: CueKind::Cta, text: cta.clone() },
    ];

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
        let s = build_script(IDEA).unwrap();
        assert_eq!(s.hook, "Does your site load in under a second? Are your clients still waiting? AI builds a site in 15 minutes, but creators still pay for sites that convert.");
        assert_eq!(s.cta, "Link in bio — fixed price, fixed timeline, shipped.");
        assert_eq!(s.beats.len(), 3);
        assert!(s.beats[1].contains("1–2 weeks"));
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
    fn empty_idea_errors() {
        assert!(build_script("   ").is_err());
    }
}
