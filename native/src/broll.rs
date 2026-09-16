use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum AssetKind {
    Image,
    Video,
}

#[derive(Debug, Clone, Copy)]
pub struct PoolEntry {
    pub kind: AssetKind,
    pub src: &'static str,
    pub keywords: &'static [&'static str],
}

// Task 2 constant values, copied verbatim to keep modules decoupled.
const NICHE: &str = "web design, development and AI automation studio";
const AUDIENCE: &str = "creators, personal brands and digital businesses";
const OFFER: &str = "fixed-price Speed Site, Brand + Website System and AI Automation Build";
const TONE: &str = "direct, confident, zero fluff";
const PROOF: &str = "ships in 1–2 weeks, documented handoff, you own the code";

// Local stock pool: 25 shipped photos + 6 motion clip slots.
// Verbatim port of src/lib/broll.ts STOCK_POOL (src + keywords).
pub static STOCK_POOL: [PoolEntry; 31] = [
    PoolEntry { kind: AssetKind::Image, src: "/broll/1.jpg", keywords: &["desk", "workspace", "laptop", "work", "office", "website", "design"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/2.jpg", keywords: &["team", "meeting", "office", "business", "people", "ship", "startup"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/3.jpg", keywords: &["code", "developer", "screen", "dark", "build", "website", "automation"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/4.jpg", keywords: &["brand", "design", "creative", "studio", "art", "style"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/5.jpg", keywords: &["phone", "mobile", "vertical", "social", "creator", "content", "tiktok"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/6.jpg", keywords: &["city", "night", "lights", "hustle", "business", "launch"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/7.jpg", keywords: &["hand", "writing", "plan", "price", "fixed", "contract", "offer"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/8.jpg", keywords: &["success", "proof", "results", "growth", "chart", "win"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/9.jpg", keywords: &["cta", "action", "button", "click", "website", "ship", "weeks"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/10.jpg", keywords: &["laptop", "typing", "desk", "work", "closeup", "hands", "build"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/11.jpg", keywords: &["team", "meeting", "office", "people", "startup", "collaborate", "ship"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/12.jpg", keywords: &["code", "developer", "screen", "dark", "automation", "dashboard", "build"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/13.jpg", keywords: &["brand", "design", "mockup", "before", "after", "website", "style"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/14.jpg", keywords: &["phone", "creator", "vertical", "social", "scroll", "content", "tiktok"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/15.jpg", keywords: &["city", "night", "aerial", "hustle", "launch", "lights", "business"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/16.jpg", keywords: &["hands", "typing", "keyboard", "closeup", "work", "laptop", "craft"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/17.jpg", keywords: &["dashboard", "analytics", "automation", "screen", "data", "workflow", "proof"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/18.jpg", keywords: &["website", "mockup", "laptop", "design", "before", "after", "conversion"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/19.jpg", keywords: &["success", "win", "celebrate", "proof", "growth", "chart", "results"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/20.jpg", keywords: &["price", "contract", "fixed", "offer", "hand", "sign", "deal"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/21.jpg", keywords: &["studio", "creative", "design", "workspace", "art", "brand", "mockup"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/22.jpg", keywords: &["video", "creator", "phone", "vertical", "social", "content", "scroll"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/23.jpg", keywords: &["launch", "startup", "team", "ship", "office", "hustle", "win"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/24.jpg", keywords: &["automation", "workflow", "ai", "agent", "dashboard", "build", "code"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/25.jpg", keywords: &["cta", "button", "click", "action", "website", "ship", "start"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/clip-1.mp4", keywords: &["typing", "laptop", "code", "website", "build", "desk", "work"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/clip-2.mp4", keywords: &["team", "office", "meeting", "startup", "ship", "people", "business"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/clip-3.mp4", keywords: &["phone", "creator", "social", "vertical", "content", "scroll", "tiktok"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/clip-4.mp4", keywords: &["city", "aerial", "night", "hustle", "launch", "brand"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/clip-5.mp4", keywords: &["design", "brand", "creative", "studio", "mockup", "style"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/clip-6.mp4", keywords: &["cta", "success", "celebrate", "win", "proof", "growth", "action"] },
];

fn tokenize(text: &str) -> HashSet<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|t| t.len() >= 2)
        .map(|t| t.to_string())
        .collect()
}

fn score_entry(entry: &PoolEntry, tokens: &HashSet<String>) -> i32 {
    let mut score = 0;
    for kw in entry.keywords {
        let k = kw.to_lowercase();
        if tokens.contains(&k) {
            score += 2;
            continue;
        }
        if k.len() >= 4 {
            for t in tokens {
                if t.len() >= 4 && (t.contains(&k) || k.contains(t)) {
                    score += 1;
                    break;
                }
            }
        }
    }
    score
}

fn match_asset(query: &str, exclude: &HashSet<&str>) -> &'static PoolEntry {
    let tokens = tokenize(query);
    let mut best: &'static PoolEntry = &STOCK_POOL[0];
    let mut best_score = -1;
    for entry in STOCK_POOL.iter() {
        if exclude.contains(entry.src) {
            continue;
        }
        let s = score_entry(entry, &tokens);
        if s > best_score {
            best_score = s;
            best = entry;
        }
    }
    best
}

/// Assign 1 pool entry per cue. Distinct when possible; falls back to
/// repeats (first pool entry) once the pool is exhausted.
pub fn assign_cue_assets(idea: &str, cue_texts: &[String]) -> Vec<&'static PoolEntry> {
    let base = [idea, NICHE, AUDIENCE, OFFER, TONE, PROOF].join(" ");
    let mut used: HashSet<&str> = HashSet::new();
    cue_texts
        .iter()
        .map(|cue| {
            let entry = match_asset(&format!("{base} {cue}"), &used);
            used.insert(entry.src);
            entry
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cues() -> Vec<String> {
        vec![
            "hook text ship".into(),
            "beat1 team office".into(),
            "beat2 proof growth".into(),
            "beat3 offer price".into(),
            "cta click action".into(),
        ]
    }

    #[test]
    fn assigns_five_distinct_assets() {
        let out = assign_cue_assets("fixed-price websites that ship in two weeks", &cues());
        assert_eq!(out.len(), 5);
        let uniq: std::collections::HashSet<_> = out.iter().map(|e| e.src).collect();
        assert_eq!(uniq.len(), 5);
    }

    #[test]
    fn matched_entry_shares_a_token_with_its_full_query() {
        // assign_cue_assets scores base+cue tokens (TS parity), so overlap
        // is asserted against the full query, not cue-only tokens.
        const IDEA: &str = "fixed-price websites that ship in two weeks";
        const BASE: &str = "fixed-price websites that ship in two weeks web design, development and AI automation studio creators, personal brands and digital businesses fixed-price Speed Site, Brand + Website System and AI Automation Build direct, confident, zero fluff ships in 1–2 weeks, documented handoff, you own the code";
        let qs = cues();
        let out = assign_cue_assets(IDEA, &qs);
        assert_eq!(out.len(), 5);
        for (entry, query) in out.iter().zip(qs.iter()) {
            let full = format!("{BASE} {query}");
            let qtok: std::collections::HashSet<String> = full
                .to_lowercase()
                .split(|c: char| !c.is_ascii_alphanumeric())
                .filter(|t| t.len() >= 2)
                .map(|t| t.to_string())
                .collect();
            assert!(
                entry.keywords.iter().any(|k| qtok.contains(&k.to_lowercase())),
                "{} matched nothing in full query for {query}",
                entry.src
            );
        }
    }
}
