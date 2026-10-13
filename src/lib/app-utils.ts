/**
 * Small DOM/UI helpers shared by the editor shell. Kept out of App.tsx so the
 * component stays focused on composition and the helpers stay unit-testable.
 */

/** Copy text, falling back to a hidden textarea for WebViews without the async clipboard API. */
export async function copyText(s: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(s);
    return;
  } catch {
    // fall through to legacy textarea path
  }
  const ta = document.createElement("textarea");
  ta.value = s;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}

/**
 * Index of a cue inside a script. Prefer object identity (the cue object the
 * script produced), then match on start+kind — frames reference cues by
 * reference, but rebuilt plans may only carry value equality.
 */
export function cueIndexOf(script: { cues: Array<{ start: number; kind: string }> }, cue: { start: number; kind: string }): number {
  const byRef = (script.cues as unknown[]).indexOf(cue as unknown);
  if (byRef >= 0) return byRef;
  const byStart = script.cues.findIndex((c) => c.start === cue.start && c.kind === cue.kind);
  return byStart >= 0 ? byStart : 0;
}

/**
 * Best-effort seek with a 250 ms cap. Seeks are on the render hot path, so a
 * stuck `seeked` event must never stall the export: the promise resolves on
 * the event, on the timeout, or on a synchronous throw.
 */
export async function seekVideo(el: HTMLVideoElement, t: number): Promise<void> {
  try {
    const dur = el.duration;
    const target = Number.isFinite(dur) && dur > 0 ? t % dur : t;
    if (Math.abs(el.currentTime - target) < 0.001) return;
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      const timer = setTimeout(finish, 250);
      const onSeeked = () => {
        clearTimeout(timer);
        el.removeEventListener("seeked", onSeeked);
        finish();
      };
      el.addEventListener("seeked", onSeeked, { once: true });
      try {
        el.currentTime = target;
      } catch {
        clearTimeout(timer);
        finish();
      }
    });
  } catch {
    // Seek is best-effort; gradient/video-current-frame fallback covers failure.
  }
}
