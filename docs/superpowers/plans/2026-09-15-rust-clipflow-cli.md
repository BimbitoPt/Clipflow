# Rust Clipflow CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a cross-platform `clipflow` CLI in Rust that renders a 720x1280 marketing video (VO + word captions + motion b-roll) without a browser.

**Architecture:** New `native/` crate, PWA untouched. Deterministic TS logic (script/planner/broll) ported to Rust; SpeechT5 TTS via `ort` on vendored weights; video via `ffmpeg-sidecar` (Ken Burns + libass + AAC mux) using the filter graphs proven on 2026-09-15.

**Tech Stack:** Rust 1.96 (installed), crates: `clap` (derive), `serde`/`serde_json`, `ort`, `tokenizers`, `ffmpeg-sidecar`, `hound`, `anyhow`. System `ffmpeg` NOT required: render code calls `ffmpeg_sidecar::download::auto_download()` before first render (the sidecar does NOT download on its own).

## Global Constraints

- All new code lives under `native/`; do not modify `src/`, `public/`, or `exports/` layouts.
- Model weights stay vendored at `public/models/` (exact layout frozen: `Xenova/speecht5_tts/` + `Xenova/speecht5_hifigan/` + `speaker_embeddings.bin`); CLI resolves them via `--models` (default `../public/models` relative to crate, overridable).
- Output contract: `720x1280`, h264 + AAC 44.1kHz stereo, `+faststart`; caption files `<slug>-tiktok.txt`, `<slug>-x.txt`, `<slug>-linkedin.txt` with byte-identical format to the PWA.
- Rust edition 2021+, `cargo test` green after every task, `cargo clippy -- -D warnings` clean before merge.
- No new JS/TS dependencies. Commit after every task (`git add native/<files>` only).
- Crate layout (frozen for all tasks): package `clipflow`; `native/src/lib.rs` declares `pub mod script/planner/broll/tts/captions/render`; `native/src/main.rs` is CLI wiring only and uses `clipflow::...`; unit tests use `crate::...`, integration tests in `native/tests/` use `clipflow::...`.
- `Cargo.lock` is committed. Crate versions pinned in Task 1/5/7: if a major version differs at build time, STOP and report (API drift) — do not improvise.
- Path resolution is exe-relative: `default_models_dir()` = `current_exe().parent()/​../public/models` canonicalized (defined Task 5); `--models` overrides; `--out` is the ONLY output root (tests assert under it, never under repo `exports/`).

---

### Task 1: Scaffold crate + CLI skeleton

**Files:**
- Create: `native/Cargo.toml`
- Create: `native/src/main.rs`
- Create: `native/src/lib.rs` (starts as `// Clipflow native library; modules added Tasks 2-7`)
- Test: `native/tests/cli_help.rs` (assert `--help` lists `render`)

**Interfaces:**
- Consumes: nothing
- Produces: binary `clipflow` with subcommand `render --idea <STR> --pack <ID, default mstudio> --voice <on|sapi|off, default on> --out <DIR> --models <DIR>`

- [ ] **Step 1: Write the failing test**

```rust
// native/tests/cli_help.rs
use std::process::Command;

#[test]
fn help_lists_render() {
    let out = Command::new(env!("CARGO_BIN_EXE_clipflow"))
        .arg("--help")
        .output()
        .expect("run clipflow --help");
    let text = String::from_utf8_lossy(&out.stdout);
    assert!(out.status.success());
    assert!(text.contains("render"), "help was: {text}");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path native/Cargo.toml --test cli_help`
Expected: FAIL (no crate yet / binary missing)

- [ ] **Step 3: Write minimal implementation**

```toml
# native/Cargo.toml
[package]
name = "clipflow"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "clipflow"
path = "src/main.rs"

[dependencies]
clap = { version = "4", features = ["derive"] }
anyhow = "1"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

```rust
// native/src/lib.rs
// Clipflow native library; `pub mod` lines are appended by Tasks 2-7.
```

```rust
// native/src/main.rs
use anyhow::Result;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "clipflow", about = "Native Clipflow renderer")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    Render {
        #[arg(long)]
        idea: String,
        #[arg(long, default_value = "mstudio")]
        pack: String,
        #[arg(long, default_value = "on")]
        voice: String,
        #[arg(long, default_value = "exports")]
        out: String,
        #[arg(long, default_value = "../public/models")]
        models: String,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Render { idea, pack, voice, out, models } => {
            println!("render idea={idea:?} pack={pack} voice={voice} out={out} models={models}");
        }
    }
    Ok(())
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path native/Cargo.toml`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add native/Cargo.toml native/Cargo.lock native/src/main.rs native/src/lib.rs native/tests/cli_help.rs
git commit -m "feat(native): scaffold clipflow CLI with render subcommand"
```

---

### Task 2: Port deterministic script engine (golden vs TS)

