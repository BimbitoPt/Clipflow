import React from "react";
import { Audio, Sequence, staticFile } from "remotion";
import type { ComponentType } from "react";
import type { CompositionProps } from "../../lib/scene-plan";
import { SFX, musicVolumeAt } from "../../../../shared/audio-mix";

export function WithSoundtrack({ Component, ...props }: CompositionProps & { Component: ComponentType<CompositionProps> }) {
  const musicPath = props.clip.creative?.musicPath ?? props.brand.audioPath;
  const standard = ["cinematic-story", "proof-series", "proof-hero"].includes(props.clip.creative?.template ?? "");
  return <>
    {!props.coverMode && musicPath && <Audio src={staticFile(musicPath)} volume={(frame) => musicVolumeAt(frame / 30, props.clip.voiceover.wordTimings, Boolean(props.clip.creative))} loop />}
    {!props.coverMode && props.clip.creative?.sfxPath && <Audio src={staticFile(props.clip.creative.sfxPath)} volume={SFX.featured} />}
    {!props.coverMode && standard && props.scenes.slice(1).map((scene) => <Sequence key={`whoosh-${scene.index}`} from={Math.max(0, scene.startFrame - 5)} durationInFrames={18}><Audio src={staticFile("scene-audio/transition-whoosh.wav")} volume={SFX.sceneWhoosh} /></Sequence>)}
    {!props.coverMode && standard && props.scenes.flatMap((scene) => scene.visual?.items.map((_, index) => <Sequence key={`pop-${scene.index}-${index}`} from={scene.startFrame + 8 + index * 12} durationInFrames={9}><Audio src={staticFile("scene-audio/step-pop.wav")} volume={SFX.stepPop} /></Sequence>) ?? [])}
    {!props.coverMode && props.clip.voiceover.audioPath && <Audio src={staticFile(props.clip.voiceover.audioPath)} volume={SFX.voiceGain} />}
    <Component {...props} />
  </>;
}
