import { describe, expect, it } from "vitest";
import {
  buildHold,
  buildStartFrame,
  createDeck,
  deckReducer,
  locateBuild,
  locateFrame,
  slideStartFrame,
  totalBuilds,
  totalFrames,
  type Deck,
} from "./deck";
import { clipflowLaunchDeck } from "./clipflow-launch";

const deck: Deck = createDeck({
  title: "Test",
  fps: 30,
  holdFrames: 90,
  transitionFrames: 15,
  slides: [
    { id: "a", title: "A", points: ["a1", "a2"] },
    { id: "b", title: "B", points: ["b1"] },
  ],
});

describe("deck builds", () => {
  it("counts builds per slide (title + one per point)", () => {
    expect(totalBuilds(deck)).toBe(3 + 2);
  });

  it("maps global indexes to slide/build", () => {
    expect(locateBuild(deck, 0)).toEqual({ slide: 0, build: 0 });
    expect(locateBuild(deck, 2)).toEqual({ slide: 0, build: 2 });
    expect(locateBuild(deck, 3)).toEqual({ slide: 1, build: 0 });
    expect(locateBuild(deck, 4)).toEqual({ slide: 1, build: 1 });
  });

  it("clamps out-of-range indexes", () => {
    expect(locateBuild(deck, -5)).toEqual({ slide: 0, build: 0 });
    expect(locateBuild(deck, 99)).toEqual({ slide: 1, build: 1 });
  });

  it("rejects empty decks", () => {
    expect(() => createDeck({ title: "x", slides: [] })).toThrow(/E_DECK_EMPTY/);
  });
});

describe("deckReducer", () => {
  it("walks forward and back reversibly", () => {
    let c = 0;
    const forward: number[] = [];
    for (let i = 0; i < totalBuilds(deck); i++) {
      forward.push(c);
      c = deckReducer(deck, c, { type: "next" });
    }
    expect(forward).toEqual([0, 1, 2, 3, 4]);
    expect(c).toBe(4);
    for (let i = forward.length - 1; i >= 0; i--) {
      expect(c).toBe(forward[i]);
      c = deckReducer(deck, c, { type: "prev" });
    }
    expect(c).toBe(0);
  });

  it("clamps at both ends", () => {
    expect(deckReducer(deck, 0, { type: "prev" })).toBe(0);
    expect(deckReducer(deck, 4, { type: "next" })).toBe(4);
    expect(deckReducer(deck, 2, { type: "goto", g: 99 })).toBe(4);
    expect(deckReducer(deck, 2, { type: "reset" })).toBe(0);
  });
});

describe("deck frame math", () => {
  it("spaces builds by hold + transition", () => {
    expect(buildStartFrame(deck, 0)).toBe(0);
    expect(buildStartFrame(deck, 1)).toBe(105);
    expect(slideStartFrame(deck, 0)).toBe(0);
    expect(slideStartFrame(deck, 1)).toBe(3 * 105);
    expect(totalFrames(deck)).toBe(5 * 90 + 4 * 15);
  });

  it("locates hold and transition phases", () => {
    expect(locateFrame(deck, 0)).toMatchObject({ g: 0, phase: "hold" });
    expect(locateFrame(deck, 89)).toMatchObject({ g: 0, phase: "hold" });
    const t = locateFrame(deck, 90);
    expect(t).toMatchObject({ g: 0, phase: "transition" });
    expect(t.progress).toBeCloseTo(0, 5);
    expect(locateFrame(deck, 105)).toMatchObject({ g: 1, phase: "hold" });
    const last = locateFrame(deck, totalFrames(deck) - 1);
    expect(last).toMatchObject({ g: 4, phase: "hold" });
  });

  it("round-trips build starts back to their builds", () => {
    for (let g = 0; g < totalBuilds(deck); g++) {
      expect(locateFrame(deck, buildStartFrame(deck, g)).g).toBe(g);
    }
  });

describe("sample launch deck", () => {
  it("carries the engine-made video centerpiece with a full-play hold", () => {
    const deck = clipflowLaunchDeck();
    const media = deck.slides.filter((s) => s.media);
    expect(media.length).toBe(1);
    expect(media[0].media?.src).toBe("demo/clipflow-demo.mp4");
    // 41s demo at 30fps = 1230 frames; hold must cover it.
    expect(media[0].holdFrames ?? 0).toBeGreaterThanOrEqual(1230);
    expect(totalFrames(deck)).toBeGreaterThan(0);
  });
});
  it("supports per-slide hold overrides (media slides)", () => {
    const wide: Deck = createDeck({
      title: "V",
      fps: 30,
      holdFrames: 90,
      transitionFrames: 15,
      slides: [
        { id: "a", title: "A", points: ["a1"] },
        { id: "v", title: "V", points: [], media: { src: "demo/x.mp4" }, holdFrames: 300 },
        { id: "b", title: "B", points: [] },
      ],
    });
    // Builds: a0,a1 | v0 | b0  →  holds 90,90,300,90
    expect(totalBuilds(wide)).toBe(4);
    expect(buildHold(wide, 2)).toBe(300);
    expect(buildStartFrame(wide, 2)).toBe(2 * (90 + 15));
    expect(buildStartFrame(wide, 3)).toBe(2 * (90 + 15) + 300 + 15);
    expect(totalFrames(wide)).toBe(90 + 90 + 300 + 90 + 3 * 15);
    expect(slideStartFrame(wide, 2)).toBe(buildStartFrame(wide, 3));
    for (let g = 0; g < totalBuilds(wide); g++) {
      expect(locateFrame(wide, buildStartFrame(wide, g)).g).toBe(g);
    }
    expect(locateFrame(wide, buildStartFrame(wide, 2) + 299).g).toBe(2);
    expect(locateFrame(wide, buildStartFrame(wide, 2) + 300).phase).toBe("transition");
  });
});
