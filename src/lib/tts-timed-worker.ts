import { createKokoroTimedLoaderInline, type TimedSynthesis } from "./tts-timed-core";

type Request = { id: number; cueTexts: string[] };
type Response =
  | { id: number; ok: true; audio: ArrayBuffer; samplingRate: number; cues: TimedSynthesis["cues"] }
  | { id: number; ok: false; error: string };

const synthesize = createKokoroTimedLoaderInline();
const scope = self as unknown as {
  postMessage(message: Response, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<Request>) => void) | null;
};

scope.onmessage = (event) => {
  const request = event.data;
  void (async () => {
    try {
      const result = await synthesize(request.cueTexts);
      const audio = result.audio.slice().buffer as ArrayBuffer;
      scope.postMessage(
        { id: request.id, ok: true, audio, samplingRate: result.samplingRate, cues: result.cues },
        [audio],
      );
    } catch (error) {
      scope.postMessage({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
};
