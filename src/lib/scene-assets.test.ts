import { describe, expect, it } from "vitest";
import { AI_BACKGROUNDS } from "./ai-backgrounds";
import { STOCK_POOL } from "./broll";
import { resolveSceneChoices, type SceneChoice } from "./scene-assets";

describe("scene asset choices", () => {
  it("resolves auto AI, explicit AI, stock, upload, and fallback", () => {
    const choices: SceneChoice[] = [
      { kind: "auto-ai" },
      { kind: "ai", id: AI_BACKGROUNDS[4]!.id },
      { kind: "stock", src: STOCK_POOL[0]!.src },
      { kind: "upload", id: "session-photo" },
      { kind: "ai", id: "missing" },
    ];
    const resolved = resolveSceneChoices(choices, AI_BACKGROUNDS, STOCK_POOL);
    expect(resolved[0]).toEqual({ kind: "static", entry: { kind: "image", src: AI_BACKGROUNDS[0]!.src, keywords: AI_BACKGROUNDS[0]!.keywords } });
    expect(resolved[1]).toMatchObject({ kind: "static", entry: { src: AI_BACKGROUNDS[4]!.src } });
    expect(resolved[2]).toEqual({ kind: "static", entry: STOCK_POOL[0] });
    expect(resolved[3]).toEqual({ kind: "upload", id: "session-photo" });
    expect(resolved[4]).toEqual({ kind: "fallback" });
  });
});
