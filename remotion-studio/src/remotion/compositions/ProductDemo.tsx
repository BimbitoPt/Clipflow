import React from "react";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { AnimatedScene } from "../shared/SceneFrame";
import type { CompositionProps } from "../../lib/scene-plan";

export function ProductDemo(props: CompositionProps) {
  return <TransitionSeries>
    {props.scenes.flatMap((scene, index) => [
      ...(index > 0 ? [<TransitionSeries.Transition key={`transition-${scene.index}`} timing={linearTiming({ durationInFrames: props.transitionFrames })} presentation={slide({ direction: "from-right" })} />] : []),
      <TransitionSeries.Sequence key={`scene-${scene.index}`} durationInFrames={scene.durationInFrames}><AnimatedScene props={props} scene={scene} variant="demo" /></TransitionSeries.Sequence>,
    ])}
  </TransitionSeries>;
}
