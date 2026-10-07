import { describe, expect, it } from "vitest";
import { FilterGraph, checkFilters, escText, formatCommand } from "../../shared/effects/graph";

describe("FilterGraph", () => {
  it("assembles labeled chains into one script", () => {
    const g = new FilterGraph();
    const mid = g.chain("[0:v]", ["scale=720:1280", "setsar=1"]);
    const out = g.chain(`[${mid}]`, ["vignette=PI/5"]);
    expect(g.script()).toBe(`[0:v]scale=720:1280,setsar=1[${mid}];[${mid}]vignette=PI/5[${out}]`);
    expect(g.validate(1)).toEqual([]);
  });

  it("supports concat-style multi-label inputs", () => {
    const g = new FilterGraph();
    g.chain("[0:v]", ["setsar=1"], "v0");
    g.chain("[1:v]", ["setsar=1"], "v1");
    g.chain("[v0][v1]", ["concat=n=2:v=1:a=0"], "vcat");
    expect(g.validate(2)).toEqual([]);
  });

  it("flags undefined labels, duplicates and empty filters", () => {
    const g = new FilterGraph();
    g.chain("[nope]", ["scale=720:1280"], "a");
    expect(g.validate(1).join(" ")).toContain("[nope]");
    const dup = new FilterGraph();
    dup.chain("[0:v]", ["scale=1:1"], "x");
    dup.chain("[x]", ["crop=1:1:0:0"], "x");
    expect(dup.validate(1).join(" ")).toContain("duplicate");
    const empty = new FilterGraph();
    empty.chain("[0:v]", ["  "], "y");
    expect(empty.validate(1).join(" ")).toContain("empty filter");
  });

  it("tracks extra inputs for index math", () => {
    const g = new FilterGraph();
    expect(g.addInput("lavfi")).toBe(0);
    expect(g.addInput("file")).toBe(1);
  });
});

describe("escText", () => {
  it("quotes and escapes drawtext values", () => {
    expect(escText("a:b,c%d'e\\f")).toBe(`'a\\:b\\,c\\%d\\'e\\\\f'`);
  });
});

describe("formatCommand", () => {
  it("quotes args with spaces for failure logs", () => {
    expect(formatCommand("ffmpeg", ["-i", "my file.mp4"])).toBe(`ffmpeg -i "my file.mp4"`);
  });
});

describe("checkFilters", () => {
  it("reports only missing filters", () => {
    const fake = () => ({ status: 0, stdout: " TSC scale Scale video\n TSC crop Crop video\n" });
    expect(checkFilters("ffmpeg", ["scale", "nope"], fake)).toEqual(["nope"]);
  });

  it("treats a failed probe as all-missing", () => {
    const fake = () => ({ status: 1, stdout: "" });
    expect(checkFilters("ffmpeg", ["scale"], fake)).toEqual(["scale"]);
  });
});
