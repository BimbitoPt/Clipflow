import { describe, expect, it } from "vitest";
import { MAX_QUEUE_IDEAS, nextQueueIndex, parseQueueIdeas, queuePosition } from "./week-queue";

describe("week-queue", () => {
  it("parses one idea per line, trims, dedupes, caps at ten", () => {
    const ideas = parseQueueIdeas("  Slow sites cost sales\n\nSLOW SITES cost sales\nShip in two weeks\n");
    expect(ideas).toEqual(["Slow sites cost sales", "Ship in two weeks"]);
    const many = Array.from({ length: 15 }, (_, i) => `idea ${i}`).join("\n");
    expect(parseQueueIdeas(many).length).toBe(MAX_QUEUE_IDEAS);
    expect(parseQueueIdeas("   \n  ")).toEqual([]);
  });

  it("advances past the current idea", () => {
    const ideas = ["a", "b", "c"];
    expect(nextQueueIndex(ideas, "")).toBe(0);
    expect(nextQueueIndex(ideas, "a")).toBe(1);
    expect(nextQueueIndex(ideas, "c")).toBe(-1);
    expect(nextQueueIndex(ideas, "custom not queued")).toBe(0);
    expect(nextQueueIndex([], "a")).toBe(-1);
  });

  it("reports queue position", () => {
    expect(queuePosition(["a", "b"], "b")).toEqual({ position: 2, total: 2 });
    expect(queuePosition(["a", "b"], "other")).toEqual({ position: 0, total: 2 });
    expect(queuePosition([], "")).toEqual({ position: 0, total: 0 });
  });
});
