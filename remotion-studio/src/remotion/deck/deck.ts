import { DURATIONS } from "../../../../shared/motion-tokens";

/**
 * Demo deck model (America.gov-style: code-driven keynote, reversible,
 * presenter-paced). Frame math is pure and total: the live player seeks to
 * build-start frames and the MP4 export renders the same frames, so stepping
 * back and forth can never diverge from the recording.
 */

export interface DeckSlide {
  id: string;
  eyebrow?: string;
  title: string;
  points: string[];
  /** Optional video centerpiece (staticFile path). The slide holds long
   * enough to play it through when holdFrames is set. */
  media?: { src: string };
  /** Per-slide hold override (frames). Defaults to deck.holdFrames. */
  holdFrames?: number;
}

export interface Deck {
  title: string;
  fps: number;
  slides: DeckSlide[];
  /** Hold per build state (frames). */
  holdFrames: number;
  /** Transition into the next build (frames). */
  transitionFrames: number;
}

export function createDeck(input: {
  title: string;
  slides: DeckSlide[];
  fps?: number;
  holdFrames?: number;
  transitionFrames?: number;
}): Deck {
  if (input.slides.length === 0) throw new Error("E_DECK_EMPTY: a deck needs at least one slide");
  return {
    title: input.title,
    fps: input.fps ?? 30,
    slides: input.slides,
    holdFrames: input.holdFrames ?? 90,
    transitionFrames: input.transitionFrames ?? DURATIONS.transition,
  };
}

/** Build states on a slide: 0 = title only, k = first k points revealed. */
export function buildsOnSlide(slide: DeckSlide): number {
  return slide.points.length + 1;
}

/** Total build states in the deck. */
export function totalBuilds(deck: Deck): number {
  return deck.slides.reduce((n, s) => n + buildsOnSlide(s), 0);
}

/** Global build index -> (slide, build). Clamped into range. */
export function locateBuild(deck: Deck, g: number): { slide: number; build: number } {
  const total = totalBuilds(deck);
  const clamped = Math.max(0, Math.min(total - 1, Math.floor(g)));
  let rest = clamped;
  for (let s = 0; s < deck.slides.length; s++) {
    const n = buildsOnSlide(deck.slides[s]);
    if (rest < n) return { slide: s, build: rest };
    rest -= n;
  }
  const last = deck.slides.length - 1;
  return { slide: last, build: buildsOnSlide(deck.slides[last]) - 1 };
}

/** First frame of a slide (its build 0). */
export function slideStartFrame(deck: Deck, slide: number): number {
  const s = Math.max(0, Math.min(deck.slides.length - 1, slide));
  let base = 0;
  for (let i = 0; i < s; i++) base += buildsOnSlide(deck.slides[i]);
  return buildStartFrame(deck, base);
}

/** Hold frames of global build g (per-slide override or deck default). */
export function buildHold(deck: Deck, g: number): number {
  const { slide } = locateBuild(deck, g);
  return deck.slides[slide].holdFrames ?? deck.holdFrames;
}

/** First frame of global build g. */
export function buildStartFrame(deck: Deck, g: number): number {
  const total = totalBuilds(deck);
  const clamped = Math.max(0, Math.min(total - 1, Math.floor(g)));
  let start = 0;
  for (let i = 0; i < clamped; i++) start += buildHold(deck, i) + deck.transitionFrames;
  return start;
}

/** Full deck length in frames (no trailing transition after the last build). */
export function totalFrames(deck: Deck): number {
  const g = totalBuilds(deck);
  let holds = 0;
  for (let i = 0; i < g; i++) holds += buildHold(deck, i);
  return holds + (g - 1) * deck.transitionFrames;
}

export type DeckPhase = "hold" | "transition";

/** Frame -> build + phase. Pure: same frame always renders the same pixels. */
export function locateFrame(
  deck: Deck,
  frame: number,
): { g: number; slide: number; build: number; phase: DeckPhase; progress: number } {
  const f = Math.max(0, Math.min(totalFrames(deck) - 1, Math.floor(frame)));
  const total = totalBuilds(deck);
  // Walk builds; variable holds mean strides differ per build.
  let g = 0;
  while (g < total - 1) {
    const start = buildStartFrame(deck, g);
    const end = start + buildHold(deck, g) + deck.transitionFrames;
    if (f < end) break;
    g++;
  }
  const start = buildStartFrame(deck, g);
  const local = f - start;
  const lastFrameOfBuild = g === total - 1;
  if (!lastFrameOfBuild && local >= buildHold(deck, g)) {
    const { slide, build } = locateBuild(deck, g);
    return { g, slide, build, phase: "transition", progress: (local - buildHold(deck, g)) / deck.transitionFrames };
  }
  const { slide, build } = locateBuild(deck, g);
  return { g, slide, build, phase: "hold", progress: local / buildHold(deck, g) };
}

/** Cursor is just a global build index — stepping is index math, so every
 * transition is exactly reversible by construction. */
export type DeckCursor = number;

export type DeckAction = { type: "next" } | { type: "prev" } | { type: "goto"; g: number } | { type: "reset" };

export function deckReducer(deck: Deck, cursor: DeckCursor, action: DeckAction): DeckCursor {
  const last = totalBuilds(deck) - 1;
  switch (action.type) {
    case "next":
      return Math.min(last, cursor + 1);
    case "prev":
      return Math.max(0, cursor - 1);
    case "goto":
      return Math.max(0, Math.min(last, Math.floor(action.g)));
    case "reset":
      return 0;
  }
}
