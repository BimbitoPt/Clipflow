import { describe, expect, it, vi } from "vitest";
import { exportClip } from "./export";
import type { PlannedFrame } from "./planner";
import type { Theme } from "./packs";

const theme: Theme = { bg: ["#080A0D", "#12306e"], accent: "#246BFD", font: "700 96px system-ui" };
const frames: PlannedFrame[] = [
  { t: 0, cue: { start: 0, end: 4, kind: "hook", text: "Hi" } },
  { t: 1 / 30, cue: { start: 0, end: 4, kind: "hook", text: "Hi" } },
];

describe("export", () => {
  it("rejects E_NO_WEBCODECS without factories", async () => {
    await expect(exportClip({ frames, theme, fps: 30 })).rejects.toThrow(/E_NO_WEBCODECS/);
  });

  it("encodes every frame then finalizes", async () => {
    const encode = vi.fn();
    const finalize = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const encoderFactory = () => ({ encode, finalize });
    const out = await exportClip({ frames, theme, fps: 30, encoderFactory });
    expect(encode).toHaveBeenCalledTimes(2);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(out).toEqual(new Uint8Array([1, 2, 3]));
  });
});
