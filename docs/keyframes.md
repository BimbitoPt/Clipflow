# Script-driven keyframes

Every Clipflow video gets five keyframe images — one per script beat —
generated **from the script itself** when a new video is created.

## How it works

```
script beat ──▶ buildKeyframePrompt(beat, profile)   (keyframes.ts)
             ──▶ seed = hash(idea | fp | index | prompt)
             ──▶ GET gen.pollinations.ai/image/{urlencoded}?width=720&height=1280&seed=N&model=tongyi-mai/z-image-turbo&negative_prompt=...[&nologo=true&private=true&key=pk_...]
             ──▶ blob ──▶ OPFS (clipflow-uploads/gen-<seed36>)
             ──▶ SceneChoice { kind: "generated", id, fp }
```

Model choice (measured 2026-10-08): `tongyi-mai/z-image-turbo`
(aliases `zimage`) — 0.004 pollen/image bills to **quest Pollen** (5
keyframes ≈ 0.02/video), renders clean with no watermark on authenticated
calls, and matches the near-black + lime brand. Runner-up
`black-forest-labs/flux.1-schnell` (0.002) is more minimal. Video models
are excluded — they require *paid* balance even for quest-sized amounts.

- **Trigger:** `keyframeFp = hash(idea + all cue texts)` changes → App queues
  all five scenes, serialized through one promise chain (`keyframeQueueRef`).
  Runs automatically once per script; manual retry/regenerate per scene from
  the KEYFRAMES tab in the scene tray.
- **Deterministic:** same script → same prompt → same seed → same image.
  Reloads and reopened projects resolve the choice straight from OPFS with
  zero network (the queue checks the cache first and marks `ready`).
- **`fp` on the choice** marks which script version produced the image. Edit
  the idea/beats → fp mismatch → the scene's keyframe is regenerated.
  A regenerated image gets a fresh seed (`regen + Date.now()`), so old and
  new never collide in the store.

## Why Pollinations (free tier realities, measured 2026-10-08)

| Fact | Consequence in code |
|---|---|
| No key needed for anonymous calls, MIT-licensed | `generateKeyframe()` works with zero config |
| Anonymous throttle = 1 req / ~15s, answered as **HTTP 402 + `{}`** | `KEYFRAME_MIN_INTERVAL_MS = 15500` pacing + 402 retry with 16s wait |
| Occasional upstream 500 ("GenSana network lost") | 5xx retried with exponential backoff, up to 4 attempts |
| `Access-Control-Allow-Origin: *` | fetch → blob works in browser and Tauri webview; blob is never tainted, canvas export safe |
| Anonymous responses carry a bottom-right watermark | Removed with a **free** key: `enter.pollinations.ai → Keys → publishable key (pk_...)`, paste it in the KEYFRAMES tab → URL gains `nologo=true&private=true&key=...` (model `flux`, which supports nologo) |
| Other "free" APIs (Cloudflare, HF, etc.) need keys or fail browser CORS | Rejected during research |

Free key setup: the supported browser path is BYOP OAuth (app `pk_` key as
`client_id`, users authorize their own pollen). Until that is built, solo
local use runs on a deliberately scoped secret (`models:image`,
`--quest-pollen-only`, small `--budget`, short expiry) kept ONLY in
gitignored `.env.local` — never commit it, never ship it in anyone else's
build. Rotate with `npx @pollinations/cli keys revoke <id>`.

App attribution (Pollen earnings): register Clipflow as an app and use its
app key (`pk_...`) as the default `VITE_POLLINATIONS_KEY`, optionally plus
`VITE_POLLINATIONS_REFERRER` for anonymous calls. User-side generations then
attribute to the app and earnings flow back. **Never use a secret key
(`sk_...`) in the browser** — `sanitizePollinationsKey` rejects them, and
they must live on a server only. The app key is publishable by design.

## Fallbacks (local-first still holds)

- Fetch fails after retries → status `error`, the scene **stays on its
  current visual** (offline AI pool / manual pick). Nothing breaks offline.
- User picks stock/upload/library for a scene → the auto-queue skips it
  entirely (manual choices are never overwritten).
- Cache miss on an existing `generated` choice (OPFS cleared) → refetch with
  the same seed recovered from the id (`keyframeSeedOf`).

## Storage & GC

Generated blobs share the upload store (`saveUpload`/`loadUploadBlob`, id
pattern `gen-[a-z0-9]+`), get `touchUpload`ed on every load, and are collected
by the existing 30-day `gcUploads` pass if untouched. In-memory copies live in
`generatedBlobRef`/`generatedRef`/`generatedUrlRef` (App) — kept out of
`uploadsRef` so the upload-eviction effect never closes a live keyframe.

## Proof rule

Generated images are AI artwork. `approvedProof` exists only on `upload`
choices, and the KEYFRAMES tab says so: never use generated keyframes as
evidence — real uploads only.

## Files

- `src/lib/keyframes.ts` — prompt/seed/url/id builders + paced retrying
  generator (`createKeyframeGenerator`, injectable for tests) + free-key
  helpers (`sanitize/load/savePollinationsKey`, `keyframeUrl(..., { key })`)
- `src/lib/keyframes.test.ts` — determinism, id round-trip, pacing, retry
- `src/lib/scene-assets.ts` — `SceneChoice { kind: "generated" }` resolution
- `src/hooks/useSceneAssets.ts` — queue orchestration (`ensureKeyframe`, `generateKeyframeNow`)
- `src/components/SceneTray.tsx` — KEYFRAMES tab (status dots, generate /
  regenerate / retry, back-to-library)
