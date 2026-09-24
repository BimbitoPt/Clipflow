import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BrandKitSchema, type BrandKit } from "./domain";
import { appDataRoot, readJson, resolveInside, writeJsonAtomic } from "./file-store";
import { starterBrands } from "./seed-brands";

function brandPath(root: string, id: string) {
  return resolveInside(root, "brands", `${id}.json`);
}

export async function listBrands(root = appDataRoot()): Promise<BrandKit[]> {
  const dir = resolveInside(root, "brands");
  await mkdir(dir, { recursive: true });
  for (const brand of starterBrands) {
    if (!(await readJson(brandPath(root, brand.id)))) await writeJsonAtomic(root, brandPath(root, brand.id), brand);
  }
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(dir)).filter((name) => /^[a-z0-9][a-z0-9_-]{2,63}\.json$/.test(name));
  const brands = await Promise.all(files.map(async (name) => {
    const parsed = await readJson<unknown>(resolveInside(dir, name));
    return BrandKitSchema.parse(parsed);
  }));
  return brands.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getBrand(id: string, root = appDataRoot()): Promise<BrandKit | null> {
  const parsed = await readJson<unknown>(brandPath(root, id));
  return parsed === null ? null : BrandKitSchema.parse(parsed);
}

export async function saveBrand(input: unknown, root = appDataRoot()): Promise<BrandKit> {
  const brand = BrandKitSchema.parse(input);
  await writeJsonAtomic(root, brandPath(root, brand.id), brand);
  return brand;
}

export function localAssetsRoot() {
  return path.join(process.cwd(), "public", "local-assets");
}

export async function storeUploadedAsset(brandId: string, bytes: Uint8Array, extension: string): Promise<string> {
  const root = localAssetsRoot();
  const relative = `local-assets/${brandId}/${crypto.randomUUID()}.${extension}`;
  const target = resolveInside(path.join(process.cwd(), "public"), relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
  return relative;
}
