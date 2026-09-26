import React from "react";
import { Audio, staticFile } from "remotion";
import type { ComponentType } from "react";
import type { CompositionProps } from "../../lib/scene-plan";

export function WithSoundtrack({ Component, ...props }: CompositionProps & { Component: ComponentType<CompositionProps> }) {
  return <>
    {!props.coverMode && props.brand.audioPath && <Audio src={staticFile(props.brand.audioPath)} volume={(frame) => props.clip.voiceover.wordTimings.some(({ start, end }) => frame / 30 >= start && frame / 30 < end) ? 0.055 : 0.18} loop />}
    {!props.coverMode && props.clip.voiceover.audioPath && <Audio src={staticFile(props.clip.voiceover.audioPath)} volume={1} />}
    <Component {...props} />
  </>;
}
