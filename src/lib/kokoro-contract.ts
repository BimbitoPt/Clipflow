/**
 * Shared Kokoro shipping contract. Zero imports so both the main thread
 * (tts-local.ts) and the synthesis worker (tts-worker.ts) can use it
 * without pulling UI or Tauri dependencies into the worker bundle.
 */

/** Standard local synthesis checkpoint (never track `main`). */
export const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
/**
 * Pinned weights revision — must match REVISION in
 * scripts/install-kokoro-model.mjs (enforced by tts-local.test.ts). The
 * loader resolves weights from the staged /models copy only
 * (`allowRemoteModels = false`), so this is the manifest the local files
 * were downloaded from; it also pins any future remote resolution.
 */
export const MODEL_REVISION = "1939ad2a8e416c0acfeecc08a694d14ef25f2231";
/** Kokoro's native output rate. Both export paths resample from here. */
export const KOKORO_SAMPLE_RATE = 24000;
/** Clipflow brand voice — matches remotion-studio's Clipflow default. */
export const DEFAULT_VOICE = "af_heart" as const;
