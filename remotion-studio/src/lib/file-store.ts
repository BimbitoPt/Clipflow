import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export function resolveInside(root: string, ...parts: string[]): string {
  const absoluteRoot = path.resolve(root);
  const target = path.resolve(absoluteRoot, ...parts);
  const relative = path.relative(absoluteRoot, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Path escapes its storage root");
  }
  return target;
}

export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeJsonAtomic<T>(root: string, filePath: string, value: T): Promise<void> {
  const target = resolveInside(root, path.relative(root, filePath));
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, target);
}

export function appDataRoot(): string {
  return path.join(process.cwd(), "data");
}
