import mstudio from "../packs/mstudio.json";
import clipflow from "../packs/clipflow.json";

export interface Theme { bg: [string, string]; accent: string; font: string; }
export interface NichePack { id: string; label: string; hooks: string[]; ctas: string[]; themes: Theme[]; hashtags: string[]; }

const PACKS: Record<string, unknown> = { mstudio, clipflow };

export const PACK_IDS = ["mstudio", "clipflow"] as const;
export type PackId = (typeof PACK_IDS)[number];

export function packLabel(id: string): string {
  const pack = PACKS[id];
  if (isPack(pack)) return pack.label;
  return id;
}

function isPack(v: unknown): v is NichePack {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o["id"] === "string" &&
    Array.isArray(o["hooks"]) &&
    Array.isArray(o["ctas"]) &&
    Array.isArray(o["themes"]) &&
    Array.isArray(o["hashtags"])
  );
}

export function loadPack(id: string): NichePack {
  const pack = PACKS[id];
  if (pack && isPack(pack)) return pack;
  throw new Error(`E_UNKNOWN_PACK: ${id}`);
}
