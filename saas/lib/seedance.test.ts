import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promptHash, MockSeedanceProvider, CachedSeedanceProvider } from "./seedance";

describe("seedance", () => {
  it("promptHash is sha256 hex, stable and distinct", () => {
    const h1 = promptHash("a coastal sunrise");
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
    expect(promptHash("a coastal sunrise")).toBe(h1);
    expect(promptHash("a mountain dawn")).not.toBe(h1);
  });

  it("mock provider returns deterministic bytes per prompt", async () => {
    const p = new MockSeedanceProvider();
    const a1 = await p.generate("a coastal sunrise");
    const a2 = await p.generate("a coastal sunrise");
    const b = await p.generate("a mountain dawn");
    expect(Buffer.compare(a1, a2)).toBe(0);
    expect(Buffer.compare(a1, b)).not.toBe(0);
    expect(a1.length).toBeGreaterThan(0);
  });

  it("cached provider reuses bytes on second call", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "seedance-")));
    const inner = new MockSeedanceProvider();
    const spy = vi.spyOn(inner, "generate");
    const cached = new CachedSeedanceProvider(dir, inner);
    const prompt = "a coastal sunrise";
    const a1 = await cached.generate(prompt);
    expect(spy).toHaveBeenCalledTimes(1);
    const a2 = await cached.generate(prompt);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(Buffer.compare(a1, a2)).toBe(0);
    const onDisk = readFileSync(join(dir, `${promptHash(prompt)}.mp4`));
    expect(Buffer.compare(onDisk, a1)).toBe(0);
  });
});
