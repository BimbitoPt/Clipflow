import { describe, expect, it } from "vitest";
import { wordChunks } from "./SceneFrame";

describe("caption layout", () => {
  it("keeps caption chunks within the brand kit word limit", () => {
    const chunks = wordChunks("A sharp idea can move fast", 3);
    expect(chunks).toEqual(["A sharp idea", "can move fast"]);
    expect(chunks.every((chunk) => chunk.split(/\s+/).length <= 3)).toBe(true);
  });
  it("handles blank lines without rendering undefined text", () => {
    expect(wordChunks("   ", 3)).toEqual([""]);
  });
});
