import { describe, expect, it, vi } from "vitest";
import { startTtsWorker, type TtsSynthRequest, type TtsSynthResponse, type TtsWorkerScope } from "./tts-worker";

function setup(synthesize: (text: string, voice: string) => Promise<{ audio: Float32Array; samplingRate: number }>) {
  const posted: TtsSynthResponse[] = [];
  let handler: ((message: TtsSynthRequest) => void) | null = null;
  const scope: TtsWorkerScope = {
    postMessage: (message) => { posted.push(message); },
    setOnMessage: (h) => { handler = h; },
  };
  const loadEngine = vi.fn(async () => ({ synthesize }));
  startTtsWorker(loadEngine, scope);
  const send = async (message: TtsSynthRequest) => {
    handler!(message);
    // Flush the handler's async chain (engine load + synthesize + post).
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  };
  return { posted, send, loadEngine };
}

describe("tts worker session", () => {
  it("answers a request with the synthesized buffer and sampling rate", async () => {
    const { posted, send } = setup(async () => ({ audio: new Float32Array([0.1, 0.2]), samplingRate: 24000 }));
    await send({ id: 7, text: "hello", voice: "af_heart", desktop: false });
    expect(posted).toHaveLength(1);
    const response = posted[0]!;
    expect(response.id).toBe(7);
    if (!response.ok) throw new Error("expected ok response");
    expect(response.samplingRate).toBe(24000);
    expect(new Float32Array(response.audio)).toEqual(new Float32Array([0.1, 0.2]));
  });

  it("loads the engine once across requests", async () => {
    const { send, loadEngine } = setup(async () => ({ audio: new Float32Array([0]), samplingRate: 24000 }));
    await send({ id: 1, text: "a", voice: "af_heart", desktop: false });
    await send({ id: 2, text: "b", voice: "af_heart", desktop: false });
    expect(loadEngine).toHaveBeenCalledTimes(1);
  });

  it("maps a synthesis throw to an ok:false response with the same id", async () => {
    const { posted, send } = setup(async () => { throw new Error("model gone"); });
    await send({ id: 3, text: "hello", voice: "af_heart", desktop: true });
    expect(posted).toEqual([{ id: 3, ok: false, error: "model gone" }]);
  });

  it("routes concurrent request ids independently", async () => {
    const { posted, send } = setup(async (text) => ({ audio: new Float32Array([text.length]), samplingRate: 24000 }));
    await Promise.all([
      send({ id: 10, text: "ab", voice: "af_heart", desktop: false }),
      send({ id: 11, text: "abcd", voice: "af_heart", desktop: false }),
    ]);
    const byId = new Map(posted.map((p) => [p.id, p]));
    expect((byId.get(10) as { ok: true; audio: ArrayBuffer }).ok).toBe(true);
    expect(new Float32Array((byId.get(10) as { ok: true; audio: ArrayBuffer }).audio)[0]).toBe(2);
    expect(new Float32Array((byId.get(11) as { ok: true; audio: ArrayBuffer }).audio)[0]).toBe(4);
  });

  it("answers via the global scope on the production (no-scope) path", async () => {
    // Regression: the handler posted via the injected scope only, so the
    // real-worker path (auto-start, no scope) threw and never answered.
    const posted: TtsSynthResponse[] = [];
    let onmessage: ((event: MessageEvent<TtsSynthRequest>) => void) | null = null;
    const stub = {
      postMessage: (message: TtsSynthResponse) => { posted.push(message); },
      set onmessage(handler: (event: MessageEvent<TtsSynthRequest>) => void) { onmessage = handler; },
    };
    const globals = globalThis as Record<string, unknown>;
    const prev = globals.self;
    globals.self = stub;
    try {
      startTtsWorker(async () => ({
        synthesize: async () => ({ audio: new Float32Array([0.5]), samplingRate: 24000 }),
      }));
      onmessage!({ data: { id: 9, text: "hi", voice: "af_heart", desktop: false } } as MessageEvent<TtsSynthRequest>);
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      expect(posted).toHaveLength(1);
      const response = posted[0]!;
      expect(response.id).toBe(9);
      if (!response.ok) throw new Error("expected ok response on production path");
      expect(new Float32Array(response.audio)).toEqual(new Float32Array([0.5]));
    } finally {
      if (prev === undefined) delete globals.self;
      else globals.self = prev;
    }
  });
});
