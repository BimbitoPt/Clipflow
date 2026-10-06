import type { TimedCue } from "./script";
import { selectMotionDirection, type MotionContext } from "../../shared/motion-direction";
export type { MotionIntent } from "../../shared/motion-direction";

const fillerWords = new Set(["about", "after", "again", "also", "and", "are", "because", "been", "before", "being", "but", "can", "could", "each", "for", "from", "get", "give", "has", "have", "how", "into", "its", "just", "make", "made", "more", "most", "not", "one", "our", "out", "over", "same", "that", "the", "their", "them", "then", "there", "these", "they", "this", "those", "through", "too", "turn", "turns", "use", "using", "very", "was", "were", "what", "when", "where", "which", "will", "with", "you", "your"]);

export function motionLabels(copy: string): string[] {
  const seen = new Set<string>();
  const words = copy.toLowerCase().match(/[\p{L}\p{N}€]+/gu) ?? [];
  const labels: string[] = [];
  for (const word of words) {
    if (word.length <= 2 || fillerWords.has(word) || seen.has(word)) continue;
    seen.add(word);
    labels.push(word);
    if (labels.length === 3) break;
  }
  return labels;
}

export function resolveMotionDirection(input: {
  cue: TimedCue;
  cueIndex: number;
  approvedProof: boolean;
  context?: Omit<MotionContext, "copy" | "role" | "approvedProof">;
}) {
  return selectMotionDirection({ ...input.context, copy: input.cue.text, role: input.cue.kind, approvedProof: input.approvedProof });
}

export function resolveMotionIntent(input: Parameters<typeof resolveMotionDirection>[0]) {
  return resolveMotionDirection(input).intent;
}
