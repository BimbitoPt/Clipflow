import React from "react";
import { loadFont as loadManrope } from "@remotion/google-fonts/Manrope";
import { loadFont as loadCormorant } from "@remotion/google-fonts/CormorantGaramond";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { CompositionProps, SceneSegment } from "../../lib/scene-plan";
import { MotionGraphic } from "./MotionGraphic";

const sans = loadManrope("normal", { weights: ["500", "700", "800"], subsets: ["latin"] }).fontFamily;
const serif = loadCormorant("italic", { weights: ["600"], subsets: ["latin"] }).fontFamily;

const clipflowTitles: { lead: string; accent: string; tail?: string }[] = [
  { lead: "IDEA.", accent: "NO SCRIPT." },
  { lead: "GIVE IT A", accent: "SPINE." },
  { lead: "FIVE PARTS.", accent: "ONE FLOW." },
  { lead: "IDEA", accent: "→ VIDEO" },
];
const mstudioTitles: { lead: string; accent: string; tail?: string }[] = [
  { lead: "NO MORE", accent: "PRICE GUESSING." },
  { lead: "PICK THE", accent: "BUILD." },
  { lead: "THREE BUILDS.", accent: "CLEAR PRICES." },
  { lead: "FULL SCOPE", accent: "LINK IN BIO." },
];

export function headlineFromCopy(copy: string) {
  const compact = copy.trim().replace(/\s+/g, " ");
  const firstSentence = compact.match(/^(.+?[.!?])\s+(.+)$/);
  if (firstSentence) return { lead: firstSentence[1].toUpperCase(), accent: firstSentence[2].split(/\s+/).slice(0, 5).join(" ").toUpperCase() };
  const words = compact.split(" ").slice(0, 8);
  const pivot = Math.max(1, Math.ceil(words.length / 2));
  return { lead: words.slice(0, pivot).join(" ").toUpperCase(), accent: words.slice(pivot).join(" ").toUpperCase() || "→" };
}

function motionLabels(copy: string) {
  const ignored = new Set(["about", "after", "again", "also", "and", "are", "because", "been", "before", "being", "but", "can", "could", "each", "for", "from", "get", "give", "has", "have", "how", "into", "its", "just", "make", "made", "more", "most", "not", "one", "our", "out", "over", "same", "that", "the", "their", "them", "then", "there", "these", "they", "this", "those", "through", "too", "turn", "turns", "use", "using", "very", "was", "were", "what", "when", "where", "which", "will", "with", "you", "your"]);
  const unique = new Set<string>();
  return (copy.toLowerCase().match(/[\p{L}]+/gu) ?? []).filter((word) => word.length > 2 && !ignored.has(word) && !unique.has(word) && Boolean(unique.add(word))).slice(0, 3);
}

function Title({ lead, accent, color, frame, fps, small = false }: { lead: string; accent: string; color: string; frame: number; fps: number; small?: boolean }) {
  const reveal = spring({ frame: frame - 5, fps, config: { damping: 18, stiffness: 100, mass: 0.75 } });
  return <div style={{ overflow: "hidden", maxWidth: 930, fontSize: small ? 72 : 90, lineHeight: 0.98, fontWeight: 800, letterSpacing: "-.075em", textShadow: "0 8px 40px #000b" }}>
    <div style={{ transform: `translateY(${(1 - reveal) * 120}px)`, opacity: reveal }}>{lead}</div>
    <div style={{ transform: `translateY(${(1 - reveal) * 150}px)`, opacity: reveal, color, fontFamily: serif, fontSize: small ? 86 : 108, fontWeight: 600, letterSpacing: "-.035em", lineHeight: 0.88 }}>{accent}</div>
  </div>;
}

