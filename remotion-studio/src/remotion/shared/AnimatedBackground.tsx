import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { CompositionProps, SceneSegment } from "../../lib/scene-plan";

type SceneVariant = "explainer" | "demo" | "proof";

export function AnimatedBackground({ props, scene, variant }: { props: CompositionProps; scene: SceneSegment; variant: SceneVariant }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { background, accent, accentAlt } = props.brand.palette;
  const primary = variant === "proof" ? accentAlt : accent;
  const secondary = variant === "proof" ? accent : accentAlt;
  const seconds = (frame + scene.startFrame) / fps;
  const pace = props.clip.motionStyle === "snap" ? 1.7 : props.clip.motionStyle === "cinematic" ? 0.55 : props.clip.motionStyle === "float" ? 0.8 : 1.2;
  const driftX = Math.sin(seconds * 0.53 * pace + scene.index) * 95;
  const driftY = Math.cos(seconds * 0.39 * pace + scene.index * 0.7) * 80;
  const orbit = seconds * (props.clip.motionStyle === "snap" ? 24 : props.clip.motionStyle === "cinematic" ? 6 : props.clip.motionStyle === "float" ? 10 : 14);
  const sweep = interpolate(frame, [0, Math.min(scene.durationInFrames, fps * 2.5)], [-460, 1300], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const gridShift = (seconds * 42 * pace) % 96;

  return <AbsoluteFill aria-hidden="true" style={{ overflow: "hidden", pointerEvents: "none" }}>
    <AbsoluteFill style={{
      background: `radial-gradient(ellipse 62% 48% at 78% 48%, ${primary}58 0%, ${primary}24 38%, transparent 78%), radial-gradient(ellipse 48% 32% at 30% 84%, ${secondary}32 0%, transparent 75%)`,
      transform: `translate(${driftX}px, ${driftY}px) scale(1.18)`,
    }} />
    <div style={{
      position: "absolute", width: 1320, height: 990, left: 100, top: 635,
      backgroundImage: `linear-gradient(${primary}38 1px, transparent 1px), linear-gradient(90deg, ${primary}38 1px, transparent 1px)`,
      backgroundSize: "96px 96px", backgroundPosition: `0 ${gridShift}px`,
      maskImage: "linear-gradient(to bottom, transparent, black 30%, black 75%, transparent)",
      transform: `perspective(850px) rotateX(63deg) rotateZ(-16deg) translateX(${Math.sin(seconds * 0.3) * 35}px)`,
    }} />
    {[0, 1, 2].map((ring) => <div key={ring} style={{
      position: "absolute", width: 540 + ring * 170, height: 540 + ring * 170,
      left: 670 - ring * 85, top: 590 - ring * 85,
      border: `2px solid ${primary}${ring === 0 ? "72" : ring === 1 ? "48" : "2a"}`,
      borderRadius: "50%", opacity: 0.75,
      transform: `translate(${driftX * (0.12 + ring * 0.08)}px, ${driftY * 0.1}px) rotate(${orbit + ring * 36}deg) scale(${1 + Math.sin(seconds * pace + ring) * 0.025})`,
    }}><div style={{ position: "absolute", width: ring === 0 ? 12 : 8, height: ring === 0 ? 12 : 8, borderRadius: "50%", background: secondary, top: "50%", left: -6, boxShadow: `0 0 30px 8px ${secondary}65` }} /></div>)}
    <div style={{
      position: "absolute", top: -250, left: sweep, width: 310, height: 1800,
      background: `linear-gradient(90deg, transparent, ${primary}08 34%, ${primary}28 50%, ${primary}08 66%, transparent)`,
      transform: "rotate(-18deg)",
    }} />
    <AbsoluteFill style={{ background: `linear-gradient(90deg, ${background}ed 0%, ${background}c9 40%, ${background}22 78%, transparent 100%), linear-gradient(0deg, ${background}af 0%, transparent 24%)` }} />
  </AbsoluteFill>;
}
