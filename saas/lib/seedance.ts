import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function promptHash(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex");
}

export interface SeedanceProvider {
  generate(prompt: string): Promise<Buffer>;
}

export class MockSeedanceProvider implements SeedanceProvider {
  async generate(prompt: string): Promise<Buffer> {
    const seed = Buffer.from(promptHash(prompt), "hex");
    const buf = Buffer.alloc(4096);
    let offset = 0;
    while (offset < buf.length) {
      seed.copy(buf, offset);
      offset += seed.length;
    }
    return buf;
  }
}

export class CachedSeedanceProvider implements SeedanceProvider {
  private dir: string;
  private inner: SeedanceProvider;

  constructor(dir: string, inner: SeedanceProvider) {
    this.dir = dir;
    this.inner = inner;
  }

  async generate(prompt: string): Promise<Buffer> {
    const file = join(this.dir, `${promptHash(prompt)}.mp4`);
    try {
      return readFileSync(file);
    } catch {
      mkdirSync(this.dir, { recursive: true });
      const buffer = await this.inner.generate(prompt);
      writeFileSync(file, buffer);
      return buffer;
    }
  }
}

export const provider: SeedanceProvider = new CachedSeedanceProvider(
  process.env.SEEDANCE_CACHE_DIR ?? "saas/storage/seedance",
  new MockSeedanceProvider(),
);