function Captions({ props, accent, elapsed }: { props: CompositionProps; accent: string; elapsed: number }) {
  if (props.coverMode) return null;
  const cue = props.clip.creative?.captionCues.find((item) => elapsed >= item.start && elapsed < item.end);
  if (!cue) return null;
  const emphasis = new Set(cue.emphasis.map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}€]/gu, "")));
  return <div aria-label="Phrase-timed captions" style={{ position: "absolute", top: ["proof-series", "proof-hero"].includes(props.clip.creative?.template ?? "") ? 1210 : 1090, left: 90, right: 90, minHeight: 95, display: "flex", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
    <div style={{ background: "#05070bdc", boxShadow: "0 8px 40px #0008", padding: "15px 23px", borderRadius: 12, fontFamily: sans, fontSize: 47, fontWeight: 700, lineHeight: 1.12, letterSpacing: "-.04em", textTransform: "uppercase" }}>
      {cue.text.split(/\s+/).map((word, index) => <React.Fragment key={`${word}-${index}`}>{index > 0 && " "}<span style={{ color: emphasis.has(word.toLowerCase().replace(/[^\p{L}\p{N}€]/gu, "")) ? accent : "#fff" }}>{word}</span></React.Fragment>)}
    </div>
  </div>;
}

function Spine({ accent, frame, fps }: { accent: string; frame: number; fps: number }) {
  const nodes = ["HOOK", "BEAT 1", "BEAT 2", "BEAT 3", "CTA"];
  return <div style={{ position: "absolute", top: 485, left: 145, right: 145, display: "flex", flexDirection: "column", gap: 37 }}>
    <div style={{ position: "absolute", left: 28, top: 22, bottom: 22, width: 5, background: `linear-gradient(${accent},${accent}33)` }} />
    {nodes.map((node, index) => {
      const enter = spring({ frame: frame - 8 - index * 11, fps, config: { damping: 17, stiffness: 105 } });
      return <div key={node} style={{ display: "flex", alignItems: "center", gap: 30, opacity: enter, transform: `translateX(${(1 - enter) * 90}px)` }}>
        <div style={{ width: 62, height: 62, borderRadius: "50%", border: `4px solid ${accent}`, background: index <= Math.floor((frame - 4) / 11) ? accent : "#0b1014", boxShadow: `0 0 28px ${accent}66`, flex: "none" }} />
        <div style={{ fontFamily: sans, fontSize: 51, fontWeight: 800, letterSpacing: "-.055em", textShadow: "0 4px 25px #000d" }}>{node}</div>
      </div>;
    })}
  </div>;
}

function PriceCards({ accent, frame, fps }: { accent: string; frame: number; fps: number }) {
  const cards = [{ name: "SPEED SITE", value: 299 }, { name: "AI AUTOMATION BUILD", value: 449 }, { name: "BRAND + WEBSITE SYSTEM", value: 699 }];
  return <div style={{ position: "absolute", top: 490, left: 90, right: 90, display: "flex", flexDirection: "column", gap: 24 }}>
    {cards.map((card, index) => {
      const landing = spring({ frame: frame - 5 - index * 22, fps, config: { damping: 16, stiffness: 95 } });
      const amount = Math.round(interpolate(landing, [0, 1], [0, card.value], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
      return <div key={card.name} style={{ height: 170, padding: "20px 31px", borderRadius: 20, background: "#0a1323de", border: `2px solid ${accent}99`, boxShadow: `0 20px 70px #000a, inset 0 0 50px ${accent}18`, opacity: landing, transform: `translateX(${(1 - landing) * 140}px) scale(${0.92 + landing * 0.08})`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 15 }}>
        <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.04, letterSpacing: "-.055em", maxWidth: 440 }}>{card.name}</div>
        <div style={{ fontSize: 78, fontWeight: 800, letterSpacing: "-.09em", color: accent, fontVariantNumeric: "tabular-nums" }}>€{amount}</div>
      </div>;
    })}
  </div>;
}

function StoryVisual({ visual, accent, frame, fps, motionIntent }: { visual: NonNullable<SceneSegment["visual"]>; accent: string; frame: number; fps: number; motionIntent?: SceneSegment["motionIntent"] }) {
  const isSteps = visual.kind === "steps";
  if (!isSteps && motionIntent === "comparison" && visual.items.length >= 2) {
    const reveal = spring({ frame: frame - 8, fps, config: { damping: 18, stiffness: 100 } });
    const wipe = interpolate(frame, [8, 34], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return <div style={{ position: "absolute", top: 535, left: 90, right: 90, height: 260, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      {visual.items.slice(0, 2).map((item, index) => {
        const enter = spring({ frame: frame - 8 - index * 7, fps, config: { damping: 17, stiffness: 105 } });
        return <div key={`${item}-${index}`} style={{ position: "relative", overflow: "hidden", padding: "24px 27px", border: `2px solid ${accent}99`, borderRadius: 18, background: "#0a1323e8", boxShadow: `0 20px 70px #000a, inset 0 0 50px ${accent}18`, display: "flex", alignItems: "center", gap: 20, opacity: enter, transform: `translateX(${(1 - enter) * (index === 0 ? -100 : 100)}px)` }}>
          <div style={{ width: 9, height: 50, borderRadius: 5, background: accent, boxShadow: `0 0 18px ${accent}`, flex: "none" }} />
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.04, letterSpacing: "-.055em" }}>{item.toUpperCase()}</div>
          <div style={{ position: "absolute", left: 0, bottom: 0, width: `${wipe}%`, height: 4, background: accent, boxShadow: `0 0 18px ${accent}` }} />
        </div>;
      })}
      <div style={{ position: "absolute", left: "50%", top: 18, bottom: 18, width: 2, background: accent, opacity: reveal * .65, transform: `scaleY(${reveal})`, transformOrigin: "top" }} />
    </div>;
  }
  const lineHeight = visual.items.length * 72 + (visual.items.length - 1) * 25 - 50;
  const litHeight = interpolate(frame, [7, 7 + visual.items.length * 12], [0, lineHeight], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ position: "absolute", top: 490, left: isSteps ? 145 : 90, right: 90, display: "flex", flexDirection: "column", gap: isSteps ? 25 : 18 }}>
    {isSteps && <div style={{ position: "absolute", left: 28, top: 25, height: lineHeight, width: 5, background: "#ffffff40" }}><div style={{ height: litHeight, width: "100%", background: accent, boxShadow: `0 0 18px ${accent}` }} /></div>}
    {visual.items.map((item, index) => {
      const delay = motionIntent === "sequence" ? index * 12 : motionIntent === "transform" ? index * 16 : index * (isSteps ? 12 : 16);
      const direction = motionIntent === "comparison" && index % 2 === 1 ? 1 : -1;
      const enter = spring({ frame: frame - 7 - delay, fps, config: { damping: 17, stiffness: 105 } });
      return isSteps
        ? <div key={`${item}-${index}`} style={{ height: 72, display: "flex", alignItems: "center", gap: 27, opacity: enter, transform: `translateX(${(1 - enter) * 110}px)` }}>
          <div style={{ width: 62, height: 62, borderRadius: "50%", border: `4px solid ${accent}`, background: index <= Math.floor((frame - 5) / 12) ? accent : "#0b1014", boxShadow: `0 0 28px ${accent}66`, flex: "none" }} />
          <div style={{ fontSize: 51, fontWeight: 800, letterSpacing: "-.055em", textShadow: "0 4px 25px #000d" }}>{item.toUpperCase()}</div>
        </div>
        : <div key={`${item}-${index}`} style={{ position: "relative", overflow: "hidden", minHeight: 143, padding: "22px 32px", border: `2px solid ${accent}99`, borderRadius: 18, background: "#0a1323e8", boxShadow: `0 20px 70px #000a, inset 0 0 50px ${accent}18`, display: "flex", alignItems: "center", gap: 24, opacity: enter, transform: `translateX(${(1 - enter) * 140 * direction}px)` }}>
          <div style={{ width: 9, height: 50, borderRadius: 5, background: accent, boxShadow: `0 0 18px ${accent}`, flex: "none" }} />
          <div style={{ fontSize: 47, fontWeight: 800, lineHeight: 1.04, letterSpacing: "-.055em" }}>{item.toUpperCase()}</div>
          <div style={{ position: "absolute", left: 0, bottom: 0, width: `${Math.max(0, Math.min(100, (frame - 7 - index * 16) / 22 * 100))}%`, height: 4, background: accent, boxShadow: `0 0 18px ${accent}` }} />
        </div>;
    })}
  </div>;
}

function ProofScreen({ scene, accent, frame, fps, hero, brandId }: { scene: SceneSegment; accent: string; frame: number; fps: number; hero: boolean; brandId: string }) {
  if (!scene.screen) return null;
  const site = brandId === "mstudio";
  const image = scene.screen.imagePath;
  const wideScriptCrop = image.includes("clipflow-script-");
  const focus = image.includes("automation") || image.includes("speed") ? "center 58%" : image.includes("ownership-detail") ? "center 56%" : image.includes("ownership") ? "center 38%" : image.includes("contact-form") ? "center 68%" : site ? "center 22%" : "center 50%";
  const enter = spring({ frame: frame - 7, fps, config: { damping: 19, stiffness: hero ? 75 : 105 } });
  const push = interpolate(frame, [0, scene.durationInFrames], [1, hero ? 1.09 : 1.045], { extrapolateRight: "clamp" });
  const tilt = hero ? interpolate(frame, [0, scene.durationInFrames], [-3.2, 0.7], { extrapolateRight: "clamp" }) : (scene.index % 2 ? 1.1 : -1.1);
  return <div style={{ position: "absolute", top: hero ? 505 : 520, left: 86, right: 86, height: hero ? 620 : 565, opacity: enter, transform: `translateY(${(1 - enter) * 125}px) rotate(${tilt}deg)`, filter: `drop-shadow(0 28px 70px #000c)` }}>
    <div style={{ position: "absolute", inset: -18, border: `2px solid ${accent}90`, borderRadius: 31, boxShadow: `0 0 ${hero ? 85 : 40}px ${accent}44` }} />
    <div style={{ height: "100%", overflow: "hidden", borderRadius: 20, background: "#080a0d", border: "2px solid #ffffff66", position: "relative" }}>
      <Img src={staticFile(scene.screen.imagePath)} style={{ width: "100%", height: "100%", objectFit: wideScriptCrop ? "contain" : "cover", objectPosition: focus, transform: `scale(${push})` }} />
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", boxShadow: "inset 0 0 60px #0008" }} />
    </div>
    <div style={{ position: "absolute", left: 28, top: -32, background: accent, color: "#05070b", borderRadius: 7, padding: "8px 17px", fontFamily: sans, fontSize: 29, fontWeight: 800, letterSpacing: ".01em" }}>{scene.evidenceApproved ? "APPROVED EVIDENCE" : brandId === "clipflow" ? "CLIPFLOW PRODUCT SCREEN" : "MSTUDIO SITE CAPTURE"}</div>
  </div>;
}

export function StoryScene({ props, scene }: { props: CompositionProps; scene: SceneSegment }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { clip, brand } = props;
  const accent = brand.palette.accent;
  const isPricing = clip.creative?.template === "mstudio-pricing";
  const isStoryboard = ["cinematic-story", "proof-series", "proof-hero"].includes(clip.creative?.template ?? "");
  const isProofHero = clip.creative?.template === "proof-hero";
  const title = isStoryboard ? headlineFromCopy(scene.copy) : (isPricing ? mstudioTitles : clipflowTitles)[scene.index];
  const end = scene.durationInFrames;
  const scale = interpolate(frame, [0, end], [1.06, 1.15], { extrapolateRight: "clamp" });
  const x = interpolate(frame, [0, end], [-18, 18], { extrapolateRight: "clamp" });
  const y = interpolate(frame, [0, end], [8, -14], { extrapolateRight: "clamp" });
  const elapsed = (scene.startFrame + frame) / fps;
  const isDiagram = !scene.motionIntent && !isStoryboard && !isPricing && scene.index === 2;
  const isPrices = isPricing && scene.index === 2;
  const hasDiagram = scene.motionIntent && !["kinetic-type", "focus", "none"].includes(scene.motionIntent);
  const titleTop = hasDiagram ? 270 : scene.screen ? 280 : isDiagram || isPrices || scene.visual ? 280 : scene.index === 3 ? (scene.motionGraphic ? 580 : 645) : 440;
  const entrance = spring({ frame, fps, config: { damping: 20, stiffness: 85 } });
  return <AbsoluteFill style={{ background: brand.palette.background, color: "#fff", fontFamily: sans, overflow: "hidden" }}>
    {scene.bg && <Img src={staticFile(scene.bg.imagePath)} style={{ position: "absolute", inset: -80, width: "calc(100% + 160px)", height: "calc(100% + 160px)", objectFit: "cover", transform: `translate(${x}px, ${y}px) scale(${scale})` }} />}
    {!scene.bg && <AbsoluteFill style={{ background: `radial-gradient(circle at ${65 + x / 2}% ${35 + y / 2}%, ${accent}55 0%, transparent 40%),linear-gradient(145deg,${brand.palette.background},#05070b)` }} />}
    <AbsoluteFill style={{ background: "linear-gradient(180deg,#05070bc9 0%,#05070b72 31%,#05070b98 65%,#05070be8 100%)" }} />
    <AbsoluteFill style={{ opacity: 0.09, backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 180 180%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%22.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22 opacity=%22.5%22/%3E%3C/svg%3E')" }} />
    {brand.logoPath && <Img src={staticFile(brand.logoPath)} style={{ position: "absolute", top: 76, left: 90, width: 78, height: 78, objectFit: "contain", opacity: entrance }} />}
    <div style={{ position: "absolute", top: 180, left: 90, fontSize: 40, fontWeight: 800, letterSpacing: "-.05em", opacity: entrance }}>{brand.name.toUpperCase()}<span style={{ color: accent }}>.</span></div>
    <div style={{ position: "absolute", top: titleTop, left: 90, right: 90 }}><Title {...title} color={accent} frame={frame} fps={fps} small={Boolean(hasDiagram || isDiagram || isPrices || scene.visual || scene.screen)} /></div>
    {scene.screen && <ProofScreen scene={scene} accent={accent} frame={frame} fps={fps} hero={isProofHero} brandId={brand.id} />}
    {isDiagram && <Spine accent={accent} frame={frame} fps={fps} />}
    {isPrices && <PriceCards accent={accent} frame={frame} fps={fps} />}
    {scene.visual && <StoryVisual visual={scene.visual} accent={accent} frame={frame} fps={fps} motionIntent={scene.motionIntent} />}
    {!scene.visual && scene.motionIntent && <MotionGraphic intent={scene.motionIntent} accent={accent} frame={frame} fps={fps} sceneIndex={scene.index} sceneDurationInFrames={scene.durationInFrames} hasScreen={Boolean(scene.screen)} labels={scene.motionLabels ?? motionLabels(scene.copy)} />}
    {!scene.visual && !scene.motionIntent && scene.motionGraphic && <MotionGraphic kind={scene.motionGraphic} accent={accent} frame={frame} fps={fps} sceneIndex={scene.index} />}
    <Captions props={props} accent={accent} elapsed={elapsed} />
    <div style={{ position: "absolute", bottom: 435, left: 90, right: 90, height: 3, background: "#ffffff40" }}><div style={{ height: "100%", width: `${Math.max(0, Math.min(100, frame / end * 100))}%`, background: accent }} /></div>
  </AbsoluteFill>;
}
