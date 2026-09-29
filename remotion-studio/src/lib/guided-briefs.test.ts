import { describe, expect, it } from "vitest";
import { blankBrief, validateGuidedBriefs } from "./guided-briefs";

describe("guided batch briefs", () => {
  it("identifies incomplete rows and a missing proof point", () => {
    const rows = Array.from({ length: 10 }, () => blankBrief("clipflow"));
    rows[0] = { ...rows[0], concept: "Launch", hook: "See it move", keyMessage: "A useful message", format: "proof" };
    const issues = validateGuidedBriefs(rows);
    expect(issues).toContainEqual({ index: 0, field: "proof", message: "Proof/story needs a verified proof point." });
    expect(issues).toContainEqual({ index: 1, field: "concept", message: "Concept is required." });
    expect(issues.some((issue) => issue.index === 0 && issue.field === "hook")).toBe(false);
  });

  it("accepts ten complete rows and rejects a twenty-first", () => {
    const row = { ...blankBrief("clipflow"), concept: "A video", hook: "A strong opening", keyMessage: "One clear idea" };
    expect(validateGuidedBriefs(Array.from({ length: 10 }, () => row))).toEqual([]);
    expect(validateGuidedBriefs(Array.from({ length: 21 }, () => row))).toContainEqual({ index: -1, field: "batch", message: "A batch needs 10–20 clips." });
  });
});
