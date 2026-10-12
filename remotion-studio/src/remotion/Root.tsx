import { Composition } from "remotion";
import React from "react";
import type { ComponentType } from "react";
import type { z } from "zod";
import type { CompositionProps } from "../lib/scene-plan";
import { Explainer } from "./compositions/Explainer";
import { ProductDemo } from "./compositions/ProductDemo";
import { ProofStory } from "./compositions/ProofStory";
import { WithSoundtrack } from "./shared/WithSoundtrack";
import { DeckComposition, DECK_THEME } from "./deck/DeckComposition";
import { clipflowLaunchDeck } from "./deck/clipflow-launch";
import { totalFrames } from "./deck/deck";
import { defaultCompositionProps } from "./default-props";

const shared = { width: 1080, height: 1920, fps: 30, defaultProps: defaultCompositionProps };
const compositionComponent = (Component: ComponentType<CompositionProps>) =>
  (props: CompositionProps) => <WithSoundtrack Component={Component} {...props} />;

export function Root() {
  return <>
    <Composition<z.ZodObject<any>, CompositionProps> id="ClipExplainer" component={compositionComponent(Explainer)} {...shared} durationInFrames={defaultCompositionProps.totalFrames} calculateMetadata={({ props }) => ({ durationInFrames: props.totalFrames })} />
    <Composition<z.ZodObject<any>, CompositionProps> id="ClipProductDemo" component={compositionComponent(ProductDemo)} {...shared} durationInFrames={defaultCompositionProps.totalFrames} calculateMetadata={({ props }) => ({ durationInFrames: props.totalFrames })} />
    <Composition<z.ZodObject<any>, CompositionProps> id="ClipProofStory" component={compositionComponent(ProofStory)} {...shared} durationInFrames={defaultCompositionProps.totalFrames} calculateMetadata={({ props }) => ({ durationInFrames: props.totalFrames })} />
    <Composition id="ClipDeck" component={DeckComposition} width={1920} height={1080} fps={30} defaultProps={{ deck: clipflowLaunchDeck(), theme: DECK_THEME }} durationInFrames={totalFrames(clipflowLaunchDeck())} calculateMetadata={({ props }) => ({ durationInFrames: totalFrames((props as { deck: Parameters<typeof totalFrames>[0] }).deck) })} />
  </>;
}