**Files:**
- Create: `native/src/script.rs`
- Modify: `native/src/lib.rs` (append `pub mod script;`)
- Create: `native/packs/mstudio.json` (frozen copy of `src/packs/mstudio.json`; sync rule: if upstream pack changes, copy again and note it in the commit message)
- Test: `native/src/script.rs` `#[cfg(test)]` module (golden hook/cta + cue times)

**Interfaces:**
- Consumes: `native/packs/mstudio.json` (schema: `id,label,hooks,ctas,themes[{bg,accent,font}],hashtags` per `src/packs/mstudio.json:1-22`)
- Produces: `pub fn build_script(idea: &str) -> Result<Script>` with `pub struct Script { hook: String, beats: [String; 3], cta: String, cues: Vec<Cue>, hashtags: Vec<String>, linkedin_body: String }`, `pub struct Cue { start: f64, end: f64, kind: CueKind, text: String }`, `pub enum CueKind { Hook, Beat, Cta }`. `linkedin_body` formula (exact port of `src/lib/script.ts:48`): `variants[0] + "\n\n" + beats.join("\n") + "\n\n" + cta + "\n\n" + hashtags.join(" ")` where `variants[0]` is the hook.

Port rules (exact vs `src/lib/script.ts:16-50`):
- `pick()`: TS iterates Unicode code POINTS (`for...of`) but hashes `charCodeAt(0)` = first UTF-16 unit. Rust equivalent per char `c`: `let unit: u32 = if (c as u32) > 0xFFFF { 0xD800 + (((c as u32) - 0x10000) >> 10) } else { c as u32 }; h = h.wrapping_mul(31).wrapping_add(unit)`, index `arr[(h as usize) % arr.len()]`.
- Idea cleanup: `split_whitespace().join(" ")`; if char count > 140, take first 140 chars then strip a trailing partial word ONLY if a space exists (`rsplit_once(' ')`, keep head; if no space, keep all 140). Empty after cleanup → `bail!("E_EMPTY_IDEA")`.
- hook = `{pick(hooks, clean)} {clean}.`; cta = `pick(ctas, clean + "\n" + NICHE)`; beats/cues per constants below; cues `(0,4,Hook),(4,16,Beat),(16,28,Beat),(28,40,Beat),(40,45,Cta)` with each cue's `text` = its hook/beat/cta string.

