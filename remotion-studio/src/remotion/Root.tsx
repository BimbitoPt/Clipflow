import { Composition } from "remotion";
import React from "react";
import type { ComponentType } from "react";
import type { z } from "zod";
import type { CompositionProps } from "../lib/scene-plan";
import { Explainer } from "./compositions/Explainer";
import { ProductDemo } from "./compositions/ProductDemo";
import { ProofStory } from "./compositions/ProofStory";
import { WithSoundtrack } from "./shared/WithSoundtrack";
import { defaultCompositionProps } from "./default-props";

const shared = { width: 1080, height: 1920, fps: 30, defaultProps: defaultCompositionProps };
const compositionComponent = (Component: ComponentType<CompositionProps>) =>
  (props: CompositionProps) => <WithSoundtrack Component={Component} {...props} />;

export function Root() {
  return <>
    <Composition<z.ZodObject<any>, CompositionProps> id="ClipExplainer" component={compositionComponent(Explainer)} {...shared} durationInFrames={defaultCompositionProps.totalFrames} calculateMetadata={({ props }) => ({ durationInFrames: props.totalFrames })} />
    <Composition<z.ZodObject<any>, CompositionProps> id="ClipProductDemo" component={compositionComponent(ProductDemo)} {...shared} durationInFrames={defaultCompositionProps.totalFrames} calculateMetadata={({ props }) => ({ durationInFrames: props.totalFrames })} />
    <Composition<z.ZodObject<any>, CompositionProps> id="ClipProofStory" component={compositionComponent(ProofStory)} {...shared} durationInFrames={defaultCompositionProps.totalFrames} calculateMetadata={({ props }) => ({ durationInFrames: props.totalFrames })} />
  </>;
}
