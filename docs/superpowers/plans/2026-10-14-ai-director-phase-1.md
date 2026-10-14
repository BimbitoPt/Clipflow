# AI Director (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn one idea into a deterministic, editable production plan (5 shot cards with image prompts, camera directions, durations, style refs, cost estimate) with per-shot regeneration and approval gating export.

**Architecture:** Pure deterministic derivation (`src/lib/production-plan.ts`) from existing `buildScript`/`planFrames` output — no network, no new deps. Plan memo lives in `src/App.tsx` next to the existing script/timing memos; approval/seed state lives in `useClipflowProject` as document state; UI is a section between `SceneTray` and `ExportPanel`. Cloud providers plug in later behind a `PlanProvider` interface; this plan ships local-only.

**Tech Stack:** TypeScript, React (existing hooks), vitest (`npm test`), `npx tsc --noEmit`, `npm run build`. No new dependencies.

## Global Constraints

- Deterministic: same idea+profile+pack → byte-identical plan (hash-pick precedent from `src/lib/script.ts`).
- Local-first: zero network calls in derivation; cloud stays opt-in and out of scope here.
- One phase at a time; each task below is independently shippable and ends green (`npm test`, `tsc`, build).
- Foundation docs (`docs/product-design.md`, `docs/architecture.md`, `docs/design-system.md`) update in the same PR as behavior (roadmap ground rule 2).
- No placeholders: every step shows exact code/commands.

---

### Task 1: Roadmap amendment + feature branch (unblock scope)

**Files:**
- Modify: `docs/roadmap.md` (Phase 1 section)
- Modify: `docs/product-design.md` §9, `docs/architecture.md` §8 only if the amendment changes what they describe (else leave untouched)