- [ ] **Step 1: Write the failing test**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    const IDEA: &str = "AI builds a site in 15 minutes, but creators still pay for sites that convert";

    #[test]
    fn golden_trending_script_matches_typescript() {
        let s = build_script(IDEA).unwrap();
        assert_eq!(
            s.hook,
            "Does your site load in under a second? Are your clients still waiting? AI builds a site in 15 minutes, but creators still pay for sites that convert."
        );
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
```

(`build_script` returns `Result<Script>`; empty input → `Err("E_EMPTY_IDEA")`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path native/Cargo.toml script`
Expected: FAIL (`mod script` / function missing)

- [ ] **Step 3: Write minimal implementation**

```rust
// native/src/script.rs
use anyhow::{bail, Result};
use serde::Deserialize;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CueKind { Hook, Beat, Cta }

#[derive(Debug)]
pub struct Script {
    pub hook: String,
    pub beats: [String; 3],
    pub cta: String,
    pub cues: Vec<Cue>,
    pub hashtags: Vec<String>,
    pub linkedin_body: String,
}

#[derive(Debug, Clone)]
pub struct Cue {
    pub start: f64,
    pub end: f64,
    pub kind: CueKind,
    pub text: String,
}

#[derive(Deserialize)]
struct Pack { id: String, label: String, hooks: Vec<String>, ctas: Vec<String>, themes: Vec<Theme>, hashtags: Vec<String> }

#[derive(Deserialize)]
struct Theme { bg: (String, String), accent: String, font: String }

const NICHE: &str = "web design, development and AI automation studio";
const AUDIENCE: &str = "creators, personal brands and digital businesses";
const OFFER: &str = "fixed-price Speed Site, Brand + Website System and AI Automation Build";
const TONE: &str = "direct, confident, zero fluff";
const PROOF: &str = "ships in 1–2 weeks, documented handoff, you own the code";

fn pick<'a>(arr: &'a [String], seed: &str) -> &'a String {
    let mut h: u32 = 0;
    for c in seed.chars() {
        let unit: u32 = if (c as u32) > 0xFFFF {
            0xD800 + (((c as u32) - 0x10000) >> 10)
        } else {
            c as u32
        };
        h = h.wrapping_mul(31).wrapping_add(unit);
    }
    &arr[(h as usize) % arr.len()]
}
```

Golden derivation: expected hook/cta/beats text below is copied from `exports/mstudio-trending-script.txt:1-14` (TS output recorded 2026-09-15); cue times from `src/lib/script.ts:34-40`.

CAUTION: TS iterates UTF-16 code units (`charCodeAt`); Rust `encode_utf16()` above matches it. Pack JSON is loaded from `native/packs/mstudio.json` via `include_str!`. Idea cleanup: split_whitespace-join, truncate to 140 chars at last space. Beats/cues assembled per port rules above.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path native/Cargo.toml script`
Expected: PASS (golden strings match TS output recorded 2026-09-15)

- [ ] **Step 5: Commit**

```bash
git add native/src/script.rs native/src/lib.rs native/packs/mstudio.json
git commit -m "feat(native): port deterministic script engine with TS golden test"
```

---

### Task 3: Port planner (cue spans + word timing)

**Files:**
- Create: `native/src/planner.rs`
- Modify: `native/src/lib.rs` (append `pub mod planner;`)
- Test: inline `#[cfg(test)]` (spans cover 0–45 gapless; word spans partition cue; rescale maps to wav duration)

**Interfaces:**
- Consumes: `crate::script::{Script, CueKind}` (Task 2)
- Produces: `pub const VIDEO_SECS: f64 = 45.0; pub struct WordCue { pub word: String, pub start: f64, pub end: f64, pub cue_kind: CueKind } pub fn plan_words(script: &Script) -> Vec<WordCue>` — even-split per cue over whitespace tokens (exact port of `src/lib/planner.ts:55-71`); `pub fn rescale(words: &[WordCue], total_secs: f64) -> Vec<WordCue>` — multiplies every start/end by `total_secs / 45.0` (engine-parity helper only); `pub fn cue_bounds(counts: &[usize], total_secs: f64) -> Vec<(f64, f64)>` — count-proportional gapless partition of `total_secs` from 0 (cue `i` gets `total * counts[i] / sum`; all-zero/empty counts → equal split). Caption AND visual cue timing ALWAYS derive from `cue_bounds` with the real wav duration — rescaling engine spans mis-syncs speech (28 hook words would land in 3.7s).

- [ ] **Step 1: Write the failing test**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::script::build_script;

    const EPS: f64 = 1e-9;

    #[test]
    fn words_partition_every_cue_without_gaps() {
        let s = build_script("fixed-price websites that ship in two weeks").unwrap();
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
        let s = build_script("fixed-price websites that ship in two weeks").unwrap();
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path native/Cargo.toml planner`
Expected: FAIL (module missing)

- [ ] **Step 3: Write minimal implementation**

Port `planWords`: per cue, `tokens` = `text.split_whitespace()`, `span = end - start`, word `i` gets `start + span*i/n .. start + span*(i+1)/n`, `cue_kind` copied from the cue (field name matches TS `cueKind` in `src/lib/planner.ts:42-47`, snake-cased). `rescale` clones with scaled bounds.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path native/Cargo.toml`
Expected: PASS (all tests incl. Task 1–2)

- [ ] **Step 5: Commit**

```bash
git add native/src/planner.rs native/src/lib.rs
git commit -m "feat(native): port word-timing planner plus duration rescale"
```

---

### Task 4: Broll pool + matcher (distinct 5/5)

**Files:**
- Create: `native/src/broll.rs` (pool table for all 31 entries from `src/lib/broll.ts:21-53` — copy `src` + `keywords` verbatim; pool maps ONLY `clip-1..6.mp4` — `public/broll/clips/vo-*.mp4` are render artifacts, never pool entries)
- Modify: `native/src/lib.rs` (append `pub mod broll;`)
- Test: inline (5 distinct assets for the 5 cues; matched entry shares a token with the query)

**Interfaces:**
- Consumes: `idea: &str`, `cue_texts: &[String]`
- Produces: `pub struct PoolEntry { pub kind: AssetKind, pub src: &'static str, pub keywords: &'static [&'static str] } pub enum AssetKind { Image, Video } pub fn assign_cue_assets(idea: &str, cue_texts: &[String]) -> Vec<&'static PoolEntry>` — scoring exact port of `src/lib/broll.ts:55-109` (tokenize: lowercase, split non-alphanumeric, len>=2; +2 exact case-insensitive, +1 substring both len>=4; first-highest wins; `used` set forces distinct; base string = `[idea, NICHE, AUDIENCE, OFFER, TONE, PROOF].join(" ")` with Task 2 constants)

- [ ] **Step 1: Write the failing test**

```rust
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
        // (Corrected 2026-09-15: cue-only overlap is false for this base/pool
        // by construction — base affinity dominates. See results: cue 1 → 3.jpg.)
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
```

(BASE must match Task 2 constants byte-for-byte incl. U+2013 en-dash; executor verifies against native/src/script.rs.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path native/Cargo.toml broll`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Port `tokenizeQuery` (lowercase, split non-alphanumeric, len>=2), `scoreEntry`, `matchAsset` with exclude set, `assignCueAssets` with base string `[idea, NICHE, AUDIENCE, OFFER, TONE, PROOF].join(" ")`. Pool: 31 entries verbatim from `src/lib/broll.ts` (paths `/broll/1.jpg`…`/broll/25.jpg`, `/broll/clips/clip-1.mp4`…`clip-6.mp4`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path native/Cargo.toml`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add native/src/broll.rs native/src/lib.rs
git commit -m "feat(native): port broll pool and distinct asset matcher"
```

---

### Task 5: SpeechT5 TTS via `ort` → 16kHz WAV

**Files:**
- Create: `native/src/tts.rs`
- Modify: `native/Cargo.toml` (add `ort = "2.0.0-rc.13"` — no stable 2.x on crates.io as of 2026-09-15; `tokenizers = { version = "0.20", default-features = false, features = ["onig"] }` — default features break MSVC link via esaxx-rs `/MT` vs `/MD`; `hound = "3"` + same under `[dev-dependencies]`; if `ort` major is not 2.x, STOP and report)
- Modify: `native/src/lib.rs` (append `pub mod tts;`)
- Modify: `native/src/main.rs` (add `pub fn default_models_dir() -> std::path::PathBuf` = `current_exe().parent()/../public/models` canonicalized, fallback to the `--models` flag value; unit test asserts the path ends with `public/models`)
- Test: `native/tests/tts_fixture.rs` (synth 1 sentence → wav exists, 16000 Hz, duration > 1s; uses `clipflow::tts::synth_to_wav` — lib layout was frozen in Global Constraints)

**Interfaces:**
- Consumes: `models_dir: &Path` (vendored layout frozen), `text: &str`
- Produces: `pub fn synth_to_wav(models_dir: &std::path::Path, text: &str, wav_out: &std::path::Path) -> anyhow::Result<f64>` returning duration seconds; WAV always 16000 Hz mono i16 (via `hound`)

Load plan (matches `node_modules/@xenova/transformers` v2.17.2, verified 2026-09-15): Seq2Seq branch `src/models.js:767-773` loads sessions `encoder_model` + `decoder_model_merged` via `constructSession` (`src/models.js:120-144`: path `onnx/{name}_quantized.onnx` since default `quantized=true`); vocoder `DEFAULT_VOCODER_ID = "Xenova/speecht5_hifigan"` (`src/pipelines.js:2624`) loaded with `quantized:false` → `onnx/model.onnx`; tokenizer from `Xenova/speecht5_tts/tokenizer.json` via `tokenizers` crate WITH one narrowly-gated substitution (verified 2026-09-15): that file targets the JS tokenizer (`Precompiled` with `precompiled_charsmap: null`, `model` block without `type`) and does not load in tokenizers-rs directly — substitute in memory ONLY for that exact shape: normalizer → `Sequence(Nmt, NFKC)`, model → `WordLevel` with `unk_token "</s>"` (ids verified equal to JS on the fixture); any other shape → error, do not generalize; speaker embeddings `speaker_embeddings.bin` = 512 float32 LE (2048 bytes, verified size); generation config from `generation_config.json`. Reference implementation for the call order: `TextToAudioPipeline._call_text_to_spectrogram` (`src/pipelines.js:2669-2703`): tokenize → model encoder → autoregressive `decoder_model_merged` loop → vocoder (`decoder_postnet_and_vocoder`) mel→waveform at 16000 Hz.

`--voice` branching (frozen): `on` → this `ort` path (default, voice consistency); `sapi` → Windows-only `powershell System.Speech` synthesis to the same 16kHz WAV contract, `bail!` clearly on non-Windows; `off` → skip synthesis entirely (Task 8 omits the audio stream). System TTS is FORBIDDEN as the `on` implementation.

- [ ] **Step 1: Write the failing test**

```rust
// native/tests/tts_fixture.rs
use std::path::PathBuf;

#[test]
fn synth_fixture_produces_16k_wav() {
    let models = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../public/models");
    let out = std::env::temp_dir().join("clipflow-tts-fixture.wav");
    let dur = clipflow::tts::synth_to_wav(&models, "Does your site load in under a second?", &out).expect("synth");
    assert!(out.exists());
    let r = hound::WavReader::open(&out).unwrap();
    assert_eq!(r.spec().sample_rate, 16000);
    assert_eq!(r.spec().channels, 1);
    assert!(dur > 1.0, "duration was {dur}");
}
```

(`hound` is a dev-dependency too: add `hound = "3"` under `[dev-dependencies]` as well so the test compiles.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path native/Cargo.toml --test tts_fixture`
Expected: FAIL (no sessions wired)

- [ ] **Step 3: Write minimal implementation**

Implement `synth_to_wav` per load plan above. First run downloads nothing (weights local); `ort` may download its runtime dylib on first use — allowed (not a JS dep, cached by cargo).

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path native/Cargo.toml --test tts_fixture`
Expected: PASS (slow first run — model load; budget 10 min timeout)

- [ ] **Step 5: Commit**

```bash
git add native/Cargo.toml native/src/tts.rs native/src/lib.rs native/src/main.rs native/tests/tts_fixture.rs
git commit -m "feat(native): SpeechT5 TTS via ort to 16kHz WAV"
```

---

### Task 6: ASS caption writer (golden event count)

**Files:**
- Create: `native/src/captions.rs`
- Modify: `native/src/lib.rs` (append `pub mod captions;`)
- Test: inline `#[cfg(test)]` (82 Dialogue events for trending script: 77 words + 5 pills; first starts 0:00:00.00, last ends at total)

**Interfaces:**
- Consumes: `&crate::script::Script`, `&[crate::planner::WordCue]` (Task 3 `rescale()` output at the REAL wav duration), `total_secs: f64`, `PlayResX=720/PlayResY=1280`
- Produces: `pub fn write_ass(script: &Script, words_45s: &[WordCue], bounds: &[(f64, f64)], total_secs: f64, path: &Path) -> anyhow::Result<()>` — `words_45s` supplies token ORDER only; `bounds` (from `crate::planner::cue_bounds`, computed ONCE by the caller) is the single timing source — within-cue char-weighted spans (`weight = len(word)+1`) subdivide each bound. Group words into per-cue chunks by 45s-engine cue boundaries (word belongs to cue k while its engine start < cue[k+1].start, epsilon 1e-9); `bail!` if `bounds.len() != script.cues.len()`. NEVER rescale engine spans (mis-syncs speech). Format frozen to artifact `exports/mstudio-vo-captions.ass`: header + `[V4+ Styles]` (`Cap` Arial 58 white/black-outline Alignment 5 center MarginV 170; `Pill` Arial 40 accent Alignment 8 top MarginV 110) + one pill event per cue (full cue span, label text) + one event per word (word span, full wrapped cue line with current word wrapped `{\\1c&H00FD6B24&\\3c&H00000000&}WORD{\\1c&H00FFFFFF&\\3c&H80000000&}`, every line prefixed `{\\1c&H00FFFFFF&\\3c&H80000000&}`, lines joined with `\\N`, 20-char greedy wrap on split_whitespace tokens). Timestamp fmt `h:mm:ss.cs` (2-digit centiseconds).

Cue bounds rule (single-sourced, reconciles Task 3): cue `i` spans `rescale()`d words; bounds derive from the scaled words (first word start .. last word end), NOT recomputed from counts. The 20-char wrap MUST be computed on the same token list as the timing (split_whitespace), so line layout matches `exports/` artifact line-for-line modulo timestamps.

- [ ] **Step 1: Write the failing test**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::planner::plan_words;
    use crate::script::build_script;

    const IDEA: &str = "AI builds a site in 15 minutes, but creators still pay for sites that convert";

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
        let counts = [28usize, 13, 11, 18, 9];
        let bounds = crate::planner::cue_bounds(&counts, 42.12);
        let p = std::env::temp_dir().join("clipflow-cap-fixture.ass");
        write_ass(&s, &words, &bounds, 42.12, &p).unwrap();
        let text = std::fs::read_to_string(&p).unwrap();
        assert_eq!(text.matches("Dialogue:").count, 84);
        assert!(text.contains("0:00:00.00"));
        assert!(text.contains("HOOK"));
        assert!(text.contains(r"{\1c&H00FD6B24&\3c&H00000000&}"));
        assert!(text.contains("0:00:42.12"));
        assert!(text.contains("0:00:14.93"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path native/Cargo.toml captions`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Implement `write_ass` against the frozen artifact ONLY (no TS source exists): parse nothing — generate.cue bounds come from the passed (already rescaled) words: cue span = first word start .. last word end within that cue (match cue by `cue_kind` + order). Per word event: rebuild the cue's 20-char greedy wrap on `split_whitespace` tokens, wrap the current token as `{\\1c&H00FD6B24&\\3c&H00000000&}TOKEN{\\1c&H00FFFFFF&\\3c&H80000000&}`, join lines with `\\N`, prefix the line with `{\\1c&H00FFFFFF&\\3c&H80000000&}`. Timestamp fmt `h:mm:ss.cs` with 2-digit centiseconds, zero-padded (`0:00:04.38`). Pill events: `Dialogue: 0,{cue_start},{cue_end},Pill,,0,0,0,,{LABEL}` with labels `HOOK,BEAT 1,BEAT 2,BEAT 3,CTA` (map `CueKind::Beat` + cue index).

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path native/Cargo.toml`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add native/src/captions.rs native/src/lib.rs
git commit -m "feat(native): ASS word-caption writer with golden test"
```

---

### Task 7: Render fixture via ffmpeg-sidecar (fixture ONLY)

**Files:**
- Create: `native/src/render.rs`
- Modify: `native/Cargo.toml` (add `ffmpeg-sidecar = "2"`; if major differs, STOP and report)
- Modify: `native/src/lib.rs` (append `pub mod render;`)
- Create: `native/README.md` (prereqs: Rust 1.96+; NO system ffmpeg/ffprobe needed — render code calls `ffmpeg_sidecar::download::auto_download()` before first render; Windows/macOS/Linux supported)
- Test: `native/tests/render_fixture.rs` (renders 3s fixture from `public/broll/10.jpg` → mp4 exists, 720x1280 verified via sidecar-bundled ffprobe)

**Interfaces:**
- Consumes: image path, out path
- Produces: `pub fn render_fixture(image: &std::path::Path, out: &std::path::Path) -> anyhow::Result<()>` — implementation MUST call `ffmpeg_sidecar::download::auto_download()` first (sidecar does NOT download on its own; without this it silently falls back to system ffmpeg). Spawn: `-loop 1 -i {image}`, `-f lavfi -i anullsrc=r=44100:cl=stereo:d=3`, `-vf scale=1440:2560,zoompan=z='min(zoom+0.0015,1.30)':d=90:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=720x1280:fps=30`, map v+a, `-c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p -c:a aac -shortest -movflags +faststart`, overwrite output. (`-shortest` REQUIRED: `-loop 1` video is infinite while audio is 3s — without it the render never ends.) Return Err with captured stderr on non-zero exit.

- [ ] **Step 1: Write the failing test**

```rust
// native/tests/render_fixture.rs
use std::path::PathBuf;
use std::process::Command;

#[test]
fn fixture_renders_720x1280_mp4() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    let out = std::env::temp_dir().join("clipflow-render-fixture.mp4");
    clipflow::render::render_fixture(&root.join("public/broll/10.jpg"), &out).expect("render");
    assert!(out.exists());
    let ffprobe = ffmpeg_sidecar::ffprobe::ffprobe_path();
    let probe = Command::new(&ffprobe)
        .args(["-v", "error", "-select_streams", "v:0",
               "-show_entries", "stream=width,height",
               "-of", "csv=p=0"])
        .arg(&out)
        .output()
        .expect("probe video");
    assert_eq!(String::from_utf8_lossy(&probe.stdout).trim(), "720,1280");
}
```

Probe with the sidecar's bundled ffprobe — NOT the ffmpeg binary (ffmpeg has no `-select_streams`/`-show_entries` flags; probing through it always fails). If `ffmpeg_sidecar::ffprobe::ffprobe_path()` does not exist in the resolved version, parse `ffmpeg -i {out}` stderr for `720x1280` instead. Either way no system ffprobe is required. (`ffmpeg-sidecar` must be a dev-dependency too for test imports.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path native/Cargo.toml --test render_fixture`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`render_fixture` in `native/src/render.rs`: FIRST call `ffmpeg_sidecar::download::auto_download()` (else the sidecar silently uses system ffmpeg). Then spawn sidecar ffmpeg with `-loop 1 -i {image}`, `-f lavfi -i anullsrc=r=44100:cl=stereo:d=3`, filter `-vf` exactly the zoompan above, map both streams, flags per Interfaces INCLUDING `-shortest`. Return `Err` on non-zero exit (capture stderr into the error).

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path native/Cargo.toml --test render_fixture`
Expected: PASS (first run downloads static ffmpeg via sidecar — budget 10 min)

- [ ] **Step 5: Commit**

```bash
git add native/Cargo.toml native/Cargo.lock native/src/render.rs native/src/lib.rs native/tests/render_fixture.rs native/README.md
git commit -m "feat(native): ffmpeg-sidecar render fixture with probe test"
```

---

### Task 8: Full `render()` + end-to-end `render` command

**Files:**
- Modify: `native/src/render.rs` (add parameterized `render()`)
- Modify: `native/src/main.rs` (wire all modules in `Cmd::Render`)
- Test: `native/tests/e2e_trending.rs` (runs binary with `--out <tmp>`, asserts under `<tmp>`)

**Interfaces:**
- Consumes: all Tasks 1–7 outputs
- Produces: exit 0 + `<out>/<slug>-916.mp4` + `<out>/<slug>-tiktok.txt` + `<out>/<slug>-x.txt` + `<out>/<slug>-linkedin.txt`; slug rule (frozen): first 3 whitespace-separated idea tokens, lowercased, stripped to `[a-z0-9]`, joined with `-` (e.g. trending idea → `ai-builds-a`); overwrite existing files silently.

Flow in `main.rs`: `build_script` → `--pack` validated (only `mstudio`, else `bail!` listing supported packs) → `assign_cue_assets(idea, cue_texts)` → resolve each `/broll/...` src against the resolved models dir's parent (= repo `public/`, error clearly if missing) → voice branch: `on` = `synth_to_wav` (+ `sapi` = Windows-only System.Speech path, `bail!` on non-Windows; `off` = skip wav AND omit the audio stream) → `plan_words` (token order only) → `cue_bounds(&per_cue_word_counts, wav_duration)` computed ONCE and passed to BOTH visual scene switches AND `write_ass(script, words_45s, &bounds, wav_duration, ass)` → `render::render(&Job { images, wav_or_silent, ass, out })` where `pub struct Job { pub images: Vec<std::path::PathBuf>, pub wav: Option<std::path::PathBuf>, pub ass: std::path::PathBuf, pub out: std::path::PathBuf }` (`wav: None` = voice `off`, omit audio stream), per-image durations = the same `bounds` (zoompan `d` = round(span*30)). Models-dir resolution (frozen): `--models` flag value if that path exists, else exe-relative `../public/models`, else `bail!` naming both tried paths. Use `synth_to_wav`'s returned duration directly (do not re-read the wav). Caption txts with EXACT formulas: tiktok = `{hook} {hashtags.join(" ")}`; x = first 280 chars of `{hook} {cta}`; linkedin_body from `Script` (Task 2 formula = `src/lib/script.ts:48`). Slug safety (frozen): empty-after-strip slug → `bail!` naming the idea (never write `"-916.mp4"`); different ideas sharing a slug deterministically overwrite (documented, `-y` semantics — re-runs refresh). Intermediates (`{slug}.wav`, `{slug}.ass`) go to a unique temp subdir (`std::env::temp_dir()/clipflow-<pid>/`), never into `--out`; left on disk after failure for debugging, no cleanup on success (OS temp hygiene). Full `render()` filter (proven 2026-09-15, output must match the `exports/mstudio-vo-916.mp4` spec — verify with the sidecar ffmpeg probe as in Task 7): per-image zoompan at cue-bounds durations → concat → `drawbox=x=0:y=0:w=720:h=12:c=0x246BFD:t=fill` → `subtitles=ASS` → `format=yuv420p`; audio `-c:a aac -b:a 128k -ar 44100 -ac 2`; `-movflags +faststart -shortest`; preset veryfast, crf 20.

- [ ] **Step 1: Write the failing test**

```rust
// native/tests/e2e_trending.rs
use std::path::PathBuf;
use std::process::Command;

const IDEA: &str = "AI builds a site in 15 minutes, but creators still pay for sites that convert";

#[test]
#[ignore] // slow: full TTS + render (~5 min). Run explicitly.
fn trending_e2e_produces_postable_mp4() {
    let tmp = std::env::temp_dir().join("clipflow-e2e");
    std::fs::create_dir_all(&tmp).unwrap();
    let exe = PathBuf::from(env!("CARGO_BIN_EXE_clipflow"));
    let models = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../public/models");
    let st = Command::new(&exe)
        .args(["render", "--idea", IDEA, "--out"])
        .arg(&tmp)
        .args(["--models"])
        .arg(&models)
        .arg("--voice")
        .arg("on")
        .status()
        .expect("run clipflow render");
    assert!(st.success());
    let mp4 = tmp.join("ai-builds-a-916.mp4");
    assert!(mp4.exists(), "missing {mp4:?}");
    let ffprobe = ffmpeg_sidecar::ffprobe::ffprobe_path();
    let v = Command::new(&ffprobe)
        .args(["-v", "error", "-select_streams", "v:0",
               "-show_entries", "stream=width,height,codec_name",
               "-of", "csv=p=0"])
        .arg(&mp4)
        .output()
        .expect("probe video");
    assert!(v.status.success());
    assert_eq!(String::from_utf8_lossy(&v.stdout).trim(), "720,1280,h264");
    let a = Command::new(&ffprobe)
        .args(["-v", "error", "-select_streams", "a:0",
               "-show_entries", "stream=codec_name",
               "-of", "csv=p=0"])
        .arg(&mp4)
        .output()
        .expect("probe audio");
    assert!(a.status.success());
    assert_eq!(String::from_utf8_lossy(&a.stdout).trim(), "aac");
    let tiktok = std::fs::read_to_string(tmp.join("ai-builds-a-tiktok.txt")).unwrap();
    assert!(tiktok.contains("#webdesign"));
}
```

(`ffmpeg-sidecar` dev-dependency from Task 7 covers the probe import. `CARGO_BIN_EXE_<name>` works because the binary target is named `clipflow`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path native/Cargo.toml --test e2e_trending -- --ignored`
Expected: FAIL (wiring missing)

- [ ] **Step 3: Write minimal implementation**

Wire `main.rs` render path per flow above.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path native/Cargo.toml --test e2e_trending -- --ignored`
Expected: PASS, output playable 720x1280 with VO

- [ ] **Step 5: Commit**

```bash
git add native/src/main.rs native/src/render.rs native/tests/e2e_trending.rs
git commit -m "feat(native): end-to-end render command with postable output"
```

---

### Task 9: Docs + clippy + merge readiness

**Files:**
- Modify: `native/README.md` (created Task 7; append: usage examples, `--voice on|sapi|off` semantics incl. Windows-only `sapi` note, Tauri-next paragraph)
- Test: none (verification commands below)

- [ ] **Step 0: Pack sync check**

Run: `fc src\packs\mstudio.json native\packs\mstudio.json` (Windows) — expect identical. If upstream changed, copy it over and re-run Task 2 tests before proceeding.

- [ ] **Step 1: `cargo clippy` clean**

Run: `cargo clippy --manifest-path native/Cargo.toml --all-targets -- -D warnings`
Expected: zero warnings; fix any (commit as `fix(native): clippy`)

- [ ] **Step 2: Full suite green**

Run: `cargo test --manifest-path native/Cargo.toml` then the ignored e2e
Expected: all PASS

- [ ] **Step 3: Commit docs**

```bash
git add native/README.md
git commit -m "docs(native): usage and roadmap"
```

---

### Task 10: SAPI per-cue word times (true caption sync)

**Files:**
- Modify: `native/src/tts.rs` (add per-cue synth + event parse), `native/src/main.rs` (wire), `native/README.md` (one-line Voice note)
- Test: `native/tests/sapi_times.rs` (short fixture; SAPI-only — `#[ignore]` on non-Windows via early return, NOT #[ignore] attr: assert `cfg!(windows)` else return)

**Interfaces:**
- `pub struct CueWordTime { pub word_index: usize, pub start_secs: f64 }`
- `pub fn synth_sapi_cue(text: &str, wav_out: &Path) -> anyhow::Result<(f64, Vec<CueWordTime>)>` — shells powershell `System.Speech` at 16kHz/16-bit/mono (same voice/rate as `synth_sapi_to_wav`), captures `SpeakProgress` events as JSON (`pos`, `len`, `audioMs`), maps char pos → word index via split_whitespace spans (first event wins per word), returns wav duration + times. `bail!` on non-Windows (`sapi is Windows-only`). Missing words (no event) are NOT filled here — caller interpolates.
- main.rs SAPI/auto-Windows path: synth EACH cue text separately (hook, 3 beats, cta) → durations are the true cue bounds (no proportional model); word times offset by cumulative durations; missing words forward-filled at 0.38s steps then tail/head-compressed into remaining audio (same rules as the proven 2026-09-16 script). ort path unchanged (proportional `cue_bounds`). `off` unchanged (45s fallback).

- [ ] Steps 1-5 (TDD): failing test `native/tests/sapi_times.rs` asserting first word start < 0.5s, times non-decreasing, count within ±2 of token count for fixture "Link in bio. Fixed price."; run FAIL; implement; run PASS (timeout 600000); commit `feat(native): SAPI per-cue word times`.

### Task 11: Retention auto-cuts + timed chunk captions

**Files:**
- Modify: `native/src/captions.rs` (add `write_ass_timed`), `native/src/main.rs` (segment + wire), tests inline + e2e
- Test: captions unit (fixture timed words → chunk events with exact spans, accent on last token, \fs fit); e2e asserts unchanged (mp4/aac/hashtags)

**Interfaces:**
- `pub fn write_ass_timed(timed: &[(String, f64, f64)], path: &Path) -> anyhow::Result<()>` — chunks consecutive words (≤3 words, ≤16 chars, sentence-aware) with spans from word times (chunk end = next chunk start, last = total); same Chunk style (68/heavy/center, \fs fit) and last-token accent; NO pills; `bail!` on empty input.
- main.rs: subdivide every cue span into ≤2.4s segments; segment k of cue i renders assigned asset `(i+k)%5` (round-robin, never repeats previous — with 5 assets always satisfiable); per-image zoompan `d` from segment span; SAPI path feeds `write_ass_timed` with real times; ort/off paths build timed words from `cue_bounds` proportional spans (existing behavior, new function).

- [ ] Steps 1-5 (TDD): failing captions test first (exact spans on 6-word fixture); run FAIL; implement; run PASS; e2e ignored-run PASS (timeout 600000); commit `feat(native): timed chunk captions and retention cuts`.

### Task 12: Loudness-gated instrumented e2e

**Files:**
- Modify: `native/tests/e2e_trending.rs` (add assertions; no src changes expected)
- Test: same ignored e2e, extended gates below

**Interfaces:** none new — pure assertion upgrade on the Task 8 e2e.

**Gates (all measured with the sidecar ffmpeg binary, no new deps):**
- Loudness floor: `-af volumedetect -f null` on the AAC stream → parse `max_volume`; assert `max_volume > -12 dB` (raw ort output measured -26 dB on 2026-09-16; anything quieter than -12 dB fails the gate). Proves the `loudnorm` stage ran.
- Caption coverage: parse the intermediate `.ass` (kept in temp per debug-hygiene rule — e2e must resolve its path the same way `main.rs` does) → last event end within ±1.5s of probed mp4 duration; event count ≥ word count / 3 (chunking happened, no single-blob captions).
- Source diversity: 5 cue assets resolve to ≥4 distinct `source_of` ids (photo + motion-twin count as one — see `source_of` in `native/src/broll.rs`).
- Existing asserts stay (720x1280 h264 + aac + `#webdesign`).

- [ ] Steps 1-5 (TDD): extend e2e with the three gates (run FAILs on any silent/mismatched build); run PASS (timeout 600000); commit `test(native): loudness + coverage + diversity gates`.
