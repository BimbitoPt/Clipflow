/** Pure editorial policy shared by Canvas and Remotion; no renderer dependencies. */
export type MotionIntent = "transform" | "sequence" | "comparison" | "evidence-reveal" | "payoff" | "kinetic-type" | "focus" | "metric" | "none";
export interface MotionContext {
  copy: string;
  fullText?: string;
  role?: "hook" | "beat" | "cta";
  medium?: "image" | "video";
  assetKeywords?: readonly string[];
  approvedProof?: boolean;
  steps?: readonly string[];
}
export interface MotionDirection { intent: MotionIntent; labels: string[]; reason: string }

const phrases = (copy: string) => copy.split(/\s*(?:;|→|\bthen\b|\bnext\b|\bfinally\b)\s*/i)
  .map((part) => part.replace(/^(?:first|step\s*\d+)\s*[:,.-]?\s*/i, "").trim()).filter(Boolean);

export function selectMotionDirection(context: MotionContext): MotionDirection {
  const { copy, role, medium, approvedProof, steps } = context;
  const topic = `${context.fullText ?? copy} ${(context.assetKeywords ?? []).join(" ")}`;
  const choose = (intent: MotionIntent, labels: string[], reason: string): MotionDirection => ({ intent, labels, reason });
  if (approvedProof) return choose("evidence-reveal", [], "Approved evidence is the subject of this scene.");

  // Footage and subject showcases must stay visible, even when copy contains
  // incidental words such as 'from', 'first', 'before', or 'make'.
  const showcase = /\b(porsche|gt3|gt3rs|911|car|cars|racing|race|automotive|nightdrive|fashion|outfit|travel|landscape|cinematic edit)\b/i.test(topic);
  if (showcase || medium === "video") {
    if (role === "hook" || role === "cta") return choose("kinetic-type", [], "A brief text entrance leaves the footage clear.");
    if (/\b(detail|close.?up|aero|wing|wheel|brake|silhouette|texture|feature)\b/i.test(copy)) {
      return choose("focus", [], "Restrained framing supports a named subject detail.");
    }
    return choose("none", [], "The footage provides the motion; no diagram is needed.");
  }

  if (steps && steps.length >= 2) return choose("sequence", [...steps].slice(0, 4), "The scene contains actual named steps.");
  const comparison = copy.match(/^(.+?)\s+(?:versus|vs\.?)\s+(.+?)[.!]?$/i)
    ?? copy.match(/\bbefore:\s*(.+?)\s*[;|]\s*after:\s*(.+?)[.!]?$/i);
  if (comparison) return choose("comparison", [comparison[1]!.trim(), comparison[2]!.trim()], "Two explicitly named states are compared.");
  const transformation = copy.match(/\bfrom\s+(.{2,60}?)\s+(?:to|into)\s+(.{2,60}?)(?:[.!]|$)/i);
  if (transformation) return choose("transform", [transformation[1]!.trim(), "CHANGE", transformation[2]!.trim()], "The copy names both the starting state and result.");
  const parts = phrases(copy);
  if (parts.length >= 2 && /\b(first|step|then|next|finally)\b/i.test(copy)) {
    return choose("sequence", parts.slice(0, 4), "The copy describes a real ordered process.");
  }
  const metric = copy.match(/(?:[$€£]\s*\d[\d,.]*|\d[\d,.]*\s*(?:%|seconds?|minutes?|hours?|days?|weeks?|km\/h|mph|hp))/i);
  if (metric) return choose("metric", [metric[0].trim()], "Highlight the stated value without inventing a chart.");
  return choose("kinetic-type", [], "Typography carries this scene; there is no supported diagram.");
}
