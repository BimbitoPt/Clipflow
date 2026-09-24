"use client";

import { Player } from "@remotion/player";
import { useMemo } from "react";
import type { BrandKit, ClipBrief } from "@/src/lib/domain";
import { buildCompositionProps } from "@/src/lib/scene-plan";
import { Explainer } from "@/src/remotion/compositions/Explainer";
import { ProductDemo } from "@/src/remotion/compositions/ProductDemo";
import { ProofStory } from "@/src/remotion/compositions/ProofStory";

const components = { explainer: Explainer, demo: ProductDemo, proof: ProofStory } as const;

export default function ClipPlayer({ clip, brand }: { clip: ClipBrief; brand: BrandKit }) {
  const props = useMemo(() => buildCompositionProps(clip, brand), [clip, brand]);
  const Component = components[clip.format];
  return <div className="player-shell"><Player component={Component} inputProps={props} durationInFrames={props.totalFrames} compositionWidth={1080} compositionHeight={1920} fps={30} controls loop style={{ width: "100%", height: "100%" }} errorFallback={({ error }) => <div className="player-error" role="alert"><b>PREVIEW ERROR</b><code>{error.message}</code></div>} /></div>;
}
