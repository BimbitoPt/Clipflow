import { createKokoroTimedLoaderInline, type TimedSynthesis } from "./tts-timed-core";

type Request = { id: number; cueTexts: string[] };
type Response =
  | { id: number; ok: true; audio: ArrayBuffer; samplingRate: number; cues: TimedSynthesis["cues"] }
  | { id: number; ok: false; error: string };

export interface TimedWorkerScope {
  postMessage(message: Response, transfer?: Transferable[]): void;
  setOnMessage(handler: (message: Request) => void): void;
}
export type TimedSynthLoader = () => (cueTexts: string[]) => Promise<TimedSynthesis>;

export function startTimedWorker(loadSynth: TimedSynthLoader = createKokoroTimedLoaderInline, scope?: TimedWorkerScope): void {
  const synthesize = loadSynth();
  const handle = (request: Request) => {
    void (async () => {
      try {
        const result = await synthesize(request.cueTexts);
        const audio = result.audio.slice().buffer as ArrayBuffer;
        scope!.postMessage(
          { id: request.id, ok: true, audio, samplingRate: result.samplingRate, cues: result.cues },
          [audio],
        );
      } catch (error) {
        scope!.postMessage({
          id: request.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  };

  if (scope) {
    scope.setOnMessage(handle);
    return;
  }
  const globalScope = self as unknown as {
    postMessage(message: Response, transfer?: Transferable[]): void;
    onmessage: ((event: MessageEvent<Request>) => void) | null;
  };
  globalScope.onmessage = (event: MessageEvent<Request>) => handle(event.data);
}

// Auto-start in a real worker global only: main-thread self is window.
try {
  const candidate = self as unknown as { window?: unknown };
  if (typeof self !== "undefined" && candidate.window === undefined) startTimedWorker();
} catch {
  // Module import context (tests, SSR): start explicitly via startTimedWorker().
}
