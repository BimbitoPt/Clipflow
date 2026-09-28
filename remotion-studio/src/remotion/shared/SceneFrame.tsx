import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { CompositionProps, SceneSegment } from "../../lib/scene-plan";
import { AnimatedBackground } from "./AnimatedBackground";

export function wordChunks(text: string, size: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += size) chunks.push(words.slice(index, index + size).join(" "));
  return chunks.length ? chunks : [""];
}

export function AnimatedScene({ props, scene, variant }: { props: CompositionProps; scene: SceneSegment; variant: "explainer" | "demo" | "proof" }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { clip, brand } = props;
  const entrance = spring({ frame: frame - 3, fps, config: { damping: 18, stiffness: 105, mass: 0.72 } });
  const opacity = interpolate(frame, [0, Math.min(10, scene.durationInFrames / 3), scene.durationInFrames - 3, scene.durationInFrames], [0, 1, 1, 0.92], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const chunks = wordChunks(scene.copy, brand.captionStyle.wordsPerChunk);
  const chunkIndex = Math.min(chunks.length - 1, Math.floor((frame / Math.max(1, scene.durationInFrames)) * chunks.length));
  const imagePath = variant === "demo" ? clip.mediaOverrides.find((item) => /\.(png|jpe?g|webp|gif)$/i.test(item)) : undefined;
  const customFont = brand.approvedAssets.find((asset) => asset.path.endsWith(".woff2"));
  const family = brand.fonts.heading.replace(/[^\w -]/g, "").trim() || "Inter";
  const label = variant === "explainer" ? "THE IDEA" : variant === "demo" ? "IN THE PRODUCT" : "THE PROOF";
  const accent = variant === "proof" ? brand.palette.accentAlt : brand.palette.accent;
  const headingSize = variant === "proof" ? 68 : variant === "demo" ? 72 : 82;
  const motion = clip.motionStyle;
  const elapsedSeconds = (frame + scene.startFrame) / fps;
  const activeWord = clip.voiceover.wordTimings.findIndex((word) => elapsedSeconds >= word.start && elapsedSeconds < word.end);
  const captionStart = activeWord < 0 ? -1 : Math.max(0, Math.floor(activeWord / 4) * 4);
  const captionWords = activeWord < 0 ? [] : clip.voiceover.wordTimings.slice(captionStart, captionStart + 4);
  const bob = motion === "float" ? Math.sin(frame / 18) * 13 : 0;
  const tilt = motion === "cinematic" ? interpolate(frame, [0, scene.durationInFrames], [-1.8, 1.8], { extrapolateRight: "clamp" }) : motion === "snap" ? (1 - entrance) * -2.5 : 0;
  const titleOffset = motion === "snap" ? 86 : motion === "cinematic" ? 26 : 48;

  return <AbsoluteFill style={{ backgroundColor: brand.palette.background, color: brand.palette.foreground, fontFamily: `"${family}", Arial, system-ui, sans-serif`, overflow: "hidden", opacity }}>
    {customFont && <style>{`@font-face{font-family:'${family}';src:url('${staticFile(customFont.path)}') format('woff2');font-display:swap}`}</style>}
    <AnimatedBackground props={props} scene={scene} variant={variant} />
    <div style={{ position: "absolute", top: 105, left: 88, right: 88, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      {brand.logoPath ? <Img src={staticFile(brand.logoPath)} style={{ width: 84, height: 56, objectFit: "contain", objectPosition: "left center" }} /> : <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: ".05em" }}>{brand.name.toUpperCase()}</div>}
      <div style={{ color: accent, fontSize: 17, letterSpacing: ".16em", fontWeight: 700 }}>{String(scene.index + 1).padStart(2, "0")} <span style={{ color: "#8793a3" }}>/ {String(props.scenes.length).padStart(2, "0")}</span></div>
    </div>
    <div style={{ position: "absolute", top: 260, left: 88, right: 88, height: 4, background: "#ffffff19" }}><div style={{ height: "100%", width: `${Math.max(8, ((scene.index + 1) / props.scenes.length) * 100)}%`, background: accent }} /></div>
    <div style={{ position: "absolute", top: variant === "proof" ? 390 : 410, left: 88, right: 88, opacity: entrance, transform: `translateY(${(1 - entrance) * titleOffset + bob}px) rotate(${tilt}deg) scale(${variant === "explainer" ? 0.97 + entrance * 0.03 : 1})` }}>
      <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: ".19em", color: accent, marginBottom: 24 }}>{label}</div>
      <div style={{ fontSize: headingSize, lineHeight: .99, letterSpacing: "-.065em", fontWeight: 800, overflowWrap: "anywhere", textWrap: "balance" as React.CSSProperties["textWrap"] }}>{scene.copy}</div>
      {variant === "demo" && <div style={{ marginTop: 38, padding: 14, border: `1px solid ${accent}66`, borderRadius: 14, background: "#10151ddd", boxShadow: `0 24px 90px ${accent}20`, transform: `translateX(${(1 - entrance) * 55}px) rotate(-1deg)` }}>
        {imagePath ? <Img src={staticFile(imagePath)} style={{ width: "100%", maxHeight: 520, objectFit: "cover", borderRadius: 8 }} /> : <ProductMock accent={accent} />}
      </div>}
      {variant === "proof" && scene.index === props.scenes.length - 2 && <div style={{ marginTop: 28, padding: "18px 22px", borderLeft: `5px solid ${accent}`, background: "#ffffff0b", fontSize: 27, fontWeight: 600, lineHeight: 1.25 }}>{clip.proof}</div>}
    </div>
    {!props.coverMode && <div style={{ position: "absolute", left: 88, right: 88, bottom: 300 }}>
      <div style={{ color: "#9aa6b3", textTransform: "uppercase", letterSpacing: ".22em", fontSize: 15, marginBottom: 16 }}>{variant === "proof" ? "WHAT CHANGED" : variant === "demo" ? "WATCH THIS" : "THE TAKEAWAY"}</div>
      {clip.voiceover.audioPath && activeWord >= 0 ? <div aria-label="Timed voiceover captions" style={{ display: "inline-block", padding: "13px 19px", maxWidth: 940, color: brand.palette.foreground, background: `${brand.palette.background}ee`, borderBottom: `4px solid ${brand.captionStyle.highlightColor}`, fontSize: 34, lineHeight: 1.15, fontWeight: 800, letterSpacing: "-.035em", textTransform: "uppercase" }}>{captionWords.map((item, index) => <span key={`${item.start}-${index}`} style={{ color: captionStart + index === activeWord ? brand.captionStyle.highlightColor : brand.palette.foreground, transform: captionStart + index === activeWord ? "translateY(-3px) scale(1.06)" : "none", display: "inline-block", marginRight: 9 }}>{item.word}</span>)}</div> : <div style={{ display: "inline-block", padding: "13px 19px", maxWidth: 940, color: brand.palette.foreground, background: `${brand.palette.background}ee`, borderBottom: `4px solid ${brand.captionStyle.highlightColor}`, fontSize: 34, lineHeight: 1.15, fontWeight: 800, letterSpacing: "-.035em", textTransform: "uppercase" }}>{chunks[chunkIndex]}</div>}
    </div>}
    <div style={{ position: "absolute", bottom: 118, left: 88, right: 88, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ width: 18, height: 18, border: `2px solid ${accent}`, transform: "rotate(45deg)" }} />
      <div style={{ maxWidth: 660, textAlign: "right", fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}>{clip.cta}</div>
    </div>
    <div style={{ position: "absolute", left: 88, right: 88, bottom: 70, height: 2, background: "#ffffff33" }} />
  </AbsoluteFill>;
}

