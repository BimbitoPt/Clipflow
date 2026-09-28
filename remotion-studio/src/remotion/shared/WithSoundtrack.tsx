import React from "react";
import { Audio, staticFile } from "remotion";
import type { ComponentType } from "react";
import type { CompositionProps } from "../../lib/scene-plan";

export function WithSoundtrack({ Component, ...props }: CompositionProps & { Component: ComponentType<CompositionProps> }) {
  const musicPath = props.clip.creative?.musicPath ?? props.brand.audioPath;
  return <>
    {!props.coverMode && musicPath && <Audio src={staticFile(musicPath)} volume={(frame) => props.clip.voiceover.wordTimings.some(({ start, end }) => frame / 30 >= start - 0.15 && frame / 30 < end + 0.15) ? (props.clip.creative ? 0.12 : 0.055) : (props.clip.creative ? 0.26 : 0.18)} loop />}
    {!props.coverMode && props.clip.creative?.sfxPath && <Audio src={staticFile(props.clip.creative.sfxPath)} volume={0.42} />}
    {!props.coverMode && props.clip.voiceover.audioPath && <Audio src={staticFile(props.clip.voiceover.audioPath)} volume={1} />}
    <Component {...props} />
  </>;
}
