import React from "react";
import { AbsoluteFill, Video, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { SPRINGS, STAGGER } from "../../../../shared/motion-tokens";
import { locateBuild, locateFrame, slideStartFrame, totalBuilds, type Deck } from "./deck";

export interface DeckTheme {
  bg: string;
  ink: string;
  accent: string;
  muted: string;
}

export const DECK_THEME: DeckTheme = {
  bg: "#080A0D",
  ink: "#F7F8FA",
  accent: "#CFFF47",
  muted: "#A8B6A5",
};

/** One build state layer: title + revealed points, token-driven entrances. */
function BuildLayer({
  deck,
  g,
  frame,
  theme,
  opacity,
  yOff,
}: {
  deck: Deck;
  g: number;
  frame: number;
  theme: DeckTheme;
  opacity: number;
  yOff: number;
}) {
  const { fps } = useVideoConfig();
  const { slide: s, build } = locateBuild(deck, g);
  const slide = deck.slides[s];
  const titleIn = spring({ frame: frame - slideStartFrame(deck, s) - 3, fps, config: SPRINGS.standard });
  const titleY = interpolate(titleIn, [0, 1], [36, 0]);
  const media = slide.media;
  const font = "Inter, system-ui, sans-serif";
  const copy = (
    <>
      {slide.eyebrow ? (
        <div style={{ fontFamily: font, fontSize: 34, letterSpacing: 8, color: theme.muted, marginBottom: 28 }}>
          {slide.eyebrow}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: font,
          fontWeight: 800,
          fontSize: media ? 76 : 104,
          lineHeight: 1.05,
          color: theme.ink,
          opacity: titleIn,
          transform: `translateY(${titleY}px)`,
          maxWidth: 1500,
        }}
      >
        {slide.title}
      </div>
      <div style={{ marginTop: 56, display: "flex", flexDirection: "column", gap: 26 }}>
        {slide.points.slice(0, build).map((point, i) => {
          const enter = spring({ frame: frame - slideStartFrame(deck, s) - 8 - i * STAGGER.tight, fps, config: SPRINGS.standard });
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 26, opacity: enter }}>
              <div style={{ width: 18, height: 18, borderRadius: 9, background: theme.accent, transform: `scale(${Math.max(0.01, enter)})` }} />
              <div style={{ fontFamily: font, fontSize: media ? 44 : 52, color: theme.ink }}>{point}</div>
            </div>
          );
        })}
      </div>
    </>
  );
  if (!media) {
    return (
      <AbsoluteFill style={{ opacity, justifyContent: "center", padding: 140, transform: `translateY(${yOff}px)` }}>
        {copy}
      </AbsoluteFill>
    );
  }
  // Centerpiece: copy left, phone-framed demo video right.
  return (
    <AbsoluteFill
      style={{
        opacity,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 110,
        transform: `translateY(${yOff}px)`,
      }}
    >
      <div style={{ flex: 1, paddingRight: 80 }}>{copy}</div>
      <div
        style={{
          width: 480,
          height: 853,
          borderRadius: 36,
          overflow: "hidden",
          border: `3px solid ${theme.accent}`,
          background: "#000",
          flexShrink: 0,
        }}
      >
        <Video src={staticFile(media.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} volume={1} />
      </div>
    </AbsoluteFill>
  );
}

export function DeckComposition({
  deck,
  theme = DECK_THEME,
}: {
  deck: Deck;
  theme?: DeckTheme;
}) {
  const frame = useCurrentFrame();
  const located = locateFrame(deck, frame);
  const total = totalBuilds(deck);
  const progress = (located.g + 1) / total;

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {located.phase === "transition" && located.g + 1 < total ? (
        <>
          <BuildLayer deck={deck} g={located.g} frame={frame} theme={theme} opacity={1 - located.progress} yOff={-40 * located.progress} />
          <BuildLayer deck={deck} g={located.g + 1} frame={frame} theme={theme} opacity={located.progress} yOff={40 * (1 - located.progress)} />
        </>
      ) : (
        <BuildLayer deck={deck} g={located.g} frame={frame} theme={theme} opacity={1} yOff={0} />
      )}
      {/* progress rail */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 10, background: "#1A1F1A" }}>
        <div style={{ width: `${progress * 100}%`, height: "100%", background: theme.accent }} />
      </div>
      <div
        style={{
          position: "absolute",
          right: 48,
          bottom: 32,
          fontFamily: "ui-monospace, Consolas, monospace",
          fontSize: 26,
          color: theme.muted,
        }}
      >
        {located.g + 1} / {total}
      </div>
    </AbsoluteFill>
  );
}
