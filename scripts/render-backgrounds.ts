/**
 * Procedural brand-background generator — zero dependencies.
 *
 * Replaces opaque AI-made stills with deterministic, regenerable ones:
 * seeded radial glows + beams/bands + optional blueprint grid + grain +
 * vignette, rendered per-pixel into PPM (ffmpeg reads it) and encoded to PNG.
 *
 * Usage:
 *   node scripts/render-backgrounds.mjs [--only=id] [--out=dir] [--sheet]
 * Defaults: all 14 abstract stills → public/ai-backgrounds/ (720x1280).
 *   --sheet also writes .fx-tmp/bg-sheet.png (contact sheet for review).
 *
 * Palette families: lime (Clipflow #CFFF47), blue (MStudio electrics),
 * series (neutral dark + lime). Proof/product stills are real captures,
 * handled separately — see scripts/extract-proof-stills.mjs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const W = 720;
const H = 1280;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return [m?.[1] ?? a, m?.[2] ?? "true"];
  }),
);
const root = process.cwd();
const outDir = path.join(root, args["out"] ?? "public/ai-backgrounds");
mkdirSync(outDir, { recursive: true });
const only = typeof args["only"] === "string" ? args["only"] : null;

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (s: string): [number, number, number] => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
];

interface Glow {
  x: number;
  y: number;
  r: number;
  color: [number, number, number];
  gain: number;
}
interface BgSpec {
  id: string;
  seed: number;
  base: string;
  glows: Glow[];
  beam?: { angle: number; width: number; color: string; gain: number };
  grid?: boolean;
}

const LIME = "#CFFF47";
const WARM = "#FFB066";
const CYAN = "#59F7FF";
const PERI = "#6FA8FF";

/** 14 abstract stills. Coordinates are fractions of W/H. */
const SPECS: BgSpec[] = [
  { id: "lime-spark", seed: 11, base: "#0A0F08", glows: [
    { x: 0.5, y: 0.42, r: 0.55, color: hex(LIME), gain: 0.9 },
    { x: 0.15, y: 0.85, r: 0.5, color: hex(WARM), gain: 0.35 },
  ]},
  { id: "lime-spine", seed: 12, base: "#0A0F08", glows: [
    { x: 0.5, y: 0.48, r: 0.4, color: hex(LIME), gain: 0.5 },
    { x: 0.5, y: 0.1, r: 0.45, color: hex(LIME), gain: 0.4 },
    { x: 0.5, y: 0.9, r: 0.45, color: hex(WARM), gain: 0.3 },
  ], beam: { angle: 90, width: 0.02, color: LIME, gain: 0.5 } },
  { id: "lime-five-frames", seed: 13, base: "#0A0F08", glows: [
    { x: 0.2, y: 0.2, r: 0.35, color: hex(LIME), gain: 0.5 },
    { x: 0.8, y: 0.45, r: 0.35, color: hex(LIME), gain: 0.45 },
    { x: 0.5, y: 0.75, r: 0.4, color: hex(WARM), gain: 0.4 },
  ]},
  { id: "lime-dawn", seed: 14, base: "#0B0E07", glows: [
    { x: 0.5, y: 1.02, r: 0.75, color: hex(WARM), gain: 0.85 },
    { x: 0.5, y: 0.15, r: 0.5, color: hex(LIME), gain: 0.3 },
  ]},
  { id: "series-episode", seed: 21, base: "#080A0D", glows: [
    { x: 0.5, y: 0.48, r: 0.55, color: hex(LIME), gain: 0.55 },
    { x: 0.85, y: 0.12, r: 0.35, color: hex(PERI), gain: 0.3 },
  ], beam: { angle: 90, width: 0.012, color: LIME, gain: 0.4 } },
  { id: "series-chain", seed: 22, base: "#080A0D", glows: [
    { x: 0.25, y: 0.3, r: 0.4, color: hex(LIME), gain: 0.5 },
    { x: 0.75, y: 0.65, r: 0.4, color: hex(LIME), gain: 0.5 },
  ], beam: { angle: 38, width: 0.015, color: LIME, gain: 0.45 } },
  { id: "series-stair", seed: 23, base: "#080A0D", glows: [
    { x: 0.7, y: 0.25, r: 0.5, color: hex(LIME), gain: 0.6 },
    { x: 0.3, y: 0.8, r: 0.4, color: hex(WARM), gain: 0.3 },
  ], beam: { angle: 28, width: 0.02, color: LIME, gain: 0.4 } },
  { id: "series-horizon", seed: 24, base: "#080A0D", glows: [
    { x: 0.5, y: 0.55, r: 0.6, color: hex(LIME), gain: 0.45 },
    { x: 0.5, y: 0.0, r: 0.4, color: hex(PERI), gain: 0.25 },
  ], beam: { angle: 0, width: 0.012, color: LIME, gain: 0.5 } },
  { id: "blue-price-tag", seed: 31, base: "#060A12", glows: [
    { x: 0.5, y: 0.5, r: 0.5, color: hex(CYAN), gain: 0.55 },
    { x: 0.15, y: 0.9, r: 0.4, color: hex(PERI), gain: 0.35 },
  ]},
  { id: "blue-blueprint", seed: 32, base: "#060A12", glows: [
    { x: 0.5, y: 0.4, r: 0.55, color: hex(CYAN), gain: 0.4 },
  ], grid: true },
  { id: "blue-glass-cards", seed: 33, base: "#060A12", glows: [
    { x: 0.3, y: 0.3, r: 0.4, color: hex(CYAN), gain: 0.5 },
    { x: 0.7, y: 0.7, r: 0.4, color: hex(PERI), gain: 0.5 },
  ]},
  { id: "blue-door", seed: 34, base: "#060A12", glows: [
    { x: 0.5, y: 0.45, r: 0.35, color: hex(CYAN), gain: 0.7 },
    { x: 0.5, y: 0.95, r: 0.5, color: hex(PERI), gain: 0.3 },
  ], beam: { angle: 90, width: 0.03, color: CYAN, gain: 0.35 } },
  { id: "blue-search-path", seed: 35, base: "#060A12", glows: [
    { x: 0.2, y: 0.15, r: 0.4, color: hex(CYAN), gain: 0.5 },
    { x: 0.8, y: 0.85, r: 0.45, color: hex(PERI), gain: 0.45 },
  ], beam: { angle: 45, width: 0.015, color: CYAN, gain: 0.4 } },
  { id: "blue-search-signal", seed: 36, base: "#060A12", glows: [
    { x: 0.5, y: 0.5, r: 0.3, color: hex(CYAN), gain: 0.8 },
    { x: 0.5, y: 0.5, r: 0.7, color: hex(PERI), gain: 0.25 },
  ]},
];

