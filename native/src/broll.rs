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

// Boilerplate constants removed from scoring on 2026-09-17: matching judges
// only idea + cue tokens (see assign_cue_assets_with_usage) so NICHE/AUDIENCE
// words can no longer pull unfitting footage (measured: "studio" once
// matched a film-gear clip).

// Local stock pool: 26 shipped photos + 6 motion clip slots.
// Verbatim port of src/lib/broll.ts STOCK_POOL (src + keywords).
pub static STOCK_POOL: [PoolEntry; 57] = [
    // Still frame b-roll (Pexels batch 2026-09-17 + local code-editor synth):
    // tech-only per the no-visual-slop rule. Photos 1-25 junk/derived stock
    // was replaced wholesale; filters below keep the pool tech/workspace/urban.
    PoolEntry { kind: AssetKind::Image, src: "/broll/pexels/code-p01.jpg", keywords: &["code", "screen", "closeup", "programming", "dark"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/pexels/code-p02.jpg", keywords: &["code", "laptop", "developer", "work", "build"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/pexels/code-p03.jpg", keywords: &["terminal", "command", "screen", "code", "developer"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/pexels/screen-p04.jpg", keywords: &["dashboard", "charts", "analytics", "screen", "data"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/pexels/screen-p05.jpg", keywords: &["charts", "graphs", "monitor", "data", "metrics"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/pexels/screen-p06.jpg", keywords: &["ui", "design", "screen", "interface", "website"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/pexels/device-p07.jpg", keywords: &["phone", "hand", "smartphone", "mobile", "device"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/pexels/device-p08.jpg", keywords: &["laptop", "keyboard", "typing", "hands", "work"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/pexels/device-p09.jpg", keywords: &["phone", "screen", "closeup", "touch", "device", "social"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/pexels/desk-p10.jpg", keywords: &["desk", "setup", "monitor", "keyboard", "workspace", "dark", "minimal"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/pexels/desk-p11.jpg", keywords: &["workspace", "desk", "keyboard", "office", "work", "clean"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/pexels/desk-p12.jpg", keywords: &["office", "desk", "night", "lights", "workspace", "late"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/pexels/city-p13.jpg", keywords: &["city", "skyline", "night", "vertical", "urban"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/pexels/city-p14.jpg", keywords: &["skyscrapers", "dusk", "city", "vertical", "urban", "calm"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/pexels/notebook-p15.jpg", keywords: &["notebook", "sketch", "desk", "plan", "wireframe", "design"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/pexels/server-p16.jpg", keywords: &["server", "data", "automation", "cloud", "backend"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/pexels/meeting-p17.jpg", keywords: &["meeting", "conversation", "laptop", "client", "business", "call"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/pexels/coffee-p18.jpg", keywords: &["coffee", "laptop", "desk", "cafe", "morning", "calm"] },
    PoolEntry { kind: AssetKind::Image, src: "/broll/26.jpg", keywords: &["code", "editor", "screen", "dark", "typescript", "website", "build", "developer"] },
    // Motion clips: 2 legacy Ken Burns renders + 15 Pexels verticals (<=6s, silent).
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/clip-4.mp4", keywords: &["laptop", "website", "wireframe", "design", "mockup", "webdesign", "plan", "desk"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/clip-6.mp4", keywords: &["laptop", "typing", "hands", "keyboard", "desk", "work", "macbook", "coffee"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/typing-v01.mp4", keywords: &["code", "typing", "laptop", "programmer", "screen", "work"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/typing-v02.mp4", keywords: &["code", "terminal", "programming", "screen", "developer", "work"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/typing-v03.mp4", keywords: &["code", "software", "development", "screen", "engineer", "work"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/analyze-v04.mp4", keywords: &["dashboard", "charts", "data", "analytics", "screen", "metrics"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/analyze-v05.mp4", keywords: &["financial", "data", "monitor", "charts", "screen", "sales"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/analyze-v06.mp4", keywords: &["website", "pages", "laptop", "screen", "convert", "work"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/mobile-v07.mp4", keywords: &["phone", "smartphone", "mobile", "hand", "device", "vertical"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/mobile-v08.mp4", keywords: &["phone", "app", "mobile", "closeup", "device", "touch"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/mobile-v09.mp4", keywords: &["laptop", "keyboard", "typing", "hands", "desk", "work"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/office-v10.mp4", keywords: &["office", "desk", "workspace", "setup", "designer", "creative"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/office-v11.mp4", keywords: &["production", "studio", "crew", "behind", "gear", "setdesign"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/urban-v12.mp4", keywords: &["city", "night", "lights", "urban", "evening", "traffic"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/urban-v13.mp4", keywords: &["skyline", "dusk", "city", "vertical", "urban", "calm"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/flow-v14.mp4", keywords: &["coffee", "shop", "laptop", "morning", "cafe", "work"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/flow-v15.mp4", keywords: &["notebook", "sketch", "desk", "plan", "wireframe", "design"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/ai-v16.mp4", keywords: &["ai", "robot", "automation", "future", "machine", "tech"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/ai-v17.mp4", keywords: &["ai", "chatbot", "conversation", "prompt", "chat", "model"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/ai-v18.mp4", keywords: &["ai", "abstract", "digital", "pulse", "data", "future"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/focus-v19.mp4", keywords: &["developer", "thinking", "focus", "problem", "engineer", "work"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/focus-v20.mp4", keywords: &["late", "night", "working", "laptop", "hustle", "deadline"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/night-v21.mp4", keywords: &["traffic", "timelapse", "city", "night", "streaks", "urban"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/night-v22.mp4", keywords: &["metro", "subway", "ride", "commute", "urban", "city"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/macro-v23.mp4", keywords: &["keyboard", "macro", "keys", "mechanical", "typing", "detail"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/macro-v24.mp4", keywords: &["cursor", "click", "mouse", "closeup", "detail", "screen"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/team-v25.mp4", keywords: &["team", "meeting", "startup", "collaboration", "people", "agency"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/team-v26.mp4", keywords: &["colleagues", "working", "screen", "pair", "review", "team"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/growth-v27.mp4", keywords: &["sales", "growth", "presentation", "pitch", "results", "proof"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/growth-v28.mp4", keywords: &["marketing", "strategy", "whiteboard", "plan", "conversion", "idea"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/abstract-v29.mp4", keywords: &["abstract", "gradient", "blue", "motion", "calm", "minimal"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/abstract-v30.mp4", keywords: &["abstract", "particles", "data", "motion", "tech", "future"] },
    // Own product footage (scripts/shoot-websites.mjs): hero zoom-holds and
    // eased scrolls. The strongest b-roll for brand cues - websites on screen.
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/web-pontea-hero.mp4", keywords: &["pontea", "site", "app", "screen", "product", "brand"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/web-pontea-scroll.mp4", keywords: &["pontea", "saas", "dashboard", "screen", "product", "scroll"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/web-mstudioweb-hero.mp4", keywords: &["mstudio", "agency", "brand", "website", "webdesign", "convert"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/web-mstudioweb-scroll.mp4", keywords: &["mstudio", "portfolio", "projects", "ship", "website", "webdesign"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/web-clipflowapp-hero.mp4", keywords: &["clipflow", "idea", "video", "screen", "tool", "site"] },
    PoolEntry { kind: AssetKind::Video, src: "/broll/clips/web-clipflowapp-scroll.mp4", keywords: &["clipflow", "caption", "voice", "tool", "screen", "build"] },
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


/// Assign 1 pool entry per cue. Distinct when possible; falls back to
/// repeats (first pool entry) once the pool is exhausted.
/// The hook (first cue) is the most important: it gets a code bias so tech
/// videos open on code, never on lifestyle filler.
const HOOK_BOOST: &str = "code editor screen typescript website build";

/// Canonical photo source: `/broll/N.jpg` → N; motion clips map to the
/// photo they were rendered from (verified 2026-09-15). One source per
/// video: a photo and its motion twin never cover two different cues.
pub fn source_of(src: &str) -> &str {
    if let Some(rest) = src.strip_prefix("/broll/") {
        if let Some(num) = rest.strip_suffix(".jpg") {
            if !num.is_empty() && num.chars().all(|c| c.is_ascii_digit()) {
                return num;
            }
        }
    }
    match src {
        "/broll/clips/clip-1.mp4" => "13",
        "/broll/clips/clip-2.mp4" => "17",
        "/broll/clips/clip-3.mp4" => "22",
        "/broll/clips/clip-4.mp4" => "18",
        "/broll/clips/clip-5.mp4" => "23",
        "/broll/clips/clip-6.mp4" => "10",
        _ => src,
    }
}

/// Footage families for the per-video variety rule. The v5 post taught:
/// own-site takes are the strongest b-roll, but each site family may appear
/// at most once per video (a repeated scroll-through reads as filler).
pub fn family_of(src: &str) -> &'static str {
    if src.starts_with("/broll/clips/web-") {
        return "web";
    }
    if src.starts_with("/broll/pexels/") || src == "/broll/26.jpg" {
        return "photos";
    }
    if src.starts_with("/broll/clips/") {
        return "clips";
    }
    "misc"
}

/// Max uses of one family in a single video. Photos are cheapest to repeat
/// (still b-roll, 3 distinct stills still read fresh); web and clips cap
/// at one so takes never feel looped.
fn family_cap(family: &str) -> u32 {
    match family {
        "web" | "clips" => 1,
        "photos" => 3,
        _ => 1,
    }
}

pub struct BrollUsage {
    map: std::collections::HashMap<String, u64>,
    /// Per-source taste penalty from `--rate` (-2..+2 clips; persisted with
    /// the same canonical-source keys as map). Positive rating = surfaced,
    /// negative = demoted (10x stronger than any keyword score so a user
    /// dislike can never be out-scored by keyword luck).
    penalty: std::collections::HashMap<String, i32>,
}

/// On-disk usage: {"map":{...},"penalty":{...}}. Legacy flat-map files
/// (timestamps only) load unchanged via the fallback path.
#[derive(serde::Serialize, serde::Deserialize, Default)]
#[serde(deny_unknown_fields)]
struct UsageFile {
    #[serde(default)]
    map: std::collections::HashMap<String, u64>,
    #[serde(default)]
    penalty: std::collections::HashMap<String, i32>,
}

/// On-disk usage: legacy flat {src: timestamp} map.
impl Default for BrollUsage {
    fn default() -> Self {
        Self {
            map: Default::default(),
            penalty: Default::default(),
        }
    }
}
type FlatUsage = std::collections::HashMap<String, u64>;

/// Hours-resolution usage timestamps keyed by canonical source number
/// (see source_of). Missing keys mean the source was never rendered.
impl BrollUsage {
    pub fn is_recent(&self, entry: &PoolEntry, window_secs: u64, now: u64) -> bool {
        let last = self.last_used(entry);
        last > 0 && now.saturating_sub(last) < window_secs
    }

    pub fn last_used(&self, entry: &PoolEntry) -> u64 {
        self.map.get(source_of(entry.src)).copied().unwrap_or(0)
    }

    pub fn touch(&mut self, entry: &PoolEntry, now: u64) {
        self.map.insert(source_of(entry.src).to_string(), now);
    }

    // --rate persistence: key by canonical source like the map does.

    pub fn penalize(&mut self, entry_src: &str, by: i32) {
        self.penalty
            .entry(source_of(entry_src).to_string())
            .and_modify(|v| *v += by)
            .or_insert(by);
    }

    pub fn penalty_of(&self, entry: &PoolEntry) -> i32 {
        self.penalty.get(source_of(entry.src)).copied().unwrap_or(0)
    }

    /// Effective keyword score with taste penalty applied (10x weight,
    /// signed: -2 demotes, +2 surfaces).
    fn penalized_score(&self, entry: &PoolEntry, tokens: &HashSet<String>) -> i32 {
        score_entry(entry, tokens) + 10 * self.penalty_of(entry)
    }
}

pub fn rate_usage(
    ratings: &[(String, i32)],
    usage_path: &Option<std::path::PathBuf>,
) -> anyhow::Result<()> {
    let mut usage = load_usage(usage_path);
    for (src, value) in ratings {
        let entry = entry_by_src(src)
            .ok_or_else(|| anyhow::anyhow!("--rate src not in the pool: {src}"))?;
        if !(-2..=2).contains(value) {
            anyhow::bail!("rating must be -2..+2, got {value}");
        }
        usage.penalize(entry.src, *value);
    }
    save_usage(usage_path, &usage)?;
    Ok(())
}

pub fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn load_usage(path: &Option<std::path::PathBuf>) -> BrollUsage {
    if let Some(p) = path {
        if let Ok(text) = std::fs::read_to_string(p) {
            if let Ok(f) = serde_json::from_str::<UsageFile>(&text) {
                return BrollUsage { map: f.map, penalty: f.penalty };
            }
            // Legacy flat format: timestamps only.
            if let Ok(m) = serde_json::from_str::<FlatUsage>(&text) {
                return BrollUsage { map: m, penalty: Default::default() };
            }
        }
    }
    BrollUsage::default()
}

pub fn save_usage(path: &Option<std::path::PathBuf>, usage: &BrollUsage) -> std::io::Result<()> {
    let Some(p) = path else { return Ok(()) };
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let json = serde_json::to_string(&UsageFile {
        map: usage.map.clone(),
        penalty: usage.penalty.clone(),
    })?;
    std::fs::write(p, json)
}

pub fn assign_cue_assets(idea: &str, cue_texts: &[String]) -> Vec<&'static PoolEntry> {
    assign_cue_assets_with_usage(idea, cue_texts, &None)
}

/// Variant mode: same idea, deterministic salted picks so renders differ
/// between variants but stay reproducible for the same variant number
/// ("show me another take" = rerun with a higher variant index).
pub fn assign_cue_assets_variant(
    idea: &str,
    cue_texts: &[String],
    usage_path: &Option<std::path::PathBuf>,
    variant: u32,
) -> Vec<&'static PoolEntry> {
    assign_cue_assets_with_usage_salt(idea, cue_texts, usage_path, variant.wrapping_mul(0x9E3779B9))
}

/// Deterministic per-source jitter from the variant salt: shifts score by
/// -1/0/+1 so the same salt always picks the same set (reproducibility)
/// while different salts legitimately explore secondary matches.
fn variant_jitter(src: &str, salt: u32) -> i32 {
    if salt == 0 {
        return 0;
    }
    let mut h: u32 = salt;
    for c in src.chars() {
        h = h.wrapping_mul(31).wrapping_add(c as u32);
    }
    (h % 3) as i32 - 1
}

/// Pool lookup for pinned cues (CLI --cue-assets): exact src match, else None.
pub fn entry_by_src(src: &str) -> Option<&'static PoolEntry> {
    STOCK_POOL.iter().find(|e| e.src == src)
}

/// Parse a `--cue-assets` list ("src1,src2,...") into pool entries. Validates
/// the count equals the cue count and every src exists in the pool.
pub fn pinned_cue_assets(
    list: &str,
    cue_count: usize,
) -> anyhow::Result<Vec<&'static PoolEntry>> {
    let srcs: Vec<&str> = list.split(',').map(|s| s.trim()).collect();
    if srcs.len() != cue_count {
        anyhow::bail!(
            "--cue-assets expects {} srcs (one per cue), got {}",
            cue_count, srcs.len()
        );
    }
    let out = srcs
        .iter()
        .map(|src| {
            entry_by_src(src)
                .ok_or_else(|| anyhow::anyhow!("--cue-assets src not in the pool: {src}"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(out)
}

/// Footage rotation: one distinct photo source per cue, ranked by
/// (not used within the last 24h, keyword score, oldest last-used, pool
/// order). Yesterday's footage loses every tie; while any far-fresh source
/// remains, recently used ones are skipped entirely. Usage is persisted in
/// `usage_path` (<broll dir>/.broll-usage.json, written after each render)
/// so the CLI and the SaaS worker rotate the same pool across days.
pub fn assign_cue_assets_with_usage(
    idea: &str,
    cue_texts: &[String],
    usage_path: &Option<std::path::PathBuf>,
) -> Vec<&'static PoolEntry> {
    assign_cue_assets_with_usage_salt(idea, cue_texts, usage_path, 0)
}

pub fn assign_cue_assets_with_usage_salt(
    idea: &str,
    cue_texts: &[String],
    usage_path: &Option<std::path::PathBuf>,
    salt: u32,
) -> Vec<&'static PoolEntry> {
    const RECENT_WINDOW_SECS: u64 = 24 * 60 * 60;
    let now = now_secs();
    let mut usage = load_usage(usage_path);
    let mut used_src: HashSet<&str> = HashSet::new();
    let mut used_source: HashSet<&str> = HashSet::new();
    let mut out = Vec::with_capacity(cue_texts.len());
    // The matcher judges the idea + cue words ONLY. Boilerplate (NICHE,
    // AUDIENCE, OFFER, ...) is excluded: its tokens ("code", "website",
    // "studio") once pulled footage that looked like film gear instead of
    // tech work. Boilerplate still governs which pool files exist on disk.
    let idea_tokens = tokenize(idea);
    // Family caps keep any one visual family from dominating a video
    // (learned 2026-09-18: three consecutive site scrolls read as filler).
    let mut fam_count: std::collections::HashMap<&'static str, u32> =
        std::collections::HashMap::new();
    for (i, cue) in cue_texts.iter().enumerate() {
        let mut tokens = idea_tokens.clone();
        tokens.extend(tokenize(cue));
        if i == 0 {
            tokens.extend(tokenize(HOOK_BOOST));
        }
        // 1: capped pick. 2: least-loaded family (all caps hit: violate
        // the EASTER-EGG cap for the family with the fewest uses rather
        // than re-looping the same family). 3: unconstrained (pool edge).
        let mut entry =
            match pick_entry_capped(&tokens, &used_src, &usage, now, RECENT_WINDOW_SECS, &fam_count, salt)
            {
                Some(e) => e,
                None => pick_entry_minfam(
                    &tokens,
                    &used_src,
                    &usage,
                    now,
                    RECENT_WINDOW_SECS,
                    &fam_count,
                    salt,
                ),
            };
        let mut guard = 0usize;
        while used_source.contains(source_of(entry.src)) && guard < STOCK_POOL.len() {
            used_src.insert(entry.src);
            entry = match pick_entry_capped(
                &tokens,
                &used_src,
                &usage,
                now,
                RECENT_WINDOW_SECS,
                &fam_count,
                salt,
            ) {
                Some(e) => e,
                None => pick_entry_minfam(
                    &tokens,
                    &used_src,
                    &usage,
                    now,
                    RECENT_WINDOW_SECS,
                    &fam_count,
                    salt,
                ),
            };
            guard += 1;
        }
        used_src.insert(entry.src);
        used_source.insert(source_of(entry.src));
        *fam_count.entry(family_of(entry.src)).or_insert(0) += 1;
        usage.touch(entry, now);
        out.push(entry);
    }
    // Rotation state is best-effort: a missing/unwritable file must never
    // fail a render, it only degrades rotation.
    let _ = save_usage(usage_path, &usage);

    /// Same ranking as the uncapped pick but skipping families already at
    /// their per-video cap. Returns None when no entry remains under the caps.
    fn pick_entry_capped<'a>(
        tokens: &HashSet<String>,
        excluded: &HashSet<&str>,
        usage: &BrollUsage,
        now: u64,
        window: u64,
        fam_count: &std::collections::HashMap<&'static str, u32>,
        salt: u32,
    ) -> Option<&'a PoolEntry> {
        let mut best: Option<(bool, i32, u64, usize, &'a PoolEntry)> = None;
        for (idx, entry) in STOCK_POOL.iter().enumerate() {
            if excluded.contains(entry.src) {
                continue;
            }
            let family = family_of(entry.src);
            if fam_count.get(family).copied().unwrap_or(0) >= family_cap(family) {
                continue;
            }
            let key = (
                usage.is_recent(entry, window, now),
                -(usage.penalized_score(entry, tokens) + variant_jitter(entry.src, salt)),
                usage.last_used(entry),
                idx,
            );
            match best {
                Some(b) if key < (b.0, b.1, b.2, b.3) => {
                    best = Some((key.0, key.1, key.2, key.3, entry));
                }
                None => best = Some((key.0, key.1, key.2, key.3, entry)),
                _ => {}
            }
        }
        best.map(|b| b.4)
    }

    /// Fallback when every family is at its per-video cap: rank by family
    /// uses first (spread the damage), then the usual keys.
    fn pick_entry_minfam<'a>(
        tokens: &HashSet<String>,
        excluded: &HashSet<&str>,
        usage: &BrollUsage,
        now: u64,
        window: u64,
        fam_count: &std::collections::HashMap<&'static str, u32>,
        salt: u32,
    ) -> &'a PoolEntry {
        let mut best: Option<(u32, bool, i32, u64, usize, &'a PoolEntry)> = None;
        for (idx, entry) in STOCK_POOL.iter().enumerate() {
            if excluded.contains(entry.src) {
                continue;
            }
            let fam_use = fam_count.get(family_of(entry.src)).copied().unwrap_or(0);
            let key = (
                fam_use,
                usage.is_recent(entry, window, now),
                -(usage.penalized_score(entry, tokens) + variant_jitter(entry.src, salt)),
                usage.last_used(entry),
                idx,
            );
            match best {
                Some(b) if key < (b.0, b.1, b.2, b.3, b.4) => {
                    best = Some((key.0, key.1, key.2, key.3, key.4, entry));
                }
                None => best = Some((key.0, key.1, key.2, key.3, key.4, entry)),
                _ => {}
            }
        }
        best.map(|b| b.5).unwrap_or(&STOCK_POOL[0])
    }
    out
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

    #[allow(dead_code)]
    fn usage_all_recent() -> BrollUsage {
        let mut usage = BrollUsage::default();
        let now = now_secs();
        for entry in STOCK_POOL.iter() {
            usage.touch(entry, now);
        }
        usage
    }

    #[test]
    fn usage_roundtrip_tracks_canonical_sources() {
        let mut usage = BrollUsage::default();
        let photo = STOCK_POOL.iter().find(|e| e.src == "/broll/pexels/desk-p10.jpg").unwrap();
        assert!(!usage.is_recent(photo, 60, now_secs()));
        usage.touch(photo, now_secs() - 30);
        assert!(usage.is_recent(photo, 60, now_secs()));
        // Clip and photo entries that share canonical source bundle via
        // source_of; pexels photos are their own canonical source.
        let code = STOCK_POOL.iter().find(|e| e.src == "/broll/pexels/code-p01.jpg").unwrap();
        assert!(!usage.is_recent(code, 60, now_secs()));
    }

    #[test]
    fn recent_entries_are_skipped_while_fresh_remain() {
        let usage_path = std::env::temp_dir().join("broll-usage-test.json");
        let fresh = assign_cue_assets("code editor screen typescript website build", &cues());
        assert_eq!(fresh[0].src, "/broll/26.jpg");
        // Mark the yesterday picks exactly like the CLI would: touch only
        // the sources the previous render used, write, re-run: the hook
        // must move off 26.jpg (its motion twin stays off too).
        let mut usage = BrollUsage::default();
        let code26 = STOCK_POOL.iter().find(|e| e.src == "/broll/26.jpg").unwrap();
        usage.touch(code26, now_secs());
        let buf = serde_json::to_string(&usage.map).unwrap();
        std::fs::write(&usage_path, buf).unwrap();
        let rotated = assign_cue_assets_with_usage(
            "code editor screen typescript website build",
            &cues(),
            &Some(usage_path.clone()),
        );
        assert_ne!(rotated[0].src, "/broll/26.jpg");
        let distinct: std::collections::HashSet<_> = rotated.iter().map(|e| e.src).collect();
        assert_eq!(distinct.len(), cues().len());
        std::fs::remove_file(&usage_path).ok();
    }

    #[test]
    fn exhaust_falls_back_to_recent_sources() {
        // All recent (worst case): distinct assignment must still happen.
        let n = assign_cue_assets_with_usage(
            "fixed-price websites that ship in two weeks",
            &cues(),
            &Some(std::env::temp_dir().join("missing-broll-usage.json")),
        );
        assert_eq!(n.len(), 5);
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
        const BASE: &str = "fixed-price websites that ship in two weeks web design, development and AI automation studio creators, personal brands and digital businesses fixed-price Speed Site, Brand + Website System and AI Automation Build Direct, confident, zero fluff ships in 1-2 weeks, documented handoff, you own the code";
        let qs = cues();
        let out = assign_cue_assets(IDEA, &qs);
        assert_eq!(out.len(), 5);
        for (i, (entry, query)) in out.iter().zip(qs.iter()).enumerate() {
            let full = if i == 0 {
                format!("{BASE} {query} {HOOK_BOOST}")
            } else {
                format!("{BASE} {query}")
            };
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

    #[test]
    fn hook_bias_picks_code_on_screen() {
        let hook = "Does your site load in under a second? Are your clients still waiting? AI builds a site in 15 minutes, but creators still pay for sites that convert.".to_string();
        let out = assign_cue_assets(
            "AI builds a site in 15 minutes, but creators still pay for sites that convert",
            &[hook, "beat one".into(), "beat two".into(), "beat three".into(), "cta".into()],
        );
        assert_eq!(out[0].src, "/broll/26.jpg");
    }

    #[test]
    fn penalty_dominates_keyword_score() {
        // 26.jpg wins the hook on raw score; a -2 rating must push a
        // different entry to the top even though every keyword favors it.
        let path = std::env::temp_dir().join("broll-penalty-test.json");
        let mut usage = BrollUsage::default();
        let code26 = STOCK_POOL.iter().find(|e| e.src == "/broll/26.jpg").unwrap();
        usage.penalize(code26.src, -2);
        std::fs::write(&path, serde_json::to_string(&UsageFile {
            map: usage.map.clone(),
            penalty: usage.penalty.clone(),
        }).unwrap()).unwrap();
        let out = assign_cue_assets_with_usage(
            "code editor screen typescript website build", &cues(), &Some(path.clone()),
        );
        assert_ne!(out[0].src, "/broll/26.jpg");
        assert_eq!(usage.penalty_of(code26), -2);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn positive_rating_surfaces_disliked_clips_again() {
        // A +2 rating on a stale-pick source must out-rank its peers.
        let mut usage = BrollUsage::default();
        let office = STOCK_POOL.iter().find(|e| e.src == "/broll/clips/office-v10.mp4").unwrap();
        usage.penalize(office.src, 2);
        assert!(usage.penalty_of(office) > 0);
    }

    #[test]
    fn legacy_flat_usage_file_still_loads() {
        let path = std::env::temp_dir().join("broll-legacy-test.json");
        std::fs::write(
            &path,
            format!(r#"{{"26": {}, "10": {}}}"#, now_secs(), now_secs() - 1000),
        )
        .unwrap();
        let usage = load_usage(&Some(path.clone()));
        let code26 = STOCK_POOL.iter().find(|e| e.src == "/broll/26.jpg").unwrap();
        let office = STOCK_POOL.iter().find(|e| e.src == "/broll/clips/office-v10.mp4").unwrap();
        assert!(usage.is_recent(code26, 60, now_secs()));
        assert_eq!(usage.penalty_of(code26), 0);
        assert_eq!(usage.penalty_of(office), 0);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn rate_usage_rejects_bad_input() {
        let res = rate_usage(
            &[("/broll/26.jpg".to_string(), 5)],
            &None,
        );
        assert!(res.is_err(), "rating 5 outside -2..+2 must bail");
        let res = rate_usage(
            &[("/broll/not-in-pool.mp4".to_string(), 1)],
            &None,
        );
        assert!(res.is_err(), "unknown pool src must bail");
    }

    #[test]
    fn variants_are_deterministic_and_not_identical() {
        let idea = "agency webdesign ship website convert brand";
        let a = assign_cue_assets_variant(idea, &cues(), &None, 1);
        let a2 = assign_cue_assets_variant(idea, &cues(), &None, 1);
        let b = assign_cue_assets_variant(idea, &cues(), &None, 2);
        let key = |v: &[&PoolEntry]| v.iter().map(|e| e.src).collect::<Vec<_>>();
        assert_eq!(key(&a), key(&a2), "same variant must be reproducible");
        assert_ne!(key(&a), key(&b), "variant 2 must explore other picks");
        let web = b.iter().filter(|e| family_of(e.src) == "web").count();
        assert!(web <= 1, "variant broke family caps: web used {}x", web);
    }

    #[test]
    fn variant_jitter_is_bounded() {
        assert_eq!(variant_jitter("/broll/26.jpg", 0), 0, "unsalted = no jitter");
        for entry in STOCK_POOL.iter() {
            let j = variant_jitter(entry.src, 12345);
            assert!((-1..=1).contains(&j), "jitter out of range for {}: {}", entry.src, j);
        }
    }

    #[test]
    fn source_of_maps_clips_to_photos() {
        assert_eq!(source_of("/broll/18.jpg"), "18");
        assert_eq!(source_of("/broll/clips/clip-4.mp4"), "18");
        assert_eq!(source_of("/broll/clips/clip-6.mp4"), "10");
    }

    #[test]
    fn family_of_partitions_the_pool() {
        let uniq: std::collections::HashSet<_> =
            STOCK_POOL.iter().map(|e| family_of(e.src)).collect();
        assert!(uniq.len() <= 3, "unexpected families: {uniq:?}");
        assert_eq!(family_of("/broll/clips/web-mstudioweb-hero.mp4"), "web");
        assert_eq!(family_of("/broll/26.jpg"), "photos");
        assert_eq!(family_of("/broll/clips/typing-v01.mp4"), "clips");
        assert_eq!(family_of("/etc/passwd"), "misc");
    }

    #[test]
    fn family_caps_hold_per_video() {
        // Web-heavy idea and cues: without caps every pick would be a
        // site take; with caps at most one web family entry appears.
        let idea = "mstudio agency webdesign ship website portfolio grow the brand and convert";
        let out = assign_cue_assets(idea, &cues());
        let web = out.iter().filter(|e| family_of(e.src) == "web").count();
        let clips = out.iter().filter(|e| family_of(e.src) == "clips").count();
        let photos = out.iter().filter(|e| family_of(e.src) == "photos").count();
        assert!(web <= 1, "web family used {web} times in one video");
        assert!(clips <= 1, "clips family used {clips} times in one video");
        assert!(photos <= 3, "photos family used {photos} times in one video");
        assert_eq!(out.len(), 5);
    }

    #[test]
    fn exhausted_families_fall_back_without_panic() {
        // 5 cues against caps of 1+1+2=4 slots: the tail cue must still
        // get an asset (unconstrained fallback), never crash or dup src.
        let out = assign_cue_assets("agency webdesign ship website", &cues());
        assert_eq!(out.len(), 5);
        let uniq: std::collections::HashSet<_> = out.iter().map(|e| e.src).collect();
        assert_eq!(uniq.len(), 5);
    }

    #[test]
    fn assigns_five_distinct_sources() {
        let out = assign_cue_assets(
            "AI builds a site in 15 minutes, but creators still pay for sites that convert",
            &[
                "hook text ship".into(),
                "beat1 team office".into(),
                "beat2 proof growth".into(),
                "beat3 offer price".into(),
                "cta click action".into(),
            ],
        );
        let uniq: std::collections::HashSet<_> =
            out.iter().map(|e| source_of(e.src)).collect();
        assert_eq!(uniq.len(), 5);
    }
}
