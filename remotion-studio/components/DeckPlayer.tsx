import React, { useCallback, useEffect, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { DeckComposition, DECK_THEME, type DeckTheme } from "../src/remotion/deck/DeckComposition";
import { buildStartFrame, deckReducer, totalBuilds, totalFrames, type Deck } from "../src/remotion/deck/deck";

/**
 * Presenter deck player. Every transition is a seek to a build-start frame,
 * so stepping is exactly reversible with the arrow keys at presenter pace.
 */
export default function DeckPlayer({
  deck,
  theme = DECK_THEME,
  autoAdvanceMs,
}: {
  deck: Deck;
  theme?: DeckTheme;
  /** Kiosk mode: advance automatically every N ms. Default: manual. */
  autoAdvanceMs?: number;
}) {
  const playerRef = useRef<PlayerRef>(null);
  const [cursor, setCursor] = useState(0);
  const total = totalBuilds(deck);

  const step = useCallback(
    (g: number) => {
      const clamped = Math.max(0, Math.min(total - 1, g));
      setCursor(clamped);
      playerRef.current?.pause();
      playerRef.current?.seekTo(buildStartFrame(deck, clamped));
    },
    [deck, total],
  );

  const next = useCallback(() => step(deckReducer(deck, cursor, { type: "next" })), [deck, cursor, step]);
  const prev = useCallback(() => step(deckReducer(deck, cursor, { type: "prev" })), [deck, cursor, step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        prev();
      } else if (e.key === "Home") {
        e.preventDefault();
        step(0);
      } else if (e.key === "End") {
        e.preventDefault();
        step(total - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, step, total]);

  useEffect(() => {
    if (!autoAdvanceMs || autoAdvanceMs < 1000) return;
    const id = window.setInterval(() => {
      setCursor((c) => {
        const n = deckReducer(deck, c, { type: "next" });
        if (n !== c) {
          playerRef.current?.seekTo(buildStartFrame(deck, n));
        }
        return n;
      });
    }, autoAdvanceMs);
    return () => window.clearInterval(id);
  }, [autoAdvanceMs, deck]);

  return (
    <div className="deck-shell">
      <Player
        ref={playerRef}
        component={DeckComposition}
        inputProps={{ deck, theme }}
        durationInFrames={totalFrames(deck)}
        compositionWidth={1920}
        compositionHeight={1080}
        fps={deck.fps}
        controls
        style={{ width: "100%", height: "100%" }}
      />
      <div className="deck-controls" role="toolbar" aria-label="Deck controls">
        <button type="button" onClick={prev} disabled={cursor === 0} aria-label="Previous build">
          ← Prev
        </button>
        <span aria-live="polite">
          {cursor + 1} / {total}
        </span>
        <button type="button" onClick={next} disabled={cursor >= total - 1} aria-label="Next build">
          Next →
        </button>
      </div>
    </div>
  );
}
