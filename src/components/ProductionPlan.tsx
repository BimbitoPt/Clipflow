import type { PlanCost, ProductionPlan } from "../lib/production-plan";

// Named ProductionPlanView to avoid clashing with the ProductionPlan type.
// Read-only in Phase 1: shot cards + cost summary, no buttons (Task 5).
// NOTE: docs/design-system.md §9 defines no `cf-panel`/`cf-card` classes —
// section reuses `cf-script-panel` (plain panel, no grid/sticky side effects)
// and each shot reuses the `cf-beat` deep card. No new global CSS.
export function ProductionPlanView({ plan, cost }: { plan: ProductionPlan; cost: PlanCost }) {
  return (
    <section className="cf-script-panel" aria-label="Production plan">
      <div className="cf-panel-heading"><h2>Production plan</h2><p>Style: {plan.style.packLabel} · Voice: {plan.style.voice} · {plan.totalSecs}s</p></div>
      {plan.shots.map((shot) => (
        <article key={shot.cueIndex} className="cf-beat">
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
