# STATUS — FX Engine

- Started: 2026-10-07
- State: active

## Log
- 2026-10-07 — All 8 niche packs land; samples render for every niche (`outputs/fx-samples/`); full suite 167 green. Debugged real filter issues: `[label],` empty-filter, config-time crop w/h, drawbox=iw/ih vs drawtext=w/h var sets.
- 2026-10-07 — Brief created. Pipeline mapped: canvas (browser) + FFmpeg (native render.rs, scripts). Plan: shared/effects TS module, commit architecture → universal → niches.
