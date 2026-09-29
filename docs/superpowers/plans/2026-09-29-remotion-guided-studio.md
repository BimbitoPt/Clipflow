# Remotion Guided Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CSV-first creation and crowded batch review with a guided, readable production workspace.

**Architecture:** Keep the existing API and renderer. Serialize structured briefs to the existing CSV endpoint; reorganize client components around a persistent preview, focused inspector tabs, and state-aware actions. No clip schema migration.

**Tech Stack:** Next.js 14, React 18, TypeScript, CSS, Vitest, Remotion Player.

## Global Constraints

- Mixed-brand batches contain 10–20 clips; saved clip status controls render/export eligibility.
- Existing rendered media and scene manifests remain unchanged until an operator edits and re-approves a clip.
- Studio uses Clipflow black/lime; per-clip brand colors are identifiers, not an alternate theme.

---

### Task 1: Guided batch entry

**Files:** `remotion-studio/src/lib/csv.ts`, `remotion-studio/src/lib/csv.test.ts`, `remotion-studio/components/BatchCreator.tsx`, `remotion-studio/app/globals.css`.

**Interfaces:** Add `stringifyCsv(headers: string[], records: Record<string, string>[]): string`. The guided form uses the existing `/api/batches` POST `{name,csv}`.

- [ ] Add a CSV round-trip test with commas, quotes and line breaks; verify it fails before implementation.
- [ ] Implement `stringifyCsv` with RFC-style double quote escaping and run the focused test.
- [ ] Build a 10-row guided brief form, expandable details, row counts, inline missing-field indicators, and a CSV import toggle. Preserve the existing CSV validation response.
- [ ] Verify 10/20 limits and creation through a browser smoke check, then commit.

### Task 2: Review workspace hierarchy

**Files:** `remotion-studio/components/BatchWorkspace.tsx`, `remotion-studio/components/ClipReviewGrid.tsx`, `remotion-studio/components/RenderProgress.tsx`, `remotion-studio/app/globals.css`.

**Interfaces:** Existing `ClipReviewGrid` props stay the same. Batch state derives counts from `ClipBrief.status`; render and export calls stay unchanged.

- [ ] Replace the overflowing heading/action row with a compact overview and one prominent next production action.
- [ ] Turn the tiny card grid into a readable queue with brand accent, hook, duration, and explicit status; keep selected clip obvious.
- [ ] Rework the layout into queue, persistent preview, and inspector at desktop; stack and provide an accessible clip picker on mobile.
- [ ] Verify the existing ten-clip batch at 1130px and 390px, then commit.

### Task 3: Focused inspector and scenes

**Files:** `remotion-studio/components/ClipEditor.tsx`, `remotion-studio/components/ClipPlayer.tsx`, `remotion-studio/app/globals.css`.

**Interfaces:** `ClipEditor` retains `{clip,brand,onChanged}`. Save sends the current PUT patch; review uses the existing review route. Scene fields serialize to `sceneCopy`.

- [ ] Split controls into Story, Visuals, Voice, and Publish tabs, keeping draft state mounted across tabs.
- [ ] Add a scene strip synchronized with the same scene plan used by the player; expose per-scene text and inspectable media/background labels.
- [ ] Add dirty-draft safeguards when switching clips, clear pending errors and save confirmations, and keep the preview visible while editing.
- [ ] Verify save, approval, voice and download states on a real batch without changing rendered output, then commit.

### Task 4: Full verification and merge

**Files:** No new source files expected.

- [ ] Run `npm test` and `npm run build` in `remotion-studio`.
- [ ] Complete desktop/mobile browser smoke checks of guided creation and review; fix any regressions and re-run relevant checks.
- [ ] Run `git diff --check`, review the branch diff, commit remaining fixes, and fast-forward merge to local `master`.
