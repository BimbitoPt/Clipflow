import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readJson, resolveInside, writeJsonAtomic } from "./file-store";

let temporaryRoot: string | undefined;
afterEach(async () => { if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true }); temporaryRoot = undefined; });

describe("local JSON store", () => {
  it("round-trips JSON using an atomic write inside its root", async () => {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "clipflow-store-"));
    const target = resolveInside(temporaryRoot, "batches", "test.json");
    await writeJsonAtomic(temporaryRoot, target, { id: "batch-001", saved: true });
    expect(await readJson(target)).toEqual({ id: "batch-001", saved: true });
    expect(await readFile(target, "utf8")).toContain("batch-001");
  });

  it("rejects paths that traverse out of the storage root", () => {
    temporaryRoot = path.join(os.tmpdir(), "clipflow-store-root");
    expect(() => resolveInside(temporaryRoot!, "..", "outside.json")).toThrow("Path escapes");
  });
});
