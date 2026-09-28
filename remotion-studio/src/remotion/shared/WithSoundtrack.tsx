import React from "react";
import { Audio, Sequence, staticFile } from "remotion";
import type { ComponentType } from "react";
import type { CompositionProps } from "../../lib/scene-plan";

export function WithSoundtrack({ Component, ...props }: CompositionProps & { Component: ComponentType<CompositionProps> }) {
  const musicPath = props.clip.creative?.musicPath ?? props.brand.audioPath;
  const standard = props.clip.creative?.template === "cinematic-story";
  return <>
    {!props.coverMode && musicPath && <Audio src={staticFile(musicPath)} volume={(frame) => props.clip.voiceover.wordTimings.some(({ start, end }) => frame / 30 >= start - 0.15 && frame / 30 < end + 0.15) ? (props.clip.creative ? 0.12 : 0.055) : (props.clip.creative ? 0.26 : 0.18)} loop />}
    {!props.coverMode && props.clip.creative?.sfxPath && <Audio src={staticFile(props.clip.creative.sfxPath)} volume={0.42} />}
    {!props.coverMode && standard && props.scenes.slice(1).map((scene) => <Sequence key={`whoosh-${scene.index}`} from={Math.max(0, scene.startFrame - 5)} durationInFrames={18}><Audio src={staticFile("scene-audio/transition-whoosh.wav")} volume={0.32} /></Sequence>)}
    {!props.coverMode && standard && props.scenes.flatMap((scene) => scene.visual?.items.map((_, index) => <Sequence key={`pop-${scene.index}-${index}`} from={scene.startFrame + 8 + index * 12} durationInFrames={9}><Audio src={staticFile("scene-audio/step-pop.wav")} volume={0.3} /></Sequence>) ?? [])}
    {!props.coverMode && props.clip.voiceover.audioPath && <Audio src={staticFile(props.clip.voiceover.audioPath)} volume={1} />}
    <Component {...props} />
  </>;
}