**Interfaces:**
- Consumes: repo policy "new scope needs a roadmap amendment PR first"
- Produces: amended Phase 1 = AI Director scope (this plan's 6 tasks); branch `feat/ai-director-plan`; explicit non-goals: cloud LLM/image backends, prompt free-text editing, 1080p/paid paths

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feat/ai-director-plan
git status --short
```

Expected: clean tree on new branch (no output from `git status --short`).

- [ ] **Step 2: Amend `docs/roadmap.md` Phase 1**

Replace the Phase 1 goal line and checklist with:

```markdown
## Phase 1 — AI Director (editable production plan)

Goal: one idea becomes an editable production plan before any generation is committed.

- [ ] Deterministic shot-card derivation + cost estimate (local-only, tested)
- [ ] Production-plan UI: shot cards, per-shot regenerate + approve, cost summary
- [ ] Approval gates export; plan + approvals persist (session + native project)
- [ ] Export matrix filed: one Chrome + one desktop export of the same project

Exit: plan UI live, export gated on approval, suite + tsc + build green, matrix filed.
```

- [ ] **Step 3: Verify docs diff only**

Run: `git status --short` and `git diff --stat`
Expected: only `docs/roadmap.md` changed (plus `docs/product-design.md` / `docs/architecture.md` if Step 2 touched them); zero code changes

- [ ] **Step 4: Commit**

```bash
git add docs/roadmap.md docs/product-design.md docs/architecture.md
git commit -m "docs(roadmap): amend Phase 1 to AI Director production plan"
```

(If product-design/architecture were untouched, drop them from `git add` — commit exactly what `git status --short` showed.)

---

### Task 2: Deterministic plan derivation (the probe)

**Files:**
- Create: `src/lib/production-plan.ts`
- Create: `src/lib/production-plan.test.ts`

**Interfaces:**
- Consumes: `VideoScript` + `TimedCue{start,end,kind:hook|beat|cta,text}` from `src/lib/script.ts` (`buildScript(idea, profile, pack): VideoScript`); `PlannedFrame{t,cue:TimedCue,variant?,motionIntent?,motionLabels?}` from `src/lib/planner.ts` (`planFrames(script, fps, spans?, approvedProofByCue?, mediaByCue?)`); `NichePack{id,label,themes[{bg:[2],accent,font}],hooks,ctas,hashtags}` from `src/lib/packs.ts` (`loadPack(id)`; valid ids `"mstudio"`, `"clipflow"`); `Profile{niche,audience,offer,tone,proof}` from `src/lib/profile.ts`
- Produces: `ShotCard{cueIndex:0|1|2|3|4, kind:string, start:number, end:number, durationSecs:number, imagePrompt:string, cameraDirection:string, motionVariant:string, sceneLabel:string}`, `StyleRef{packId:string, packLabel:string, bg:[string,string], accent:string, font:string, voice:string, persona:string}`, `ProductionPlan{shots:ShotCard[], style:StyleRef, totalSecs:number}`, `buildProductionPlan(script, pack, voice): ProductionPlan`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildScript } from "./script";
import { loadPack } from "./packs";
import { MSTUDIO_PROFILE } from "./profile";
import { buildProductionPlan } from "./production-plan";

describe("production-plan", () => {
  it("derives 5 shot cards with durations matching the cue grid", () => {
    const pack = loadPack("clipflow");
    const script = buildScript("car detailing", MSTUDIO_PROFILE, pack);
    const plan = buildProductionPlan(script, pack, "af_heart");
    expect(plan.shots).toHaveLength(5);
    expect(plan.shots[0]!.durationSecs).toBe(4);
    expect(plan.totalSecs).toBe(45);
    expect(plan.shots.every((s) => s.imagePrompt.length > 20)).toBe(true);
    expect(plan.shots.every((s) => s.cameraDirection.length > 10)).toBe(true);
  });

  it("is deterministic for the same input", () => {
    const pack = loadPack("clipflow");
    const script = buildScript("car detailing", MSTUDIO_PROFILE, pack);
    const a = buildProductionPlan(script, pack, "af_heart");
    const b = buildProductionPlan(script, pack, "af_heart");
    expect(a).toEqual(b);
  });
});
```

(`"af_heart"` matches the `DEFAULT_VOICE` pin asserted in `src/lib/tts-local.test.ts`; durations 4s/45s match the fixed cue grid in `src/lib/script.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/production-plan.test.ts`
Expected: FAIL with module-not-found for `./production-plan`

- [ ] **Step 3: Write minimal implementation**

```ts
import type { NichePack } from "./packs";
import { planFrames } from "./planner";
import type { VideoScript } from "./script";

export interface ShotCard {
  cueIndex: 0 | 1 | 2 | 3 | 4;
  kind: string;
  start: number;
  end: number;
  durationSecs: number;
  imagePrompt: string;
  cameraDirection: string;
  motionVariant: string;
  sceneLabel: string;
}

export interface StyleRef {
  packId: string;
  packLabel: string;
  bg: [string, string];
  accent: string;
  font: string;
  voice: string;
  persona: string;
}

export interface ProductionPlan {
  shots: ShotCard[];
  style: StyleRef;
  totalSecs: number;
}

const CAMERA_BY_KIND: Record<string, string> = {
  hook: "Punch-in close-up, locked 9:16 center framing, fast 0.5s push",
  beat: "Slow lateral tracking shot, subject centered in safe zone",
  cta: "Static hero framing, centered, hold for end-card legibility",
};

export function buildProductionPlan(script: VideoScript, pack: NichePack, voice: string): ProductionPlan {
  const frames = planFrames(script, 30);
  // planFrames stores the same TimedCue object refs it received, so ===
  // matches the first rendered frame of each cue; fallback keeps us total.
  const variantByCue = script.cues.map((cue) => frames.find((f) => f.cue === cue)?.variant ?? "rays");
  const theme = pack.themes[0] ?? { bg: ["#080A0D", "#101418"] as [string, string], accent: "#FFFFFF", font: "system-ui" };
  const shots: ShotCard[] = script.cues.map((cue, i) => ({
    cueIndex: i as ShotCard["cueIndex"],
    kind: cue.kind,
    start: cue.start,
    end: cue.end,
    durationSecs: Math.round((cue.end - cue.start) * 10) / 10,
    imagePrompt: `${pack.label} style, ${theme.bg[0]} to ${theme.bg[1]} gradient backdrop, ${cue.text.slice(0, 120)}`,
    cameraDirection: CAMERA_BY_KIND[cue.kind] ?? CAMERA_BY_KIND.beat!,
    motionVariant: variantByCue[i]!,
    sceneLabel: cue.text.split(" ").slice(0, 4).join(" "),
  }));
  return {
    shots,
    style: {
      packId: pack.id, packLabel: pack.label, bg: theme.bg,
      accent: theme.accent, font: theme.font, voice,
      persona: `${pack.label} voice for ${script.cues.length} scenes`,
    },
    totalSecs: Math.round((script.cues[script.cues.length - 1]!.end - script.cues[0]!.start) * 10) / 10,
  };
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- src/lib/production-plan.test.ts`
Expected: PASS (2 tests)
Run: `npx tsc --noEmit`
Expected: exit 0, no output

- [ ] **Step 5: Commit**

```bash
git add src/lib/production-plan.ts src/lib/production-plan.test.ts
git commit -m "feat(plan): deterministic production-plan derivation from script"
```

---

### Task 3: Deterministic cost estimate

**Files:**
- Modify: `src/lib/production-plan.ts` (append estimator)
- Modify: `src/lib/production-plan.test.ts` (append suite)

**Interfaces:**
- Consumes: `ProductionPlan` from Task 2
- Produces: `PlanCost{units:number, renderSecs:number, breakdown:{shots:number, voiceSecs:number, pixels:number}}`, `estimatePlanCost(plan, opts:{voiceOn:boolean, width:number, height:number, fps:number}): PlanCost`

- [ ] **Step 1: Write the failing test (append)**

```ts
import { buildProductionPlan, estimatePlanCost } from "./production-plan";

describe("plan cost", () => {
  it("estimates cost from shots, voice seconds and pixels", () => {
    const pack = loadPack("clipflow");
    const script = buildScript("car detailing", MSTUDIO_PROFILE, pack);
    const plan = buildProductionPlan(script, pack, "af_heart");
    const cost = estimatePlanCost(plan, { voiceOn: true, width: 720, height: 1280, fps: 30 });
    expect(cost.breakdown.shots).toBe(5);
    expect(cost.breakdown.voiceSecs).toBe(45);
    expect(cost.units).toBeGreaterThan(0);
    const silent = estimatePlanCost(plan, { voiceOn: false, width: 720, height: 1280, fps: 30 });
    expect(silent.units).toBeLessThan(cost.units);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/production-plan.test.ts`
Expected: FAIL with "estimatePlanCost is not defined" (import error)

- [ ] **Step 3: Write minimal implementation (append to `src/lib/production-plan.ts`)**

```ts
export interface PlanCost {
  units: number;
  renderSecs: number;
  breakdown: { shots: number; voiceSecs: number; pixels: number };
}

export function estimatePlanCost(
  plan: ProductionPlan,
  opts: { voiceOn: boolean; width: number; height: number; fps: number },
): PlanCost {
  const pixels = opts.width * opts.height * opts.fps * plan.totalSecs;
  const units = plan.shots.length * 10 + (opts.voiceOn ? plan.totalSecs : 0) + Math.round(pixels / 1_000_000_000);
  return {
    units,
    renderSecs: plan.totalSecs,
    breakdown: { shots: plan.shots.length, voiceSecs: opts.voiceOn ? plan.totalSecs : 0, pixels },
  };
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- src/lib/production-plan.test.ts`
Expected: PASS (3 tests)
Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add src/lib/production-plan.ts src/lib/production-plan.test.ts
git commit -m "feat(plan): deterministic cost estimate from plan and export opts"
```

---

### Task 4: Plan memo + read-only UI section

**Files:**
- Modify: `src/hooks/useClipflowProject.ts` (document state only — no derived memos here)
- Create: `src/components/ProductionPlan.tsx` (shot cards + cost summary, read-only)
- Modify: `src/App.tsx` (plan + cost memos next to the existing script memo; render section)

**Interfaces:**
- Consumes: `buildProductionPlan`, `estimatePlanCost`, `ProductionPlan`, `PlanCost` from Tasks 2–3; `script` memo already in App; `voiceOn` already returned by `useClipflowProject`; `cf-` panel/card classes per `docs/design-system.md` §9
- Produces: `plan: ProductionPlan | null` + `cost: PlanCost | null` memos in App; `ProductionPlan` component with props `{ plan: ProductionPlan; cost: PlanCost }`

- [ ] **Step 1: Locate the memo and insertion anchors**

Run: `grep -n "buildScript(" src/App.tsx` and `grep -n "SceneTray\|ExportPanel" src/App.tsx`
Expected: line numbers for the script memo and the two JSX neighbors. The plan memo goes directly after the script memo; the section JSX goes between the two components.

- [ ] **Step 2: Add plan + cost memos in `src/App.tsx`**

```tsx
const plan = useMemo(
  () => (script && pack ? buildProductionPlan(script, pack, DEFAULT_VOICE) : null),
  [script, pack],
);
const cost = useMemo(
  () => (plan ? estimatePlanCost(plan, { voiceOn, width: 720, height: 1280, fps: 30 }) : null),
  [plan, voiceOn],
);
```

(Adapt variable names to the actual script/pack/voice identifiers found in Step 1: `script` is the existing memo, `pack` is the loaded `NichePack`, `voiceOn` comes from the hook, `DEFAULT_VOICE` is imported from `src/lib/tts-local.ts`. `720x1280@30` matches the export contract in `src/hooks/useExportController.ts`.)

- [ ] **Step 3: Create `src/components/ProductionPlan.tsx`**

```tsx
import type { PlanCost, ProductionPlan } from "../lib/production-plan";

export function ProductionPlanView({ plan, cost }: { plan: ProductionPlan; cost: PlanCost }) {
  return (
    <section className="cf-panel" aria-label="Production plan">
      <h2>Production plan</h2>
      <p>Style: {plan.style.packLabel} · Voice: {plan.style.voice} · {plan.totalSecs}s</p>
      {plan.shots.map((shot) => (
        <article key={shot.cueIndex} className="cf-card">
          <h3>{shot.sceneLabel} ({shot.kind}, {shot.durationSecs}s)</h3>
          <p>Prompt: {shot.imagePrompt}</p>
          <p>Camera: {shot.cameraDirection}</p>
          <p>Motion: {shot.motionVariant}</p>
        </article>
      ))}
      <p>Estimated cost: {cost.units} units ({cost.breakdown.shots} shots, {cost.breakdown.voiceSecs}s voice, {cost.renderSecs}s render)</p>
    </section>
  );
}
```

Reuse `cf-` panel/card classes only — no new global CSS. (Component named `ProductionPlanView` to avoid clashing with the `ProductionPlan` type import.)

- [ ] **Step 4: Render the section between `SceneTray` and `ExportPanel`**

```tsx
{plan && cost && <ProductionPlanView plan={plan} cost={cost} />}
```

- [ ] **Step 5: Verify**

Run: `npm test`
Expected: all files pass (no regressions)
Run: `npx tsc --noEmit` then `npm run build`
Expected: both green

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductionPlan.tsx src/App.tsx
git commit -m "feat(plan): production-plan section with shot cards and cost"
```

---

### Task 5: Per-shot regenerate + approval gating export

**Files:**
- Modify: `src/lib/production-plan.ts` (add `regenerateShot(plan, cueIndex, seed): ProductionPlan`)
- Modify: `src/hooks/useClipflowProject.ts` (add `planSeeds` + `approvedShots` document state + setters + reset)
- Modify: `src/components/ProductionPlan.tsx` (Regenerate + Approve buttons per card)
- Modify: `src/hooks/useExportController.ts` (block export unless all 5 approved)
- Modify: `src/lib/production-plan.test.ts` (regeneration tests)

**Interfaces:**
- Consumes: `ProductionPlan`, `ShotCard` from Task 2
- Produces: `regenerateShot(plan: ProductionPlan, cueIndex: number, seed: number): ProductionPlan` (deterministic: same seed → same card; different seed → rotated `motionVariant`/prompt variant; durations and other shots unchanged); `approvedShots: boolean[5]` threaded through `ExportContext`; export throws `E_PLAN_APPROVAL: shot N not approved — approve all 5 shots before exporting.`

- [ ] **Step 1: Write the failing tests (append)**

```ts
import { buildProductionPlan, regenerateShot } from "./production-plan";

describe("shot regeneration", () => {
  it("changes the card deterministically per seed without touching durations", () => {
    const pack = loadPack("clipflow");
    const script = buildScript("car detailing", MSTUDIO_PROFILE, pack);
    const plan = buildProductionPlan(script, pack, "af_heart");
    const regen = regenerateShot(plan, 0, 1);
    expect(regen.shots[0]).not.toEqual(plan.shots[0]);
    expect(regen.shots[0]!.durationSecs).toBe(plan.shots[0]!.durationSecs);
    expect(regenerateShot(plan, 0, 1)).toEqual(regen);
    expect(regen.shots.slice(1)).toEqual(plan.shots.slice(1));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/production-plan.test.ts`
Expected: FAIL with "regenerateShot is not defined" (import error)

- [ ] **Step 3: Implement `regenerateShot` (append to `src/lib/production-plan.ts`)**

```ts
const MOTION_POOL = ["rays", "blobs", "grid", "waves", "pulse"];

export function regenerateShot(plan: ProductionPlan, cueIndex: number, seed: number): ProductionPlan {
  const shots = plan.shots.map((shot, i) => {
    if (i !== cueIndex) return shot;
    const base = MOTION_POOL.indexOf(shot.motionVariant);
    const safe = base < 0 ? 0 : base;
    const next = MOTION_POOL[(((safe + seed) % MOTION_POOL.length) + MOTION_POOL.length) % MOTION_POOL.length]!;
    return {
      ...shot,
      motionVariant: next,
      imagePrompt: `${shot.imagePrompt} (take ${seed}, ${next} motion)`,
    };
  });
  return { ...plan, shots };
}
```

(The normalized modulo keeps rotation valid for any seed and for variants outside the pool.)

- [ ] **Step 4: Add state, buttons, and the export gate**

In `useClipflowProject` (next to the `sceneChoices` state at line ~78), add:

```tsx
const [planSeeds, setPlanSeeds] = useState<Record<number, number>>({});
const [approvedShots, setApprovedShots] = useState<boolean[]>([false, false, false, false, false]);
```

Return all four names from the hook. Reset both when the script inputs change: wherever `setIdea`/`setScriptOverrides`/`setPackId` invalidate derived output, also call `setPlanSeeds({})` and `setApprovedShots([false, false, false, false, false])` — stale approval must never survive a new script (same rationale as the async-upload scene-capture fix). In App, the plan memo from Task 4 becomes:

```tsx
const withSeeds = useMemo(() => {
  if (!plan) return null;
  return Object.entries(planSeeds).reduce(
    (acc, [cue, seed]) => regenerateShot(acc, Number(cue), seed),
    plan,
  );
}, [plan, planSeeds]);
```

Pass `withSeeds` (not `plan`) to `ProductionPlanView`. Buttons per card (checkbox precedent: `SceneTray` `approvedProof`): "Regenerate" calls `setPlanSeeds(s => ({ ...s, [shot.cueIndex]: (s[shot.cueIndex] ?? 0) + 1 }))`; "Approve" toggles `setApprovedShots(a => a.map((v, i) => (i === shot.cueIndex ? !v : v)))`.

In `useExportController.runExport`, right after the voice-asset readiness check (same pattern as the `E_TTS_MODEL` error), add:

```ts
const unapproved = ctx.approvedShots.findIndex((a) => !a);
if (unapproved !== -1) {
  throw new Error(`E_PLAN_APPROVAL: shot ${unapproved + 1} not approved — approve all 5 shots before exporting.`);
}
```

Add `approvedShots: boolean[]` to the `ExportContext` interface and pass it at the App call site (same passthrough pattern as the `approvedProofByCue` array passed into `planFrames` at `useClipflowProject.ts:138`).

- [ ] **Step 5: Verify**

Run: `npm test`
Expected: all pass
Run: `npx tsc --noEmit` then `npm run build`
Expected: both green

- [ ] **Step 6: Commit**

```bash
git add src/lib/production-plan.ts src/lib/production-plan.test.ts src/hooks/useClipflowProject.ts src/hooks/useExportController.ts src/components/ProductionPlan.tsx src/App.tsx
git commit -m "feat(plan): per-shot regenerate and approval-gated export"
```

---

### Task 6: Persistence + verification + PR

**Files:**
- Modify: `src/lib/session.ts` (`SessionSnapshot` + `readSession`/`writeSession`)
- Modify: `src/lib/session.test.ts` (round-trip test)
- Modify: `src/lib/desktop.ts` (`DesktopProjectV1` interface — the TS mirror sent to the `save_project` command)
- Modify: `docs/product-design.md` §3–4 + §9, `docs/architecture.md` §3 + §8, `docs/design-system.md` §9 (behavior shipped this PR)

**Interfaces:**
- Consumes: `ProductionPlan` inputs from Task 5; `SessionSnapshot` (fields: idea, scriptOverrides, sceneChoices[5], captionMode, captionOverrides, voiceOn, visualEffect, platform, credit, pack; whole-reject `null` on malformed — `src/lib/session.ts:24-101`); `KeyValueStore{getItem,setItem,removeItem}` (`src/lib/storage.ts:6-10`); `browserStorage` singleton
- Produces: persisted `{ planSeeds, approvedShots }` (small, versionable — the plan itself is re-derived via `buildProductionPlan` on load so stored bytes can never disagree with the script); restored approvals on reload/reopen; PR with export matrix filed

- [ ] **Step 1: Extend `SessionSnapshot` with optional plan fields**

```ts
export interface SessionSnapshot {
  idea: string;
  // ... all existing fields unchanged ...
  pack: PackId;
  planSeeds?: Record<number, number>;
  approvedShots?: boolean[];
}
```

In `readSession`: accept `planSeeds` only when it is a plain object whose keys are all in `{"0","1","2","3","4"}` (JSON object keys are strings; validate before use), else default `{}`. Accept `approvedShots` only when it is an array of exactly 5 booleans, else default `[false, false, false, false, false]`. Any violation falls back to the defaults — it must never return `null` for the whole session because of plan fields (precedent: `platform`/`pack` fallbacks at `session.ts:91-96`). In `writeSession`: persist both fields alongside the existing payload.

**Reset coordination (known interaction):** the Task 5 reset effect in `useClipflowProject` (declared after the restore effect; deps include `idea`/`packId`) will re-fire when restored values land and wipe the restored approvals. Coordinate explicitly: either (a) restore plan state AFTER the reset effect settles (ordering + settled flag), or (b) guard the reset with a ref that skips the first post-restore run. Whichever you choose, extend the round-trip test below with a restore-simulation asserting restored approvals survive.

- [ ] **Step 2: Add the round-trip test (append to `src/lib/session.test.ts`)**

```ts
import { readSession, writeSession } from "./session";
import type { KeyValueStore } from "./storage";

const memStore = (): KeyValueStore => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, v); },
    removeItem: (k) => { m.delete(k); },
  };
};

it("round-trips plan seeds and approvals", () => {
  const store = memStore();
  writeSession(store, {
    idea: "car detailing",
    scriptOverrides: {},
    sceneChoices: Array.from({ length: 5 }, () => ({ kind: "auto-ai" as const })),
    captionMode: "auto",
    captionOverrides: {},
    voiceOn: true,
    visualEffect: "none",
    platform: "tiktok",
    credit: false,
    pack: "clipflow",
    planSeeds: { 0: 1 },
    approvedShots: [true, false, false, false, false],
  });
  const back = readSession(store);
  expect(back?.planSeeds).toEqual({ 0: 1 });
  expect(back?.approvedShots).toEqual([true, false, false, false, false]);
});
```

Run: `npm test -- src/lib/session.test.ts`
Expected: PASS.

- [ ] **Step 3: Carry plan state in the native project**

Extend `DesktopProjectV1` (`src/lib/desktop.ts:15`) with optional fields:

```ts
planSeeds?: Record<number, number>;
approvedShots?: boolean[];
```

Optional = old project files still open. On open, apply the same validation as Step 1 (bad keys/array → defaults, never a hard failure for plan fields alone; malformed project core keeps the existing whole-reject behavior, same precedent as the timing-sidecar validator).

- [ ] **Step 4: Update foundation docs in the same PR**

`product-design.md` (loop order + screen table + §9 vectors), `architecture.md` (state table, downstream flow), `design-system.md` (only if new classes were added; else one line stating reuse).

- [ ] **Step 5: Run full gates and record numbers**

Run: `npm test 2>&1 | tail -5`
Expected: all green — record the file/test counts for the PR body
Run: `npx tsc --noEmit`
Expected: exit 0
Run: `npm run build`
Expected: green
Manual: one Chrome export (voice on) + one desktop export of the same project; file durations + watch-once notes in the PR body (roadmap rule 4).

- [ ] **Step 6: Open PR (branch already exists from Task 1)**

```bash
git push -u origin feat/ai-director-plan
gh pr create --title "feat(plan): AI Director production plan" --body "Tasks 1-6 per docs/superpowers/plans/2026-10-14-ai-director-phase-1.md. Tests: <counts> green. tsc clean. Build green. Export matrix: <notes>."
```

---

## Explicit non-goals (deferred, not promised)

- Cloud LLM/image backends — interface seam only: `PlanProvider{ derive(script,pack,voice): ProductionPlan; regenerate(plan,cue,seed): ProductionPlan }` with the deterministic module as the sole implementation. No keys, no fetch, no new deps in this plan.
- Free-text editing of image prompts — regeneration + approval + existing beat overrides are v1 editing.
- Character system beyond the `StyleRef.persona` template line.
- 1080p/paid paths, batch-studio handoff, caption presets — untouched roadmap items.
