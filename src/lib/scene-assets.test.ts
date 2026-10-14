import { describe, expect, it } from "vitest";
import { AI_BACKGROUNDS } from "./ai-backgrounds";
import { STOCK_POOL } from "./broll";
import { applyUploadToScene, resolveSceneChoices, type SceneChoice } from "./scene-assets";

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

  it("resolves generated keyframes by id and drops empty ids", () => {
    const choices: SceneChoice[] = [
      { kind: "generated", id: "gen-abc123", fp: "42" },
      { kind: "generated", id: "" },
    ];
    const resolved = resolveSceneChoices(choices, AI_BACKGROUNDS, STOCK_POOL);
    expect(resolved[0]).toEqual({ kind: "generated", id: "gen-abc123" });
    expect(resolved[1]).toEqual({ kind: "fallback" });
  });
});

describe("applyUploadToScene", () => {
  const five = (): SceneChoice[] => Array.from({ length: 5 }, () => ({ kind: "auto-ai" }));

  it("lands on the captured target even when the selection moved mid-upload", () => {
    // Upload started on scene 3 (index 2); the user switched to scene 5
    // while decoding persisted. The hook passes the captured index, not
    // the live selection — the upload must follow the capture.
    const result = applyUploadToScene(five(), 2, "up-1");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.choices[2]).toEqual({ kind: "upload", id: "up-1", approvedProof: false });
    expect(result.choices[4]).toEqual({ kind: "auto-ai" });
    expect(result.choices).toHaveLength(5);
  });

  it("reports explicitly when the target scene no longer exists", () => {
    const choices = five().slice(0, 3);
    const before = [...choices];
    const result = applyUploadToScene(choices, 4, "up-2");
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toMatch(/no longer available/);
    expect(choices).toEqual(before);
  });

  it("rejects negative and non-integer targets without touching choices", () => {
    for (const target of [-1, 1.5, Number.NaN]) {
      const choices = five();
      const result = applyUploadToScene(choices, target, "up-3");
      expect("error" in result, String(target)).toBe(true);
      expect(choices.every((c) => c.kind === "auto-ai")).toBe(true);
    }
  });
});
