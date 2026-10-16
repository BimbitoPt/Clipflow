import { useEffect, useRef, useState } from "react";
import {
  CAMERA_DIRECTION_MAX,
  SHOT_EDIT_FIELDS,
  SHOT_MAX_SECS,
  SHOT_MIN_SECS,
  SHOT_PROMPT_MAX,
  changedShotCues,
  validateShotField,
  type PlanCost,
  type PlanEdits,
  type ProductionPlan,
  type ShotEditField,
} from "../lib/production-plan";

// Named ProductionPlanView to avoid clashing with the ProductionPlan type.
// Phase 1 Task 5: per-shot Regenerate + Approve buttons; export is gated on
// all 5 approvals (see useExportController E_PLAN_APPROVAL).
// Editable shot cards: prompt, camera direction and duration are document
// state (persisted + validated); editing any field unapproves that shot, and
// RESTORE GENERATED clears a shot's overrides (via `restoreShot`), matching
// ScriptBeats. `generated` is the pre-edit (seeded) plan — it supplies the
// generated duration shown beside an edited one, the restore target, and the
// signal for dropping stale drafts when a take is regenerated. Durations are
// plan spec only: the render still follows the script grid (`generated`).
// NOTE: docs/design-system.md §9 defines no `cf-panel`/`cf-card` classes —
// section reuses `cf-script-panel` (plain panel, no grid/sticky side effects)
// and each shot reuses the `cf-beat` deep card + `cf-caption-label` field
// pattern. The one added class is `cf-shot-edited` (per-field "edited" mark).
type EditHandler = (cueIndex: number, field: ShotEditField, value: string | number) => void;

