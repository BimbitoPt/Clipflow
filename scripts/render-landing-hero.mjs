/**
 * Re-renders landing/public/brand/hero.mp4 with current caption language.
 *
 * The old hero burned in oversized mid-frame karaoke words with no plate.
 * This script rebuilds the 45s demo deterministically with ffmpeg only:
 * stills + slow zoom, phrase captions on a safe-zone plate with active-word
 * accent, hook card over the opening seconds, progress + accent bars.
 * Silent (no voice track), like the file it replaces.
 *
 * Timing mirrors src/lib/planner.ts planWords (even split per cue) and
 * shared/caption-plan.ts speechPhrases (<=5-word groups, break on
 * punctuation). Width estimates mirror render.ts (0.55 x size per char).
 *
 * Usage: node scripts/render-landing-hero.mjs
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = "C:/Users/Guilh/AppData/Local/Temp/opencode/hero-build";
mkdirSync(tmp, { recursive: true });

// This ffmpeg build silently falls back to a mono font when the font path
// contains an escaped drive colon — so stage Arial Bold at a colon-free
// relative path (repo root is the cwd when this script runs as documented).
const stagedFont = path.join(tmp, "arialbd.ttf");
if (!existsSync(stagedFont)) copyFileSync("C:/Windows/Fonts/arialbd.ttf", stagedFont);
const FONT = path.relative(process.cwd(), stagedFont).replace(/\\/g, "/");

const W = 720;
const H = 1280;
const FPS = 30;
const ACCENT = "#CFFF47";
const INK = "#F7F8FA";
const BG = "#080A0D";

const CUES = [
  { kind: "hook", start: 0, end: 4, image: "public/ai-backgrounds/lime-spark.png", text: "Your website should sell while you sleep." },
  { kind: "beat", start: 4, end: 16, image: "public/ai-backgrounds/series-episode.png", text: "Most brands post content. Winners build systems that sell." },
  { kind: "beat", start: 16, end: 28, image: "public/ai-backgrounds/series-chain.png", text: "MSTUDIO ships brand and web builds in one to two weeks." },
  { kind: "beat", start: 28, end: 40, image: "public/ai-backgrounds/lime-spine.png", text: "Fixed price, fixed timeline, code you own." },
  { kind: "cta", start: 40, end: 45, image: "public/ai-backgrounds/series-stair.png", text: "Book MSTUDIO. Start at mstudioweb.pt." },
];

// Conservative advance for Arial Bold (browser measures for real; here we
// must never overflow a plate, so we overestimate slightly).
const estW = (text, size) => text.length * size * 0.6;

function planWords(cue) {
  const tokens = cue.text.split(/\s+/).filter(Boolean);
  const span = cue.end - cue.start;
  return tokens.map((word, i) => ({
    word,
    start: cue.start + (span * i) / tokens.length,
    end: cue.start + (span * (i + 1)) / tokens.length,
  }));
}

function groupPhrases(words) {
  const out = [];
  let group = [];
  const flush = () => {
    if (group.length) out.push({ text: group.map((w) => w.word).join(" "), words: group, start: group[0].start, end: group[group.length - 1].end });
    group = [];
  };
  for (const word of words) {
    group.push(word);
    const needsNext = /^(no|not|never|without|isn't|isn’t|don't|don’t|the|a|an)$/i.test(word.word);
    if (/[.!?;:]$/.test(word.word) || (group.length >= 5 && !needsNext)) flush();
  }
  flush();
  return out;
}

function splitLines(text, size, maxW) {
  const tokens = text.split(" ");
  const lines = [];
  let cur = "";
  for (const tok of tokens) {
    const trial = cur ? `${cur} ${tok}` : tok;
    if (estW(trial, size) <= maxW || cur === "") cur = trial;
    else {
      lines.push(cur);
      cur = tok;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= 2) return lines;
  // Balance overflow into two lines.
  const half = Math.ceil(tokens.length / 2);
  return [tokens.slice(0, half).join(" "), tokens.slice(half).join(" ")];
}

const fade = (start, end) =>
  `if(lt(t,${start}+0.12),(t-${start})/0.12,if(lt(${end}-t,0.12),(${end}-t)/0.12,1))`;

let fileIndex = 0;
// Inline text= with filter escaping (this ffmpeg build rejects textfile).
const escText = (content) =>
  `'${content.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/,/g, "\\,").replace(/%/g, "\\%")}'`;

const inputs = [];
const maps = [];
CUES.forEach((cue, i) => {
  const frames = Math.round((cue.end - cue.start) * FPS);
  inputs.push("-loop", "1", "-framerate", String(FPS), "-i", path.join(root, cue.image).replace(/\\/g, "/"));
  maps.push(
    `[${i}:v]scale=1440:2560:force_original_aspect_ratio=increase,crop=1440:2560,` +
      `zoompan=z='1+0.08*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},` +
      `trim=duration=${cue.end - cue.start},setpts=PTS-STARTPTS[v${i}]`,
  );
});
const concat = `${CUES.map((_, i) => `[v${i}]`).join("")}concat=n=${CUES.length}:v=1:a=0[base]`;

const overlays = [];
// Accent top bar + progress bar.
overlays.push(`drawbox=x=0:y=0:w=${W}:h=12:color=${ACCENT}:t=fill`);
overlays.push(`drawbox=x=0:y=${H - 14}:w='iw*t/45':h=14:color=${ACCENT}:t=fill`);

// Hook card: first 8 words, opening 4 seconds. Shrink-to-fit so the
// headline can never outrun its plate (unlike the old hero).
{
  const hook = CUES[0];
  const headline = hook.text.split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  let size = 40;
  while (size > 24 && estW(headline, size) + W * 0.07 > W * 0.9) size -= 2;
  const boxW = Math.min(W * 0.9, estW(headline, size) + W * 0.07);
  const boxH = size * 1.7;
  const y = Math.round(H * 0.16 - boxH / 2);
  const x = Math.round((W - boxW) / 2);
  const cardFade = `if(lt(t,0.25),t/0.25,if(lt(4-t,0.5),(4-t)/0.5,1))`;
  // Note: this ffmpeg's drawbox has no alpha option, so plates cut on/off
  // with `enable` while text fades — barely visible at 0.7 dark.
  overlays.push(`drawbox=x=${x}:y=${y}:w=${Math.round(boxW)}:h=${Math.round(boxH)}:color=${BG}@0.85:t=fill:enable='between(t,0,4)'`);
  overlays.push(
    `drawtext=fontfile=${FONT}:text=${escText(headline)}:fontsize=${size}:fontcolor=${INK}:` +
      `x=(w-text_w)/2:y=${y + Math.round(boxH / 2 - size * 0.65)}:alpha='${cardFade}':enable='between(t,0,4)'`,
  );
  overlays.push(`drawbox=x=${x}:y=${y + Math.round(boxH) - 4}:w=${Math.round(boxW)}:h=4:color=${ACCENT}:t=fill:enable='between(t,0,4)'`);
}

// Phrase captions with active-word accent.
const SIZE = 46;
const LINE_H = 56;
const MAX_W = W * 0.78;
for (const cue of CUES) {
  for (const phrase of groupPhrases(planWords(cue))) {
    const lines = splitLines(phrase.text, SIZE, MAX_W);
    const y0 = Math.round(H * 0.64 - SIZE);
    const boxW = Math.min(W * 0.86, Math.max(...lines.map((line) => estW(line, SIZE))) + W * 0.045);
    const boxH = lines.length * LINE_H + W * 0.03;
    const boxY = Math.round(H * 0.64 - SIZE);
    const boxX = Math.round((W - boxW) / 2);
    // Plate window shrunk by epsilon: between() is inclusive, so without
    // this the plate lingers one frame past the faded-out text.
    const plateWindow = `between(t,${phrase.start + 0.03},${phrase.end - 0.03})`;
    overlays.push(
      `drawbox=x=${boxX}:y=${boxY}:w=${Math.round(boxW)}:h=${Math.round(boxH)}:color=${BG}@0.7:t=fill:` +
        `enable='${plateWindow}'`,
    );
    lines.forEach((line, li) => {
      const y = y0 + li * LINE_H;
      // Base line drawn word-by-word from the SAME estimates the accent
      // word uses: shared math means the pop lands exactly on its base
      // glyphs instead of ghosting beside them.
      const words = line.split(" ");
      let cursor = Math.round((W - estW(line, SIZE)) / 2);
      const lineFade = fade(phrase.start, phrase.end);
      const lineWindow = `between(t,${phrase.start},${phrase.end})`;
      for (const token of words) {
        overlays.push(
          `drawtext=fontfile=${FONT}:text=${escText(token)}:fontsize=${SIZE}:fontcolor=${INK}:` +
            `x=${cursor}:y=${y}:alpha='${lineFade}':enable='${lineWindow}'`,
        );
        cursor += Math.round(estW(`${token} `, SIZE));
      }
    });
    // Active word in accent at the SAME size and position as its base
    // glyphs: with estimated metrics a 1.15x pop can never land exactly,
    // so color-only karaoke guarantees a clean highlight by construction.
    for (const word of phrase.words) {
      const clean = word.word;
      const lineIndex = lines.findIndex((line) => line.split(" ").includes(clean));
      if (lineIndex < 0) continue;
      const line = lines[lineIndex];
      const tokens = line.split(" ");
      const hit = tokens.indexOf(clean);
      const lineOrigin = Math.round((W - estW(line, SIZE)) / 2);
      const x = lineOrigin + Math.round(estW(`${tokens.slice(0, hit).join(" ")}${hit > 0 ? " " : ""}`, SIZE));
      const y = y0 + lineIndex * LINE_H;
      const window = `between(t,${word.start},${word.end})`;
      const wordFade = fade(word.start, word.end);
      overlays.push(
        `drawtext=fontfile=${FONT}:text=${escText(clean)}:fontsize=${SIZE}:fontcolor=${ACCENT}:` +
          `x=${x}:y=${y}:alpha='${wordFade}':enable='${window}'`,
      );
    }
  }
}

const filter = `${maps.join(";")};${concat};[base]${overlays.join(",")}[out]`;
const out = path.join(root, "landing/public/brand/hero.mp4").replace(/\\/g, "/");
const args = [...inputs, "-filter_complex", filter, "-map", "[out]", "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", "-y", out];
const result = spawnSync(ffmpegPath, args, { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Wrote ${out}`);
