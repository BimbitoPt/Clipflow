/**
 * The week's queue: the 5-7 posts/week cadence without leaving the DIY loop.
 *
 * The batch studio needs 10-20 brand-matched briefs per batch, so a single
 * DIY clip can't hand off directly. Instead the queue keeps a short list of
 * upcoming ideas next to the editor: finish one clip, load the next idea in
 * one click, same profile. Ideas persist in localStorage; loading an idea
 * only swaps the idea text and clears per-clip overrides.
 */

export const WEEK_KEY = "clipflow.week";
export const MAX_QUEUE_IDEAS = 10;

export function parseQueueIdeas(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const idea = line.trim().replace(/\s+/g, " ");
    if (!idea || seen.has(idea.toLowerCase())) continue;
    seen.add(idea.toLowerCase());
    out.push(idea);
    if (out.length >= MAX_QUEUE_IDEAS) break;
  }
  return out;
}

function normalize(idea: string): string {
  return idea.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Index of the first queued idea that isn't the current one, or -1. */
export function nextQueueIndex(ideas: readonly string[], currentIdea: string): number {
  if (!ideas.length) return -1;
  const current = normalize(currentIdea);
  if (!current) return 0;
  const at = ideas.findIndex((idea) => idea.toLowerCase() === current);
  if (at < 0) return 0;
  return at + 1 < ideas.length ? at + 1 : -1;
}

/** 1-based position of the current idea in the queue (0 when not queued). */
export function queuePosition(ideas: readonly string[], currentIdea: string): { position: number; total: number } {
  const current = normalize(currentIdea);
  const at = current ? ideas.findIndex((idea) => idea.toLowerCase() === current) : -1;
  return { position: at >= 0 ? at + 1 : 0, total: ideas.length };
}
