import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { listBatches } from "../src/lib/batch-store";
import { slug } from "../src/lib/render-artifacts";

const batchName = "Proof on screen · Clipflow + MStudio · 10-episode pilot";

async function main() {
  const batch = (await listBatches()).find(({ batch }) => batch.name === batchName);
  if (!batch) throw new Error("Proof series batch is missing");
  if (batch.clips.length !== 10 || batch.clips.some((clip) => clip.status !== "rendered" || !clip.outputPath || !clip.coverPath)) throw new Error("All ten clips must be rendered before packaging");
  const out = path.join(process.cwd(), "exports", "ready-to-post-proof-series-2026-09-28");
  const manifest = [];
  for (const clip of batch.clips) {
    const brand = clip.brandId === "mstudio" ? "mstudio-web" : "clipflow";
    const episode = Number(clip.concept.match(/\s\/\s(\d+)\s\//)?.[1]);
    if (!episode) throw new Error(`Missing episode number: ${clip.concept}`);
    const label = clip.concept.split(" / ").at(-1)!;
    const base = `${String(episode).padStart(2, "0")}-${slug(label)}`;
    const directory = path.join(out, brand);
    await mkdir(directory, { recursive: true });
    const mp4 = `${base}.mp4`, cover = `${base}-cover.png`, youtube = `${base}-youtube-shorts.txt`, tiktok = `${base}-tiktok.txt`;
    await copyFile(path.join(process.cwd(), clip.outputPath!), path.join(directory, mp4));
    await copyFile(path.join(process.cwd(), clip.coverPath!), path.join(directory, cover));
    const brandName = brand === "clipflow" ? "Clipflow" : "MStudio Web";
    const destination = brand === "clipflow" ? "" : clip.concept.includes("brief") ? "https://www.mstudioweb.pt/contact" : "https://www.mstudioweb.pt/pricing";
    const youtubeBody = clip.postCopy.replace(/#YouTubeShorts|#TikTok/g, "").replace(/Link in bio\.?/gi, destination ? `Details: ${destination}` : "Follow Clipflow for updates.").replace(/\s+$/g, "");
    await writeFile(path.join(directory, youtube), `TITLE: ${clip.hook} | ${brandName} #Shorts\n\nDESCRIPTION:\n${youtubeBody}\n#Shorts\n`, "utf8");
    const tiktokTags = brand === "clipflow" ? "#Clipflow #TikTok #VideoCreation" : "#MStudioWeb #TikTok #WebDesign";
    await writeFile(path.join(directory, tiktok), `${clip.hook}\n\n${clip.keyMessage}\n\n${clip.cta}\n\n${tiktokTags}\n`, "utf8");
    manifest.push({ brand, episode, title: label, hero: episode === 1, mp4: `${brand}/${mp4}`, cover: `${brand}/${cover}`, youtube: `${brand}/${youtube}`, tiktok: `${brand}/${tiktok}`, durationSeconds: clip.durationSeconds, clipId: clip.id });
  }
  await writeFile(path.join(out, "manifest.json"), `${JSON.stringify({ batchId: batch.batch.id, createdAt: new Date().toISOString(), format: "1080x1920 vertical H.264 MP4", platforms: ["YouTube Shorts", "TikTok"], clips: manifest }, null, 2)}\n`, "utf8");
  await writeFile(path.join(out, "README.txt"), "PROOF ON SCREEN · 10-EPISODE PILOT\n\nFive Clipflow and five MStudio Web episodes. Episode 01 is each brand's cinematic hero.\nEach episode has one MP4 master, a cover, and separate YouTube Shorts and TikTok post text.\nThe video itself contains real first-party app or site screens. Review copy and links before publishing. Nothing has been posted automatically.\n", "utf8");
  console.log(out);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
