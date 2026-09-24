import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listBrands, saveBrand } from "./brand-store";
import { starterBrands } from "./seed-brands";

let root: string | undefined;
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = undefined; });

describe("brand store", () => {
  it("seeds repository-backed brands and persists operator-created brands", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "clipflow-brands-"));
    expect((await listBrands(root)).map((brand) => brand.id)).toEqual(["clipflow", "mstudio"]);
    const sabre = { ...starterBrands[0], id: "sabre", name: "Sabre", toneNotes: "Operator approved identity.", updatedAt: new Date().toISOString() };
    await saveBrand(sabre, root);
    expect((await listBrands(root)).find((brand) => brand.id === "sabre")?.name).toBe("Sabre");
  });

  it("rejects malformed kits rather than saving them", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "clipflow-brands-"));
    await expect(saveBrand({ id: "../../sabre" }, root)).rejects.toThrow();
  });
});
