import React from "react";
import { Audio, staticFile } from "remotion";
import type { ComponentType } from "react";
import type { CompositionProps } from "../../lib/scene-plan";

export function WithSoundtrack({ Component, ...props }: CompositionProps & { Component: ComponentType<CompositionProps> }) {
  return <>
    {props.brand.audioPath && <Audio src={staticFile(props.brand.audioPath)} volume={0.18} loop />}
    <Component {...props} />
  </>;
}
