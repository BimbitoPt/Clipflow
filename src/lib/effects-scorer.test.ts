import { describe, expect, it } from "vitest";
import { detectNiche, keywordScorer } from "../../shared/effects/scorer";
import { NICHE_PROFILES } from "../../shared/effects/niches";
import type { NicheProfile } from "../../shared/effects/types";

const mini: NicheProfile[] = [
  { id: "universal", label: "U", keywords: [], pack: { effects: [], captionStyle: "pop", pacing: 8 } },
  { id: "editing", label: "E", keywords: ["edit", "timeline"], pack: { effects: [], captionStyle: "pop", pacing: 6 } },
  { id: "gaming", label: "G", keywords: ["boss", "clutch"], pack: { effects: [], captionStyle: "pop", pacing: 5 } },
];

describe("keywordScorer", () => {
  it("counts hits case-insensitively", () => {
    const p = mini[1];
    expect(keywordScorer("Edit the EDIT timeline", p)).toBe(3);
  });

  it("respects word boundaries", () => {
    const p = mini[1];
    expect(keywordScorer("credit accredited", p)).toBe(0);
    expect(keywordScorer("an edit", p)).toBe(1);
  });
});

describe("detectNiche", () => {
  it("honors an explicit override", () => {
    expect(detectNiche({ overrideId: "gaming", transcript: "edit timeline", profiles: mini }).id).toBe("gaming");
  });

  it("ignores unknown overrides and scores instead", () => {
    const r = detectNiche({ overrideId: "nope", transcript: "boss clutch", profiles: mini });
    expect(r.id).toBe("gaming");
    expect(r.method).toBe("scored");
  });

  it("weights description over transcript", () => {
    const r = detectNiche({ description: "edit", transcript: "boss boss", profiles: mini });
    expect(r.id).toBe("editing");
  });

  it("falls back to universal on no signal", () => {
    const r = detectNiche({ transcript: "hello world", profiles: mini });
    expect(r.id).toBe("universal");
    expect(r.method).toBe("fallback");
  });

  it("accepts a pluggable scorer", () => {
    const r = detectNiche({ transcript: "anything", profiles: mini, scorer: (t, p) => (p.id === "gaming" ? 9 : 0) });
    expect(r.id).toBe("gaming");
  });
});

describe("bundled profiles", () => {
  it("loads with unique ids and valid packs", () => {
    const ids = NICHE_PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("universal");
    for (const p of NICHE_PROFILES) {
      expect(p.pack.pacing).toBeGreaterThan(0);
      expect(p.pack.captionStyle.length).toBeGreaterThan(0);
    }
  });
});
