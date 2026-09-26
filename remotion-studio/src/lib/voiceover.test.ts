import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { encodePcmWav, estimateWordTimings, generateVoiceover, splitNarration } from "./voiceover";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("local voiceover helpers", () => {
  it("splits longer scripts into sentence-sized model inputs", () => {
    expect(splitNarration("One clear idea. Another clear idea!")).toEqual(["One clear idea.", "Another clear idea!"]);
    expect(splitNarration("one two three four five", 2)).toEqual(["one two", "three four", "five"]);
  });

  it("joins synthesized segments with a pause and offsets caption timing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "clipflow-voice-chunks-")); roots.push(root);
    const calls: string[] = [];
    const result = await generateVoiceover("First sentence. Second sentence.", "clip-chunks", root, async (chunk) => {
      calls.push(chunk);
      return { audio: new Float32Array(16000), samplingRate: 16000 };
    });
    expect(calls).toEqual(["First sentence.", "Second sentence."]);
    expect(result.durationSeconds).toBeCloseTo(2.18);
    expect(result.wordTimings[1].end).toBeCloseTo(1);
    expect(result.wordTimings[2].start).toBeCloseTo(1.18);
  });

  it("produces positive non-overlapping word spans that cover the narration", () => {
    const spans = estimateWordTimings("Make every word easy to follow.", 2.5);
    expect(spans).toHaveLength(6);
    expect(spans[0].start).toBe(0);
    expect(spans.at(-1)?.end).toBe(2.5);
    expect(spans.every((span) => span.end > span.start)).toBe(true);
    expect(spans.slice(1).every((span, index) => Math.abs(span.start - spans[index].end) < 1e-8)).toBe(true);
  });

  it("writes normalized mono PCM WAV and returns safe local asset metadata", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "clipflow-voice-")); roots.push(root);
    const generated = await generateVoiceover("A short line.", "clip-abc", root, async () => ({ audio: new Float32Array([0.1, -0.2, 0.4]), samplingRate: 16000 }));
    expect(generated.audioPath).toMatch(/^local-assets\/voiceovers\/clip-abc-[a-f0-9]{12}\.wav$/);
    expect(generated.durationSeconds).toBeCloseTo(3 / 16000);
    const data = await readFile(path.join(root, "public", ...generated.audioPath.split("/")));
    expect(data.toString("ascii", 0, 4)).toBe("RIFF");
    expect(data.readUInt32LE(24)).toBe(16000);
    expect(data.readUInt16LE(22)).toBe(1);
  });

  it("rejects empty input and refuses silent output", () => {
    expect(() => encodePcmWav(new Float32Array(), 16000)).toThrow(/empty/);
    expect(estimateWordTimings("  ", 1)).toEqual([]);
  });

  it("rejects narration that will not fit without writing an orphaned WAV", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "clipflow-voice-limit-")); roots.push(root);
    await expect(generateVoiceover("A short line.", "clip-limit", root, async () => ({ audio: new Float32Array(16000), samplingRate: 16000 }), { maxDurationSeconds: 1 })).rejects.toThrow(/shorten it to fit/);
    await expect(readFile(path.join(root, "public", "local-assets", "voiceovers"))).rejects.toThrow();
  });
});
