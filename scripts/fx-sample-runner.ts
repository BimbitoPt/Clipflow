/**
 * Per-niche FX sample renderer (runs bundled via scripts/render-fx-samples.mjs).
 *
 * For every niche (or one): builds an 8s preview clip from two stills with a
 * real cut at 4s, composes the niche pack at the requested level, validates
 * the graph, checks required filters, burns ASS captions, and writes a
 * low-res mp4 to outputs/fx-samples/<niche>.mp4 for visual comparison.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import {
  NICHE_PROFILES,
  nicheProfile,
  detectNiche,
  composeTimeline,
  checkFilters,
  escAssPath,
  formatCommand,
  previewPlan,
  validatePackRefs,
  FilterGraph,
  type FxCtx,
} from "../shared/effects/packs/index";

const root = process.cwd();
const tmp = path.join(root, ".fx-tmp");
mkdirSync(tmp, { recursive: true });
const outDir = path.join(root, "outputs", "fx-samples");
mkdirSync(outDir, { recursive: true });

// Colon-free staged font (this ffmpeg build falls back to a mono font when
// the fontfile path contains an escaped drive colon).
const stagedFont = path.join(tmp, "arialbd.ttf");
if (!existsSync(stagedFont)) copyFileSync("C:/Windows/Fonts/arialbd.ttf", stagedFont);
const FONT = path.relative(root, stagedFont).replace(/\\/g, "/");

const STILLS: Record<string, [string, string]> = {
  universal: ["public/ai-backgrounds/series-episode.png", "public/ai-backgrounds/lime-spine.png"],
  editing: ["public/ai-backgrounds/lime-spark.png", "public/ai-backgrounds/series-episode.png"],
  tech: ["public/ai-backgrounds/blue-search-path.png", "public/ai-backgrounds/blue-glass-cards.png"],
  gaming: ["public/ai-backgrounds/series-chain.png", "public/ai-backgrounds/lime-spine.png"],
  finance: ["public/ai-backgrounds/blue-price-tag.png", "public/ai-backgrounds/blue-door.png"],
  fitness: ["public/ai-backgrounds/lime-five-frames.png", "public/ai-backgrounds/series-stair.png"],
  food: ["public/ai-backgrounds/lime-dawn.png", "public/ai-backgrounds/series-horizon.png"],
  edu: ["public/ai-backgrounds/blue-blueprint.png", "public/ai-backgrounds/blue-search-result.png"],
};

const ACCENTS: Record<string, string> = {
  universal: "#CFFF47",
  editing: "#CFFF47",
  tech: "#59F7FF",
  gaming: "#FF4DFF",
  finance: "#FFC94D",
  fitness: "#FF5A3C",
  food: "#FFB066",
  edu: "#6FA8FF",
};

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return [m?.[1] ?? a, m?.[2] ?? "true"];
  }),
);
const onlyNiche = typeof args["niche"] === "string" && args["niche"] !== "all" ? (args["niche"] as string) : null;
const level = (args["level"] as string) === "subtle" || (args["level"] as string) === "hype" ? (args["level"] as string) : "medium";
const seed = Number.parseInt((args["seed"] as string) ?? "7", 10) || 7;

const refErrors = validatePackRefs(NICHE_PROFILES);
if (refErrors.length > 0) {
  console.error(`[fx-samples] bad pack refs:\n${refErrors.join("\n")}`);
  process.exit(2);
}

const niches = onlyNiche ? [nicheProfile(onlyNiche)] : NICHE_PROFILES;
let failed = 0;

for (const profile of niches) {
  const [imgA, imgB] = STILLS[profile.id] ?? STILLS["universal"];
  const preview = previewPlan(8, 720, 1280);
  const [pw, ph] = preview.scale.replace("scale=", "").split(":").map(Number);
  const ctx: FxCtx = {
    W: pw,
    H: ph,
    fps: 30,
    duration: preview.seconds,
    accent: ACCENTS[profile.id] ?? "#CFFF47",
    bg: "#080A0D",
    ink: "#F7F8FA",
    fontFile: FONT,
  };
  const detected = detectNiche({
    overrideId: profile.id,
    description: `${profile.label} video`,
    transcript: `${(profile.keywords[0] ?? "clip")} ${(profile.keywords[1] ?? "video")} ${(profile.keywords[2] ?? "short")}`,
    profiles: NICHE_PROFILES,
  });
  console.log(`[fx-samples] niche=${profile.id} detected=${detected.id} (expect ${profile.id})`);

  const cues = {
    cuts: [4],
    beats: [1, 3, 5, 7],
    keywords: [
      { t: 2, word: profile.keywords[0] ?? "wow" },
      { t: 6, word: profile.keywords[1] ?? "new" },
    ],
  };
  const assCues = [
    { text: `${profile.label} demo one`, start: 0.5, end: 3.5 },
    { text: `effects land on the beat`, start: 4.5, end: 7.5 },
  ];

  // Pass 1 (throwaway graph): collect required filters, then recompose
  // skipping anything the local build lacks. Pass 2 chains segments +
  // fx onto a fresh graph.
  const probe = composeTimeline({ profile, duration: preview.seconds, level, seed, ctx, cues });
  const missing = checkFilters(ffmpegPath as string, probe.requires);
  const unavailable = new Set(missing);
  if (missing.length > 0) {
    console.log(`[fx-samples] ${profile.id}: missing filters ${missing.join(",")} — recomposing without them`);
  }
  const g = new FilterGraph();
  const v0 = g.chain("[0:v]", [
    `scale=${pw * 2}:${ph * 2},zoompan=z='min(zoom+0.0015,1.25)':d=120:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${pw}x${ph}:fps=30,setsar=1`,
  ]);
  const v1 = g.chain("[1:v]", [
    `scale=${pw * 2}:${ph * 2},zoompan=z='min(zoom+0.0015,1.25)':d=120:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${pw}x${ph}:fps=30,setsar=1`,
  ]);
  const vcat = g.chain(`[${v0}][${v1}]`, ["concat=n=2:v=1:a=0"]);
  const composed = composeTimeline({
    profile,
    duration: preview.seconds,
    level,
    seed,
    ctx,
    cues,
    assCues,
    unavailable,
    graph: g,
    fromLabel: `[${vcat}]`,
  });
  let tail = composed.outLabel;
  if (composed.ass) {
    const assPath = path.join(tmp, `fx-${profile.id}.ass`);
    writeFileSync(assPath, composed.ass);
    tail = g.chain(`[${tail}]`, [`ass='${escAssPath(assPath)}'`]);
  }
  const vout = g.chain(`[${tail}]`, ["format=yuv420p"]);
  const finalErrors = g.validate(2);
  if (finalErrors.length > 0) {
    console.error(`[fx-samples] ${profile.id}: invalid final graph:\n${finalErrors.join("\n")}`);
    failed++;
    continue;
  }
  const filterFile = path.join(tmp, `fx-${profile.id}.txt`).replace(/\\/g, "/");
  writeFileSync(filterFile, g.script());
  const out = path.join(outDir, `${profile.id}.mp4`);
  const fargs = [
    "-y",
    "-loop",
    "1",
    "-framerate",
    "30",
    "-i",
    path.join(root, imgA),
    "-loop",
    "1",
    "-framerate",
    "30",
    "-i",
    path.join(root, imgB),
    "-filter_complex_script",
    filterFile,
    "-map",
    `[${vout}]`,
    "-t",
    String(preview.seconds),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    out,
  ];
  const res = spawnSync(ffmpegPath as string, fargs, { encoding: "utf8" });
  if (res.status !== 0) {
    console.error(`[fx-samples] ${profile.id}: ffmpeg failed\nCMD: ${formatCommand(ffmpegPath as string, fargs)}\n${(res.stderr ?? "").slice(-2000)}`);
    failed++;
    continue;
  }
  console.log(
    `[fx-samples] ${profile.id}: wrote ${path.relative(root, out)} ` +
      `placed=[${composed.placed.map((p) => `${p.defId}@${p.start.toFixed(1)}s`).join(", ")}]` +
      (composed.skipped.length ? ` skipped=${composed.skipped.length}` : ""),
  );
}
process.exit(failed > 0 ? 1 : 0);
