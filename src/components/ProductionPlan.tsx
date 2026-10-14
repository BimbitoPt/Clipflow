import type { PlanCost, ProductionPlan } from "../lib/production-plan";

// Named ProductionPlanView to avoid clashing with the ProductionPlan type.
// Phase 1 Task 5: per-shot Regenerate + Approve buttons; export is gated on
// all 5 approvals (see useExportController E_PLAN_APPROVAL).
// NOTE: docs/design-system.md §9 defines no `cf-panel`/`cf-card` classes —
// section reuses `cf-script-panel` (plain panel, no grid/sticky side effects)
// and each shot reuses the `cf-beat` deep card. No new global CSS.
export function ProductionPlanView({ plan, cost, planSeeds, approvedShots, onRegenerate, onToggleApprove, disabled }: {
  plan: ProductionPlan;
  cost: PlanCost;
  planSeeds: Record<number, number>;
  approvedShots: boolean[];
  onRegenerate: (cueIndex: number) => void;
  onToggleApprove: (cueIndex: number) => void;
  disabled?: boolean;
}) {
  return (
    <section className="cf-script-panel" aria-label="Production plan">
      <div className="cf-panel-heading"><h2>Production plan</h2><p>Style: {plan.style.packLabel} · Voice: {plan.style.voice} · {plan.totalSecs}s</p></div>
      {plan.shots.map((shot) => {
        const take = planSeeds[shot.cueIndex] ?? 0;
        const approved = approvedShots[shot.cueIndex] === true;
        return (
          <article key={shot.cueIndex} className="cf-beat">
            <h3>{shot.sceneLabel} ({shot.kind}, {shot.durationSecs}s){take > 0 ? ` · take ${take}` : ""}</h3>
            <p>Prompt: {shot.imagePrompt}</p>
            <p>Camera: {shot.cameraDirection}</p>
            <p>Motion: {shot.motionVariant}</p>
            <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginTop: 9 }}>
              <button type="button" className="cf-button cf-button-secondary" disabled={disabled} onClick={() => onRegenerate(shot.cueIndex)}>REGENERATE</button>
              <label className="cf-proof-approval"><input type="checkbox" disabled={disabled} checked={approved} onChange={() => onToggleApprove(shot.cueIndex)} /><span><b>Approved</b><small>Shot {shot.cueIndex + 1} is locked for export.</small></span></label>
            </div>
          </article>
        );
      })}
      <p>Estimated cost: {cost.units} units ({cost.breakdown.shots} shots, {cost.breakdown.voiceSecs}s voice, {cost.renderSecs}s render)</p>
    </section>
  );
}
