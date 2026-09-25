import React from "react";
import { TransitionSeries } from "@remotion/transitions";
import { AnimatedScene } from "../shared/SceneFrame";
import { motionTransition } from "../shared/MotionTransition";
import type { CompositionProps } from "../../lib/scene-plan";

export function Explainer({ ...props }: CompositionProps) {
  return <TransitionSeries>
    {props.scenes.flatMap((scene, index) => [
      ...(index > 0 ? [motionTransition(props.clip, "explainer", props.transitionFrames, `transition-${scene.index}`)] : []),
      <TransitionSeries.Sequence key={`scene-${scene.index}`} durationInFrames={scene.durationInFrames}><AnimatedScene props={props} scene={scene} variant="explainer" /></TransitionSeries.Sequence>,
    ])}
  </TransitionSeries>;
}
