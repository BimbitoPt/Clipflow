import { afterEach, describe, expect, it, vi } from "vitest";
import { elevenCost, elevenTts } from "./eleven";

const fetchMock = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("eleven", () => {
  it("costs 1 credit per 1000 chars, rounded up", () => {
    expect(elevenCost("")).toBe(0);
    expect(elevenCost("x".repeat(999))).toBe(1);
    expect(elevenCost("x".repeat(1000))).toBe(1);
    expect(elevenCost("x".repeat(1001))).toBe(2);
  });
  it("posts to the TTS endpoint with header + body and returns the audio buffer", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]).buffer as ArrayBuffer, {
        status: 200,
      }),
    );
    const buf = await elevenTts("sk-test", "voice-1", "narration");
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBe(3);
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe("https://api.elevenlabs.io/v1/text-to-speech/voice-1");
    const init = call[1] as RequestInit;
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("sk-test");
    expect(JSON.parse(String(init.body))).toEqual({
      text: "narration",
      model_id: "eleven_multilingual_v2",
    });
  });
  it("throws on non-2xx with the status in the message", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(new Response("nope", { status: 401 }));
    await expect(elevenTts("sk-test", "v", "t")).rejects.toThrow(/401/);
  });
});
