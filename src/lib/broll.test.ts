import { describe, expect, it, vi } from "vitest";
import { applyAssetOverride, assignCueAssets, assetSize, matchAsset, preloadCueAssets, sourceOf, STOCK_POOL, tokenizeQuery, type PoolEntry } from "./broll";
import { FETCHED_STOCK } from "./broll-fetched";
import { MSTUDIO_PROFILE } from "./profile";

describe("broll pool", () => {
  it("settles a stalled video preload instead of hanging export", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("document", { createElement: () => ({
      readyState: 0, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      load: vi.fn(), play: () => Promise.resolve(),
    }) });
    try {
      const pending = preloadCueAssets([{ kind: "video", src: "/stalled.mp4", keywords: [] }]);
      await vi.advanceTimersByTimeAsync(4000);
      expect(await pending).toEqual([null]);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
  it("keeps 26 shipped images + 7 clip slots + 2 site case-study takes", () => {
    expect(STOCK_POOL.filter((e) => e.kind === "image").length).toBe(26 + FETCHED_STOCK.filter((e) => e.kind === "image").length);
    expect(STOCK_POOL.filter((e) => e.kind === "video").length).toBe(9 + FETCHED_STOCK.filter((e) => e.kind === "video").length);
  });

  it("tokenizes queries lowercase", () => {
    expect(tokenizeQuery("Fixed-Price Websites!")).toContain("fixed");
    expect(tokenizeQuery("Fixed-Price Websites!")).toContain("price");
  });

  it("matches website/code query to a build asset", () => {
    const hit = matchAsset("fixed-price websites that ship in two weeks code laptop build");
    expect(hit.src).toMatch(/broll/);
  });

  it("assigns 5 distinct assets for hook/beats/cta", () => {
    const cues = ["hook text ship", "beat1 team office", "beat2 proof growth", "beat3 offer price", "cta click action"];
    const out = assignCueAssets("fixed-price websites that ship in two weeks", MSTUDIO_PROFILE, cues);
    expect(out.length).toBe(5);
    expect(new Set(out.map((e) => e.src)).size).toBe(5);
  });

  it("biases the hook toward code-on-screen for code queries, site footage for site queries", () => {
    expect(matchAsset("code editor screen typescript build developer laptop").src).toBe("/broll/26.jpg");
    const hook =
      "Does your site load in under a second? Are your clients still waiting? AI builds a site in 15 minutes, but creators still pay for sites that convert.";
    const out = assignCueAssets(
      "AI builds a site in 15 minutes, but creators still pay for sites that convert",
      MSTUDIO_PROFILE,
      [hook, "beat one", "beat two", "beat three", "cta"],
    );
    // Site query: the hook opens on real site footage, never lifestyle filler.
    expect(out[0]!.src).toBe("/broll/clips/web-mstudioweb-hero.mp4");
  });

  it("maps clips to their photo source and keeps 5 distinct sources", () => {
    expect(sourceOf("/broll/18.jpg")).toBe("18");
    expect(sourceOf("/broll/clips/clip-4.mp4")).toBe("18");
    expect(sourceOf("/broll/clips/web-mstudioweb-hero.mp4")).toBe("web-hero");
    expect(sourceOf("/broll/clips/web-mstudioweb-scroll.mp4")).toBe("web-scroll");
    const out = assignCueAssets(
      "AI builds a site in 15 minutes, but creators still pay for sites that convert",
      MSTUDIO_PROFILE,
      ["hook text ship", "beat1 team office", "beat2 proof growth", "beat3 offer price", "cta click action"],
    );
    expect(new Set(out.map((e) => sourceOf(e.src))).size).toBe(5);
  });

  it("opens a site case-study video on real site footage, not generic stock", () => {
    const idea = "slow sites kill sales - this MSTUDIO speed site fixes it in 2 weeks";
    const out = assignCueAssets(idea, MSTUDIO_PROFILE, [
      "Templates lose deals. Custom builds close them. slow sites kill sales - this MSTUDIO speed site fixes it in 2 weeks.",
      "beat one",
      "beat two",
      "beat three",
      "cta",
    ]);
    expect(out[0]!.src).toBe("/broll/clips/web-mstudioweb-hero.mp4");
    expect(out.map((e) => e.src)).toContain("/broll/clips/web-mstudioweb-scroll.mp4");
  });

  it("lets an editorial override pin cues to case-study takes", () => {
    const auto: PoolEntry[] = [
      { kind: "image", src: "/broll/1.jpg", keywords: [] },
      { kind: "image", src: "/broll/2.jpg", keywords: [] },
    ];
    const out = applyAssetOverride(auto, [
      "/broll/clips/web-mstudioweb-hero.mp4",
      null,
    ]);
    expect(out[0]).toEqual({ kind: "video", src: "/broll/clips/web-mstudioweb-hero.mp4", keywords: [] });
    expect(out[1]).toEqual(auto[1]);
    expect(applyAssetOverride(auto, null)).toEqual(auto);
  });

  it("assetSize reads bitmap and video dims, never throws", () => {
    expect(assetSize({ width: 100, height: 50 })).toEqual({ w: 100, h: 50 });
    expect(assetSize({ videoWidth: 720, videoHeight: 1280 })).toEqual({ w: 720, h: 1280 });
    // Real <video> elements expose width/height as 0 — intrinsic dims must win.
    expect(assetSize({ width: 0, height: 0, videoWidth: 720, videoHeight: 1280 })).toEqual({
      w: 720,
      h: 1280,
    });
    expect(assetSize(null)).toEqual({ w: 0, h: 0 });
    expect(assetSize({ width: 0, height: 0 })).toEqual({ w: 0, h: 0 });
  });
});
