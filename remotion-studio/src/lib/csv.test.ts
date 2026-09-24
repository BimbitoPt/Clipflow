import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("brief CSV parser", () => {
  it("supports escaped quotes, commas and newlines inside quoted fields", () => {
    const parsed = parseCsv('concept,hook,keyMessage\nLaunch,"A, better\nway","She said ""ship it"""');
    expect(parsed.records).toEqual([{ line: 2, values: { concept: "Launch", hook: "A, better\nway", keyMessage: 'She said "ship it"' } }]);
  });
  it("rejects unclosed quotes, duplicate headers and oversized input", () => {
    expect(() => parseCsv('concept,hook\nOne,"unfinished')).toThrow("unclosed");
    expect(() => parseCsv("concept,Concept\nA,B")).toThrow("duplicate");
    expect(() => parseCsv("x".repeat(200_001))).toThrow("200 KB");
  });
});
