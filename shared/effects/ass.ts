import type { AssWord } from "./types";
import { speechPhrases, type CaptionWord } from "../caption-plan";

/**
 * Animated ASS subtitle builder. Generates per-word pop/bounce/karaoke
 * effects with ASS override tags and burns in via the `ass` filter.
 * No external assets — text + tags only.
 */

export type AssStyleId = "pop" | "karaoke" | "bounce" | "clean";

export interface AssCue {
  text: string;
  start: number;
  end: number;
}

export interface AssOpts {
  cues: AssCue[];
  style: string;
  W: number;
  H: number;
  fontName?: string;
  accent?: string;
  ink?: string;
  /** Base font size; defaults to H/22. */
  size?: number;
}

function hexToAss(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return "&H00FFFFFF";
  const [r, g, b] = [m[1].slice(0, 2), m[1].slice(2, 4), m[1].slice(4, 6)];
  return `&H00${b}${g}${r}`.toUpperCase();
}

function fmtTime(s: number): string {
  const c = Math.max(0, s);
  const h = Math.floor(c / 3600);
  const m = Math.floor((c % 3600) / 60);
  const sec = Math.floor(c % 60);
  const cs = Math.floor((c % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function evenWords(text: string, start: number, end: number): AssWord[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const span = Math.max(0.01, end - start);
  return tokens.map((word, i) => ({
    text: word,
    start: start + (span * i) / tokens.length,
    end: start + (span * (i + 1)) / tokens.length,
  }));
}

/**
 * Build a complete .ass file. Word times come from shared speechPhrases
 * when timings exist, else even-split across the cue span. The caller
 * writes the string to disk and burns it with `ass='file'`.
 */
export function buildAss(opts: AssOpts): string {
  const { W, H } = opts;
  const size = Math.round(opts.size ?? H / 22);
  const accent = hexToAss(opts.accent ?? "#CFFF47");
  const ink = hexToAss(opts.ink ?? "#F7F8FA");
  const font = opts.fontName ?? "Arial";
  const style: AssStyleId =
    opts.style === "karaoke" || opts.style === "bounce" || opts.style === "clean" ? opts.style : "pop";

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: FxPop,${font},${size},${ink},${accent},&HCC000000,&H99000000,-1,0,0,0,100,100,0.5,0,1,4,1,2,40,40,${Math.round(H * 0.11)},1`,
    `Style: FxSub,${font},${size},${ink},${accent},&HCC000000,&H99000000,-1,0,0,0,100,100,0.5,0,1,4,1,2,40,40,${Math.round(H * 0.11)},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events: string[] = [];
  for (const cue of opts.cues) {
    if (cue.end <= cue.start) continue;
    // Even-split words, then the shared speech-phrase grouping
    // (punctuation-aware, <=5 words, qualifier-safe). Karaoke times
    // re-split evenly inside each phrase span.
    const timed: CaptionWord[] = evenWords(cue.text, cue.start, cue.end).map((w) => ({
      word: w.text,
      start: w.start,
      end: w.end,
    }));
    for (const phrase of speechPhrases(timed)) {
      const tokens = phrase.text.split(/\s+/).filter(Boolean);
      const span = Math.max(0.01, phrase.end - phrase.start);
      const line: AssWord[] = tokens.map((word, i) => ({
        text: word,
        start: phrase.start + (span * i) / tokens.length,
        end: phrase.start + (span * (i + 1)) / tokens.length,
      }));
      const lstart = phrase.start;
      const lend = phrase.end;
      if (style === "karaoke") {
        const parts = line.map((w) => {
          const cs = Math.max(1, Math.round((w.end - w.start) * 100));
          return `{\\k${cs}}${w.text}`;
        });
        events.push(
          `Dialogue: 0,${fmtTime(lstart)},${fmtTime(lend)},FxSub,,0,0,0,,${parts.join(" ")}`,
        );
      } else if (style === "bounce") {
        const y0 = Math.round(H * 0.76);
        const text = line.map((w) => w.text).join(" ");
        events.push(
          `Dialogue: 0,${fmtTime(lstart)},${fmtTime(lend)},FxPop,,0,0,0,,{\\fad(120,120)\\move(0,${y0 - 26},0,${y0},0,260)}${text}`,
        );
      } else if (style === "clean") {
        const text = line.map((w) => w.text).join(" ");
        events.push(`Dialogue: 0,${fmtTime(lstart)},${fmtTime(lend)},FxSub,,0,0,0,,${text}`);
      } else {
        // pop: fast scale-in via \t + \fscx.
        const text = line.map((w) => w.text).join(" ");
        events.push(
          `Dialogue: 0,${fmtTime(lstart)},${fmtTime(lend)},FxPop,,0,0,0,,{\\fad(80,80)\\fscx60\\fscy60\\t(0,160,\\fscx110\\fscy110)}${text}`,
        );
      }
    }
  }
  return [...header, ...events].join("\n") + "\n";
}
