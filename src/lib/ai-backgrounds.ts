import type { Profile } from "./profile";

export interface AiBackground {
  id: string;
  src: string;
  label: string;
  keywords: string[];
  focalY: number;
}

// Original text-free stills produced for this project's Remotion videos.
// These copies let the local PWA use the same visual standard offline.
export const AI_BACKGROUNDS: AiBackground[] = [
  { id: "lime-spark", src: "/ai-backgrounds/lime-spark.png", label: "The first spark", keywords: ["idea", "start", "hook", "spark", "create"], focalY: 0.48 },
  { id: "lime-spine", src: "/ai-backgrounds/lime-spine.png", label: "Film spine", keywords: ["script", "structure", "story", "frame", "sequence"], focalY: 0.48 },
  { id: "lime-five-frames", src: "/ai-backgrounds/lime-five-frames.png", label: "Five-part story", keywords: ["five", "beat", "steps", "system", "story"], focalY: 0.48 },
  { id: "lime-dawn", src: "/ai-backgrounds/lime-dawn.png", label: "Lime dawn", keywords: ["result", "future", "outcome", "dawn", "finish"], focalY: 0.5 },
  { id: "series-episode", src: "/ai-backgrounds/series-episode.png", label: "Episode one", keywords: ["episode", "short", "creator", "hook", "video"], focalY: 0.48 },
  { id: "series-chain", src: "/ai-backgrounds/series-chain.png", label: "Connected series", keywords: ["series", "connect", "workflow", "process", "sequence"], focalY: 0.48 },
  { id: "series-stair", src: "/ai-backgrounds/series-stair.png", label: "Rising frames", keywords: ["growth", "steps", "build", "progress", "proof"], focalY: 0.46 },
  { id: "series-horizon", src: "/ai-backgrounds/series-horizon.png", label: "Next chapter", keywords: ["outcome", "next", "future", "chapter", "cta"], focalY: 0.5 },
  { id: "blue-price-tag", src: "/ai-backgrounds/blue-price-tag.png", label: "Clear price", keywords: ["price", "cost", "offer", "website", "business"], focalY: 0.5 },
  { id: "blue-blueprint", src: "/ai-backgrounds/blue-blueprint.png", label: "Website blueprint", keywords: ["website", "design", "build", "plan", "business"], focalY: 0.5 },
  { id: "blue-glass-cards", src: "/ai-backgrounds/blue-glass-cards.png", label: "Offer cards", keywords: ["offer", "proof", "choice", "business", "website"], focalY: 0.5 },
  { id: "blue-door", src: "/ai-backgrounds/blue-door.png", label: "Open door", keywords: ["cta", "action", "next", "launch", "outcome"], focalY: 0.5 },
  { id: "blue-search-path", src: "/ai-backgrounds/blue-search-path.png", label: "The path forward", keywords: ["hook", "website", "search", "discovery", "start"], focalY: 0.5 },
  { id: "blue-search-signal", src: "/ai-backgrounds/blue-search-signal.png", label: "Signal in the dark", keywords: ["proof", "signal", "business", "growth", "search"], focalY: 0.5 },
  { id: "blue-search-result", src: "/ai-backgrounds/blue-search-result.png", label: "Find the answer", keywords: ["result", "outcome", "website", "search", "cta"], focalY: 0.5 },
];

function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 2));
}

const sceneIntent = ["hook start idea", "story script frame", "system process build", "proof result progress", "cta next outcome"];

/** Stable, distinct local selections for a five-cue video. */
export function assignAiBackgrounds(idea: string, profile: Profile, cueTexts: string[]): AiBackground[] {
  const context = tokens([idea, profile.niche, profile.audience, profile.offer, profile.tone, profile.proof].join(" "));
  const used = new Set<string>();
  const studioBrand = /web|website|mstudio|automation|site|design/i.test(`${profile.niche} ${profile.offer}`);
  const brandPool = AI_BACKGROUNDS.filter((item) => studioBrand ? item.id.startsWith("blue-") : !item.id.startsWith("blue-"));
  return cueTexts.map((cue, index) => {
    const local = tokens(`${cue} ${sceneIntent[index % sceneIntent.length]}`);
    const choices = brandPool.filter((item) => !used.has(item.id));
    const pool = choices.length ? choices : brandPool;
    const ranked = pool.map((item, order) => ({ item, order, score: item.keywords.reduce((score, keyword) => score + (local.has(keyword) ? 3 : 0) + (context.has(keyword) ? 1 : 0), 0) }));
    ranked.sort((a, b) => b.score - a.score || a.order - b.order);
    const selected = ranked[0]!.item;
    used.add(selected.id);
    return selected;
  });
}
