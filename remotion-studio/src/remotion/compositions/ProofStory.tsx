import React from "react";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { wipe } from "@remotion/transitions/wipe";
import { AnimatedScene } from "../shared/SceneFrame";
import type { CompositionProps } from "../../lib/scene-plan";

export function ProofStory(props: CompositionProps) {
  return <TransitionSeries>
    {props.scenes.flatMap((scene, index) => [
      ...(index > 0 ? [<TransitionSeries.Transition key={`transition-${scene.index}`} timing={linearTiming({ durationInFrames: props.transitionFrames })} presentation={wipe({ direction: "from-bottom-right" })} />] : []),
      <TransitionSeries.Sequence key={`scene-${scene.index}`} durationInFrames={scene.durationInFrames}><AnimatedScene props={props} scene={scene} variant="proof" /></TransitionSeries.Sequence>,
    ])}
  </TransitionSeries>;
}