export function ProductionPlanView({ plan, generated, cost, planSeeds, planEdits, approvedShots, onRegenerate, onToggleApprove, onEditShot, onRestoreShot, disabled }: {
  plan: ProductionPlan;
  generated: ProductionPlan;
  cost: PlanCost;
  planSeeds: Record<number, number>;
  planEdits: PlanEdits;
  approvedShots: boolean[];
  onRegenerate: (cueIndex: number) => void;
  onToggleApprove: (cueIndex: number) => void;
  onEditShot: EditHandler;
  onRestoreShot: (cueIndex: number) => void;
  disabled?: boolean;
}) {
  // In-progress field text and inline errors, keyed `cueIndex:field`. A draft
  // exists only while an edit is un-committed (invalid intermediate) — valid
  // input commits immediately so the plan, cost and preview stay live.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // A shot's generated card changing underneath an open draft (REGENERATE, a
  // new idea, a project restore) would leave stale text on screen, so drop
  // the drafts/errors for any cue whose generated values moved. Keyed on
  // `generated`, which typing never touches (edits go to `planEdits`), so an
  // in-progress draft survives normal editing.
  const previousGenerated = useRef(generated);
  useEffect(() => {
    const changed = changedShotCues(previousGenerated.current, generated);
    previousGenerated.current = generated;
    if (changed.length === 0) return;
    const drop = (record: Record<string, string>) => {
      const next = { ...record };
      for (const cue of changed) for (const field of SHOT_EDIT_FIELDS) delete next[`${cue}:${field}`];
      return next;
    };
    setDrafts(drop);
    setErrors(drop);
  }, [generated]);

  const change = (cueIndex: number, field: ShotEditField, raw: string) => {
    const key = `${cueIndex}:${field}`;
    // Validate the raw text so an empty duration reports "Enter a duration"
    // (Number("") would read as 0 and report the min-bound message instead).
    const error = validateShotField(field, raw);
    setDrafts((current) => ({ ...current, [key]: raw }));
    setErrors((current) => {
      const next = { ...current };
      if (error) next[key] = error;
      else delete next[key];
      return next;
    });
    if (!error) onEditShot(cueIndex, field, field === "durationSecs" ? Number(raw) : raw);
  };

  // Blur drops the draft: a committed value already equals the plan, and an
  // invalid one reverts to it — either way the field re-syncs to document state.
  const settle = (cueIndex: number, field: ShotEditField) => {
    const key = `${cueIndex}:${field}`;
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  return (
    <section className="cf-script-panel" aria-label="Production plan">
      <div className="cf-panel-heading"><h2>Production plan</h2><p>Style: {plan.style.packLabel} · Voice: {plan.style.voice} · {plan.totalSecs}s plan spec (render stays {generated.totalSecs}s) · edit a prompt, camera or duration, then approve.</p></div>
      {plan.shots.map((shot) => {
        const take = planSeeds[shot.cueIndex] ?? 0;
        const approved = approvedShots[shot.cueIndex] === true;
        const edit = planEdits[shot.cueIndex];
        const generatedShot = generated.shots[shot.cueIndex];
        const mark = (field: ShotEditField) => edit?.[field] !== undefined ? <span className="cf-shot-edited">edited</span> : null;
        const promptKey = `${shot.cueIndex}:imagePrompt`;
        const cameraKey = `${shot.cueIndex}:cameraDirection`;
        const durationKey = `${shot.cueIndex}:durationSecs`;
        return (
          <article key={shot.cueIndex} className="cf-beat">
            <h3>{shot.sceneLabel} ({shot.kind}, {shot.durationSecs}s{generatedShot && shot.durationSecs !== generatedShot.durationSecs ? ` · generated ${generatedShot.durationSecs}s` : ""}){take > 0 ? ` · take ${take}` : ""}</h3>
            <label className="cf-caption-label"><span>Prompt{mark("imagePrompt")}</span>
              <textarea aria-label={`Shot ${shot.cueIndex + 1} image prompt`} disabled={disabled} rows={2} maxLength={SHOT_PROMPT_MAX} value={drafts[promptKey] ?? shot.imagePrompt} onChange={(event) => change(shot.cueIndex, "imagePrompt", event.target.value)} onBlur={() => settle(shot.cueIndex, "imagePrompt")} />
            </label>
            {errors[promptKey] && <small className="cf-error" role="alert">{errors[promptKey]}</small>}
            <label className="cf-caption-label"><span>Camera direction{mark("cameraDirection")}</span>
              <input aria-label={`Shot ${shot.cueIndex + 1} camera direction`} disabled={disabled} maxLength={CAMERA_DIRECTION_MAX} value={drafts[cameraKey] ?? shot.cameraDirection} onChange={(event) => change(shot.cueIndex, "cameraDirection", event.target.value)} onBlur={() => settle(shot.cueIndex, "cameraDirection")} />
            </label>
            {errors[cameraKey] && <small className="cf-error" role="alert">{errors[cameraKey]}</small>}
            <label className="cf-caption-label"><span>Duration (seconds){mark("durationSecs")}</span>
              <input type="number" aria-label={`Shot ${shot.cueIndex + 1} duration in seconds`} disabled={disabled} min={SHOT_MIN_SECS} max={SHOT_MAX_SECS} step={0.1} value={drafts[durationKey] ?? String(shot.durationSecs)} onChange={(event) => change(shot.cueIndex, "durationSecs", event.target.value)} onBlur={() => settle(shot.cueIndex, "durationSecs")} />
            </label>
            {errors[durationKey] && <small className="cf-error" role="alert">{errors[durationKey]}</small>}
            <p>Motion: {shot.motionVariant}{edit?.durationSecs !== undefined ? " · duration is spec only, the render keeps the script grid" : ""}</p>
            <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginTop: 9 }}>
              <button type="button" className="cf-button cf-button-secondary" disabled={disabled} onClick={() => onRegenerate(shot.cueIndex)}>REGENERATE</button>
              {edit && <button type="button" className="cf-button cf-button-secondary" disabled={disabled} onClick={() => onRestoreShot(shot.cueIndex)}>RESTORE GENERATED</button>}
              <label className="cf-proof-approval"><input type="checkbox" disabled={disabled} checked={approved} onChange={() => onToggleApprove(shot.cueIndex)} /><span><b>Approved</b><small>Shot {shot.cueIndex + 1} is locked for export.</small></span></label>
            </div>
          </article>
        );
      })}
      <p>Estimated cost: {cost.units} units ({cost.breakdown.shots} shots, {cost.breakdown.voiceSecs}s voice, {cost.renderSecs}s spec duration).</p>
    </section>
  );
}
