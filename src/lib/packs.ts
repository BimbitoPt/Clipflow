import mstudio from "../packs/mstudio.json";

export interface Theme { bg: [string, string]; accent: string; font: string; }
export interface NichePack { id: string; label: string; hooks: string[]; ctas: string[]; themes: Theme[]; hashtags: string[]; }

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
  if (id === "mstudio" && isPack(mstudio)) return mstudio;
  throw new Error(`E_UNKNOWN_PACK: ${id}`);
}
