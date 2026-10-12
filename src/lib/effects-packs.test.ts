import { describe, expect, it } from "vitest";
import "../../shared/effects/packs/index";
import { NICHE_PROFILES } from "../../shared/effects/niches";
import { listEffects } from "../../shared/effects/registry";
import { validatePackRefs } from "../../shared/effects/packs/index";
import { FilterGraph } from "../../shared/effects/graph";
import type { FxCtx } from "../../shared/effects/types";

const CTX: FxCtx = { W: 720, H: 1280, fps: 30, duration: 8, accent: "#CFFF47", bg: "#080A0D", ink: "#F7F8FA", fontFile: "/f.ttf" };

describe("packs", () => {
  it("resolves every id referenced by the niche profiles", () => {
    expect(validatePackRefs(NICHE_PROFILES)).toEqual([]);
  });

  it("builds every registered effect without throwing", () => {
    expect(listEffects().length).toBeGreaterThan(20);
    for (const def of listEffects()) {
      for (const intensity of def.intensities) {
        const built = def.build({ start: 1, duration: 1.5, intensity, variant: 0.5, text: "Test words" }, CTX);
        expect(built.filters.length, def.id).toBeGreaterThan(0);
      }
    }
  });

  it("produces label-valid chains for every effect", () => {
    for (const def of listEffects()) {
      const g = new FilterGraph();
      const built = def.build({ start: 1, duration: 1.5, intensity: def.intensities[0], variant: 0.25 }, CTX);
      g.chain("[0:v]", built.filters);
      expect(g.validate(1), def.id).toEqual([]);
    }
  });

  it("keeps all overlay x/y positions resolution-relative", () => {
    for (const def of listEffects()) {
      const built = def.build({ start: 1, duration: 1, intensity: def.intensities[0], variant: 0.5 }, CTX);
      const joined = built.filters.join(",");
      // Bare nonzero numbers as x=/y= values are banned (0 is fine):
      // positions must derive from iw/ih/w/h/text_w. Boundary-aware so
      // shadowx=/borderw= don't false-positive.
      const re = /(^|[,:\[])([xy])=('?)(\d+)/g;
      const bad: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(joined)) !== null) {
        if (m[4] !== "0") bad.push(m[0]);
      }
      // drawbox (unlike drawtext) has no w/h vars — only iw/ih.
      // drawtext (unlike drawbox) has no iw/ih vars — only w/h/text_w.
      // zoompan knows time/on — never bare t.
      for (const f of built.filters) {
        if (f.startsWith("drawbox") && /'[wh]\*/.test(f)) bad.push(`drawbox w/h: ${f.slice(0, 60)}`);
        if (f.startsWith("drawtext") && /'[^']*\bi[wh]\b[^']*'/.test(f)) bad.push(`drawtext iw/ih: ${f.slice(0, 60)}`);
        if (/\bzoompan\b/.test(f) && /\bt\b/.test(f)) bad.push(`zoompan t: ${f.slice(0, 80)}`);
      }
      expect(bad, def.id).toEqual([]);
    }
  });
});
