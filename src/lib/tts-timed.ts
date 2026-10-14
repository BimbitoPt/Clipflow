import type { TimedCueTiming } from "./planner";
import type { TimedSynthesis } from "./tts-timed-core";
export { TIMESTAMPED_MODEL_REVISION } from "./tts-timed-core";
export type { TimedSynthesis } from "./tts-timed-core";

type WorkerResponse =
  | { id: number; ok: true; audio: ArrayBuffer; samplingRate: number; cues: Array<TimedCueTiming | null> }
  | { id: number; ok: false; error: string };
type Pending = {
  resolve: (result: TimedSynthesis) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  abort?: () => void;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function failWorker(error: Error): void {
  worker?.terminate();
  worker = null;
  for (const [id, request] of pending) {
    if (request.signal && request.abort) request.signal.removeEventListener("abort", request.abort);
    request.reject(error);
    pending.delete(id);
  }
}

function getWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL("./tts-timed-worker.ts", import.meta.url), { type: "module" });
  created.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (request.signal && request.abort) request.signal.removeEventListener("abort", request.abort);
    if (!response.ok) {
      request.reject(new Error(response.error));
      return;
    }
    request.resolve({
      audio: new Float32Array(response.audio),
      samplingRate: response.samplingRate,
      cues: response.cues,
    });
  };
  created.onerror = (event) => {
    event.preventDefault();
    failWorker(new Error(event.message || "Timed voice worker failed to load."));
  };
  created.onmessageerror = () => failWorker(new Error("Timed voice worker returned an unreadable message."));
  worker = created;
  return created;
}

/** Timestamped synthesis is a soft upgrade, but it must never block the editor's main thread. */
export function createKokoroTimedLoader() {
  return (cueTexts: string[], signal?: AbortSignal): Promise<TimedSynthesis> => {
    if (signal?.aborted) return Promise.reject(new DOMException("Export cancelled.", "AbortError"));
    const id = nextId++;
    return new Promise<TimedSynthesis>((resolve, reject) => {
      const abort = () => {
        if (!pending.has(id)) return;
        pending.delete(id);
        signal?.removeEventListener("abort", abort);
        reject(new DOMException("Export cancelled.", "AbortError"));
        // ONNX inference cannot be interrupted safely. Terminate and recreate
        // the worker on the next request rather than leave it wedged.
        failWorker(new DOMException("Export cancelled.", "AbortError"));
      };
      pending.set(id, { resolve, reject, signal, abort });
      signal?.addEventListener("abort", abort, { once: true });
      try {
        getWorker().postMessage({ id, cueTexts });
      } catch (error) {
        pending.delete(id);
        signal?.removeEventListener("abort", abort);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };
}
