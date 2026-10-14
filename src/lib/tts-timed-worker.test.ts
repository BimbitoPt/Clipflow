import { describe, expect, it, vi } from "vitest";
import { startTimedWorker, type TimedWorkerScope } from "./tts-timed-worker";
import type { TimedSynthesis } from "./tts-timed-core";

type Request = { id: number; cueTexts: string[] };
type Response = { id: number; ok: true; audio: ArrayBuffer; samplingRate: number; cues: TimedSynthesis["cues"] } | { id: number; ok: false; error: string };

function setup(synthesize: (cueTexts: string[]) => Promise<TimedSynthesis>) {
  const posted: Response[] = [];
  let handler: ((message: Request) => void) | null = null;
  const scope: TimedWorkerScope = {
    postMessage: (message) => { posted.push(message); },
    setOnMessage: (next) => { handler = next; },
  };
  const loadSynth = vi.fn(() => synthesize);
  startTimedWorker(loadSynth, scope);
  const send = async (message: Request) => {
    handler!(message);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { posted, send, loadSynth };
}

describe("timed voice worker", () => {
  it("returns transferable PCM and per-cue timings", async () => {
    const cues = [{ span: [0, 1] as [number, number], words: [{ word: "hello", start: 0, end: 1 }] }];
    const { posted, send, loadSynth } = setup(async () => ({
      audio: new Float32Array([0.25, -0.25]),
      samplingRate: 24000,
      cues,
    }));
    await send({ id: 7, cueTexts: ["hello"] });
    expect(loadSynth).toHaveBeenCalledTimes(1);
    expect(posted).toHaveLength(1);
    const response = posted[0]!;
    expect(response.id).toBe(7);
    if (!response.ok) throw new Error("expected successful timed synthesis");
    expect(response.samplingRate).toBe(24000);
    expect(new Float32Array(response.audio)).toEqual(new Float32Array([0.25, -0.25]));
    expect(response.cues).toEqual(cues);
  });

  it("returns synthesis failures as protocol errors", async () => {
    const { posted, send } = setup(async () => { throw new Error("timed model missing"); });
    await send({ id: 8, cueTexts: ["hello"] });
    expect(posted).toEqual([{ id: 8, ok: false, error: "timed model missing" }]);
  });
});
