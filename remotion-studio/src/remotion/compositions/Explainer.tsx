import React from "react";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AnimatedScene } from "../shared/SceneFrame";
import type { CompositionProps } from "../../lib/scene-plan";

export function Explainer({ ...props }: CompositionProps) {
  return <TransitionSeries>
    {props.scenes.flatMap((scene, index) => [
      ...(index > 0 ? [<TransitionSeries.Transition key={`transition-${scene.index}`} timing={linearTiming({ durationInFrames: props.transitionFrames })} presentation={fade({ shouldFadeOutExitingScene: true })} />] : []),
      <TransitionSeries.Sequence key={`scene-${scene.index}`} durationInFrames={scene.durationInFrames}><AnimatedScene props={props} scene={scene} variant="explainer" /></TransitionSeries.Sequence>,
    ])}
  </TransitionSeries>;
}
