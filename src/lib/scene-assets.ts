import { AI_BACKGROUNDS, type AiBackground } from "./ai-backgrounds";
import type { PoolEntry } from "./broll";
import type { NativeMedia } from "./desktop";
import { nativeMediaUrl } from "./desktop";

export type SceneChoice =
  | { kind: "auto-ai" }
  | { kind: "ai"; id: string }
  | { kind: "generated"; id: string; fp?: string }
  | { kind: "stock"; src: string }
  | NativeMedia
  | { kind: "upload"; id: string; approvedProof?: boolean };

export type ResolvedSceneChoice =
  | { kind: "static"; entry: PoolEntry }
  | { kind: "upload"; id: string }
  | { kind: "generated"; id: string }
  | { kind: "fallback" };

/** Validate a five-scene choice plan before loading image/video elements. */
export function resolveSceneChoices(choices: SceneChoice[], ai: AiBackground[], stock: PoolEntry[]): ResolvedSceneChoice[] {
  return choices.map((choice, index) => {
    if (choice.kind === "native") return { kind: "static", entry: { kind: choice.mediaKind, src: nativeMediaUrl(choice.path), keywords: [] } };
    if (choice.kind === "upload") return choice.id ? { kind: "upload", id: choice.id } : { kind: "fallback" };
    if (choice.kind === "generated") return choice.id ? { kind: "generated", id: choice.id } : { kind: "fallback" };
    if (choice.kind === "stock") {
      const entry = stock.find((item) => item.src === choice.src);
      return entry ? { kind: "static", entry } : { kind: "fallback" };
    }
    const image = choice.kind === "auto-ai" ? ai[index] : AI_BACKGROUNDS.find((item) => item.id === choice.id);
    return image ? { kind: "static", entry: { kind: "image", src: image.src, keywords: image.keywords } } : { kind: "fallback" };
  });
}