function ProductMock({ accent }: { accent: string }) {
  return <div style={{ height: 365, padding: 24, borderRadius: 9, background: "linear-gradient(140deg,#1b2430,#0b0e12)", display: "grid", gridTemplateColumns: "1fr .62fr", gap: 15 }}>
    <div style={{ borderRadius: 6, background: "#222d3a", padding: 18, display: "flex", flexDirection: "column", justifyContent: "space-between" }}><div style={{ display: "flex", gap: 6 }}><i style={{ width: 7, height: 7, borderRadius: "50%", background: "#ed786e" }} /><i style={{ width: 7, height: 7, borderRadius: "50%", background: "#e7c965" }} /><i style={{ width: 7, height: 7, borderRadius: "50%", background: accent }} /></div><div><div style={{ width: "65%", height: 13, background: "#ffffffc4", marginBottom: 10 }} /><div style={{ width: "90%", height: 6, background: "#8994a1" }} /></div><div style={{ width: 92, padding: 9, background: accent, color: "#080a0d", fontSize: 9, fontWeight: 800 }}>LIVE PREVIEW</div></div>
    <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 12 }}><div style={{ borderRadius: 6, background: `${accent}36`, border: `1px solid ${accent}80` }} /><div style={{ borderRadius: 6, background: "#18202a", padding: 13, display: "flex", flexDirection: "column", justifyContent: "center", gap: 9 }}>{[75, 55, 86, 63].map((width) => <div key={width} style={{ width: `${width}%`, height: 5, background: "#7c8997" }} />)}</div></div>
  </div>;
}
