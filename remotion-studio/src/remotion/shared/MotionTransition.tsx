import React from "react";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import type { ClipBrief, ClipFormat } from "../../lib/domain";

export function motionTransition(clip: ClipBrief, format: ClipFormat, durationInFrames: number, key: string): React.ReactElement {
  const timing = linearTiming({ durationInFrames });
  if (clip.motionStyle === "cinematic") return <TransitionSeries.Transition key={key} timing={timing} presentation={fade({ shouldFadeOutExitingScene: true })} />;
  if (clip.motionStyle === "float") return <TransitionSeries.Transition key={key} timing={timing} presentation={slide({ direction: "from-bottom" })} />;
  if (clip.motionStyle === "snap") return <TransitionSeries.Transition key={key} timing={timing} presentation={wipe({ direction: format === "explainer" ? "from-bottom-right" : "from-left" })} />;
  if (format === "demo") return <TransitionSeries.Transition key={key} timing={timing} presentation={slide({ direction: "from-right" })} />;
  if (format === "proof") return <TransitionSeries.Transition key={key} timing={timing} presentation={wipe({ direction: "from-bottom-right" })} />;
  return <TransitionSeries.Transition key={key} timing={timing} presentation={fade({ shouldFadeOutExitingScene: true })} />;
}
