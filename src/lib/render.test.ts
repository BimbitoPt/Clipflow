import { describe, expect, it } from "vitest";
import { drawFrame, type DrawCtx } from "./render";
import type { Theme } from "./packs";

function stubCtx(): DrawCtx & { calls: string[]; texts: string[] } {
  return {
    calls: [],
    texts: [],
    fillStyle: "",
    font: "",
    fillRect(_x, _y, _w, _h) { this.calls.push("rect"); },
    fillText(t) { this.calls.push("text"); this.texts.push(String(t)); },
  };
}

const theme: Theme = { bg: ["#080A0D", "#12306e"], accent: "#246BFD", font: "700 96px system-ui" };

describe("render", () => {
  it("paints bg, accent bar and cue text", () => {
    const ctx = stubCtx();
    drawFrame(ctx, { t: 1, cue: { start: 0, end: 4, kind: "hook", text: "Hello niche" } }, theme);
    expect(ctx.calls).toContain("rect");
    expect(ctx.calls).toContain("text");
    expect(ctx.texts.join(" ")).toMatch(/Hello niche/);
  });
});
