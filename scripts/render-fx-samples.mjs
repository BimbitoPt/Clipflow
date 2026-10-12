/**
 * Render one low-res preview clip per niche FX pack.
 *
 * Bundles scripts/fx-sample-runner.ts (which imports shared/effects) with
 * esbuild, then runs it. All rendering uses the local ffmpeg-static build.
 *
 * Usage:
 *   node scripts/render-fx-samples.mjs [--niche=<id|all>] [--level=subtle|medium|hype] [--seed=7]
 *
 * Output: outputs/fx-samples/<niche>.mp4 (360x640, ~8s each).
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { unlinkSync } from "node:fs";
import path from "node:path";

const requirePackage = createRequire(import.meta.url);
const { buildSync } = requirePackage("esbuild");

const root = process.cwd();
// Bundle inside scripts/ so the external ffmpeg-static resolves via the
// repo's node_modules. Deleted after the run.
const bundle = path.join(root, "scripts", ".fx-sample-runner.bundled.mjs");
buildSync({
  entryPoints: [path.join(root, "scripts", "fx-sample-runner.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["ffmpeg-static"],
  outfile: bundle,
  logLevel: "warning",
});

let code = 1;
try {
  const res = spawnSync(process.execPath, [bundle, ...process.argv.slice(2)], { stdio: "inherit" });
  code = res.status ?? 1;
} finally {
  try {
    unlinkSync(bundle);
  } catch {
    // ignore
  }
}
process.exit(code);