function makeValueNoise(seed: number, gw: number, gh: number): (u: number, v: number) => number {
  const r = rng(seed);
  const grid = new Float32Array((gw + 1) * (gh + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  return (u: number, v: number) => {
    const fx = Math.max(0, Math.min(0.9999, u)) * gw;
    const fy = Math.max(0, Math.min(0.9999, v)) * gh;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = grid[y0 * (gw + 1) + x0]!;
    const b2 = grid[y0 * (gw + 1) + x0 + 1]!;
    const c = grid[(y0 + 1) * (gw + 1) + x0]!;
    const d = grid[(y0 + 1) * (gw + 1) + x0 + 1]!;
    return a + (b2 - a) * sx + (c - a) * sy + (a - b2 - c + d) * sx * sy;
  };
}

function render(spec: BgSpec): Buffer {
  const rand = rng(spec.seed);
  // Analog blotches: two octaves of smooth value noise (±10% luminance).
  // Separate PRNG streams keep glow/grain layout stable across versions.
  const blotch1 = makeValueNoise(spec.seed * 1000 + 7, 8, 14);
  const blotch2 = makeValueNoise(spec.seed * 1000 + 91, 24, 42);
  const base = hex(spec.base);
  const buf = Buffer.alloc(W * H * 3);
  const beamColor = spec.beam ? hex(spec.beam.color) : ([0, 0, 0] as [number, number, number]);
  const theta = spec.beam ? ((spec.beam.angle * Math.PI) / 180) : 0;
  const nx = Math.cos(theta);
  const ny = Math.sin(theta);
  // Beam passes through the brightest glow center.
  const top = spec.glows.reduce((a, b) => (b.gain > a.gain ? b : a), spec.glows[0]!);
  const bx = top.x * W;
  const by = top.y * H;

  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      // Glow energy lives in its own accumulator so the caption-safe mask
      // can hold it back from the text zone (brief §2: densest at edges,
      // fading where the primary focus/text sits).
      let gr = 0;
      let gg = 0;
      let gb = 0;
      for (const gl of spec.glows) {
        const dx = (x - gl.x * W) / (gl.r * W);
        const dy = (y - gl.y * H) / (gl.r * W);
        const d2 = dx * dx + dy * dy;
        if (d2 < 4) {
          const fall = Math.exp(-3.2 * d2) * gl.gain;
          gr += gl.color[0] * fall;
          gg += gl.color[1] * fall;
          gb += gl.color[2] * fall;
        }
      }
      if (spec.beam) {
        // Distance from the beam axis; axis ⟂ (nx,ny) through brightest glow.
        // Axial envelope fades the beam toward the frame edges so it reads as
        // a glow streak, not a full-bleed laser line.
        const dist = Math.abs((x - bx) * nx + (y - by) * ny) / W;
        const along = ((x - bx) * ny - (y - by) * nx) / W;
        if (dist < spec.beam.width * 3) {
          const fall = Math.exp(-(dist * dist) / (2 * spec.beam.width * spec.beam.width)) * spec.beam.gain;
          const env = Math.exp(-(along * along) / (2 * 0.2 * 0.2));
          gr += beamColor[0] * fall * env;
          gg += beamColor[1] * fall * env;
          gb += beamColor[2] * fall * env;
        }
      }
      // Caption-safe mask: 30% energy at the text centroid (0.5, 0.62),
      // full energy past ~0.55 frame-fractions away.
      const dcx = (u - 0.5) * 0.72;
      const dcy = v - 0.62;
      const dcap = Math.sqrt(dcx * dcx + dcy * dcy);
      const mask = 0.3 + 0.7 * Math.min(1, dcap / 0.55);
      let r = base[0] + gr * mask;
      let g = base[1] + gg * mask;
      let b = base[2] + gb * mask;
      if (spec.grid) {
        const gx = x % 72 === 0;
        const gy = y % 72 === 0;
        if (gx || gy) {
          r += 14;
          g += 28;
          b += 44;
        }
      }
      // Analog weight (brief §1): blotches break up digital gradient bands,
      // then grain (±7) + vignette (edges to 55%) as before.
      const blotch = 0.9 + 0.2 * (0.5 * blotch1(u, v) + 0.5 * blotch2(u, v));
      const n = (rand() - 0.5) * 14;
      const vx = (u - 0.5) * 2;
      const vy = (v - 0.5) * 2;
      const vig = 1 - 0.45 * Math.min(1, (vx * vx + vy * vy) / 2);
      const i = (y * W + x) * 3;
      buf[i] = Math.max(0, Math.min(255, r * vig * blotch + n));
      buf[i + 1] = Math.max(0, Math.min(255, g * vig * blotch + n));
      buf[i + 2] = Math.max(0, Math.min(255, b * vig * blotch + n));
    }
  }
  return buf;
}

