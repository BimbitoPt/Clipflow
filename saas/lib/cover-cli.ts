import { spawnSync } from "node:child_process";
import path from "node:path";

export function coverScriptPath(): string {
  return path.join(process.cwd(), "..", "scripts", "render-cover.mjs");
}

// Best-effort cover render for a completed job. Never fails the job:
// covers are additive, video fidelity is the only contract here.
// Non-mstudio packs still render a cover (generic defaults).
export function renderCoverCli(videoPath: string, outDir: string, idea: string): void {
  const script = coverScriptPath();
  const hook = process.env.COVER_HOOK ?? normalizeHook(idea);
  const result = spawnSync(
    "node",
    [script, videoPath, outDir, hook],
    { encoding: "utf8", timeout: 120_000 },
  );
  if (result.status !== 0) {
    const tail = ((result.stderr || "") + (result.stdout || "")).slice(-200);
    console.warn(`[cover] skipped: ${tail}`);
    return;
  }
  const cover = (result.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop();
  if (cover) console.log(`[cover] ${cover}`);
}

// Caption-led hooks outperform restatements: wrap the idea in the
// shipped-one-line frame the pack copy uses on-screen.
function normalizeHook(idea: string): string {
  const trimmed = idea.trim().replace(/\s+/g, " ").replace(/\.$/, "");
  const words = trimmed.split(" ").slice(0, 14).join(" ");
  return words;
}
