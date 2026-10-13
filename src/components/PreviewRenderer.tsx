import { useEffect, useRef } from "react";
import type { CaptionPhrase } from "../../shared/caption-plan";
import type { VisualEffect } from "../../shared/visual-effects";
import { cueIndexOf } from "../lib/app-utils";
import { markMilestone } from "../lib/activation";
import type { StockAsset } from "../lib/broll";
import type { Theme } from "../lib/packs";
import { planFrames, VIDEO_SECS, type WordCue } from "../lib/planner";
import { drawFrame, type DrawCtx, type RenderExtra } from "../lib/render";
import type { SceneChoice } from "../lib/scene-assets";
import type { VideoScript } from "../lib/script";
import type { WordTiming } from "../lib/session";
import { browserStorage as storage } from "../lib/storage";

export interface PreviewRendererProps {
  script: VideoScript | null;
  words: WordCue[] | undefined;
  captions: CaptionPhrase[];
  timing: WordTiming | null;
  selectedScene: number;
  sceneChoices: SceneChoice[];
  sceneAssets: Array<StockAsset | null>;
  visualEffect: VisualEffect;
  theme: Theme;
  /** Y anchor for captions, from the platform preset. */
  captionAnchor: number;
  /** Surfaced draw failures (same engine as the export, so it can throw). */
  onError: (message: string) => void;
}

/**
 * PreviewRenderer: the live 9:16 frame. Draws the middle frame of the
 * selected scene with the same planner/draw engine the MP4 export uses, so
 * what the user sees is what the export renders.
 */
export default function PreviewRenderer(props: PreviewRendererProps) {
  const { script, words, captions, timing, selectedScene, sceneChoices, sceneAssets, visualEffect, theme, captionAnchor, onError } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Keep the draw effect off the caller's identity: an inline `setErr`
  // wrapper must not redraw the frame on every render.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (!script) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    try {
      const frames = planFrames(script, 30, timing?.windows ?? null, sceneChoices.map((choice, index) => choice.kind === "upload" && choice.approvedProof === true && sceneAssets[index]?.src === `upload:${choice.id}`), sceneAssets);
      const cueFrames = frames.filter((frame) => cueIndexOf(script, frame.cue) === selectedScene);
      const frame = cueFrames[Math.floor(cueFrames.length / 2)] ?? frames[0];
      if (!frame) return;
      const extra: RenderExtra = {};
      extra.visualEffect = visualEffect;
      extra.captions = captions;
      extra.captionAnchor = captionAnchor;
      if (words) extra.words = words;
      const asset = sceneAssets[selectedScene];
      if (asset) extra.asset = asset;
      drawFrame(ctx as DrawCtx, frame, theme, 360, 640, extra, timing?.total ?? VIDEO_SECS);
      try {
        markMilestone(storage, "firstPreview");
      } catch {
        // Instrumentation never breaks the editor.
      }
    } catch (e) {
      onErrorRef.current(e instanceof Error ? e.message : String(e));
    }
  }, [script, words, captions, timing, selectedScene, sceneAssets, sceneChoices, visualEffect, captionAnchor]);

  return <canvas ref={canvasRef} width={360} height={640} aria-label={`Scene ${selectedScene + 1} preview`} />;
}