const targets = only ? SPECS.filter((s) => s.id === only) : SPECS;
if (only && targets.length === 0) {
  console.error(`[backgrounds] unknown id ${only}`);
  process.exit(2);
}
const tmp = path.join(root, ".fx-tmp");
mkdirSync(tmp, { recursive: true });

for (const spec of targets) {
  const ppm = path.join(tmp, `${spec.id}.ppm`);
  writeFileSync(ppm, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), render(spec)]));
  const out = path.join(outDir, `${spec.id}.png`);
  const res = spawnSync(ffmpegPath, ["-y", "-f", "image2", "-i", ppm, "-frames:v", "1", out], { encoding: "utf8" });
  if (res.status !== 0) {
    console.error(`[backgrounds] ${spec.id}: encode failed\n${(res.stderr ?? "").slice(-500)}`);
    process.exit(1);
  }
  console.log(`[backgrounds] wrote ${path.relative(root, out)}`);
}

if (args["sheet"]) {
  const inputs: string[] = [];
  const chains: string[] = [];
  SPECS.forEach((spec, i) => {
    inputs.push("-i", path.join(outDir, `${spec.id}.png`));
    chains.push(`[${i}:v]scale=180:320[s${i}]`);
  });
  const all = SPECS.map((_, i) => `[s${i}]`).join("");
  const cols = 7;
  const layout = SPECS.map((_, i) => `${(i % cols) * 180}_${Math.floor(i / cols) * 320}`).join("|");
  const sheet = path.join(tmp, "bg-sheet.png");
  const res = spawnSync(
    ffmpegPath,
    [...inputs, "-filter_complex", `${chains.join(";")};${all}xstack=inputs=${SPECS.length}:layout=${layout}[vout]`, "-map", "[vout]", "-frames:v", "1", "-y", sheet],
    { encoding: "utf8" },
  );
  if (res.status !== 0) {
    console.error(`[backgrounds] sheet failed\n${(res.stderr ?? "").slice(-500)}`);
    process.exit(1);
  }
  console.log(`[backgrounds] wrote ${path.relative(root, sheet)}`);
}
