import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getBatch, updateClip } from "../src/lib/batch-store";
import { encodePcmWav, generateVoiceover, voiceoverDigest } from "../src/lib/voiceover";
import type { ClipBrief, WordTiming } from "../src/lib/domain";

const exec = promisify(execFile);
const batchId = "batch-3329024d-d228-4a1a-b2dc-5b3110fca943";
const style = "High-end cinematic editorial still, vertical 9:16, deep charcoal, one saturated brand accent, tactile grain, subtle volumetric haze, negative space for text, matching lighting and lens across four scenes. Absolutely no text, letters, numbers, logos, UI, or watermarks.";
const stories = {
  "clip-d04f2a22-efd7-4db3-9d04-e930766b5568": {
    template: "clipflow-spine" as const, brand: "clipflow", concept: "A script with a spine", hook: "You've got the idea. You don't have the script.",
    keyMessage: "Clipflow turns an idea into a hook, three beats, a call to action, and a vertical video.", supportingPoint: "A clear five-part story structure.", proof: null,
    cta: "Type your idea. Get the video.",
    sceneCopy: ["Idea. No script.", "Give it a spine.", "Five parts. One flow.", "Idea to video."],
    sceneSeconds: [3.1, 3.1, 4.1, 3.1],
    script: "You've got the idea. You don't have the script. Clipflow gives it a spine. A hook. Three beats. One clear call to action. Type your idea. Get the video.",
    cues: [
      ["You've got the idea.", ["idea"]], ["You don't have the script.", ["script"]],
      ["Clipflow gives it a spine.", ["spine"]], ["A hook. Three beats.", ["hook", "beats"]],
      ["One clear call to action.", ["action"]], ["Type your idea. Get the video.", ["idea", "video"]],
    ] as [string, string[]][],
    postCopy: "An idea is enough to start. Clipflow gives it a hook, three beats, a clear CTA, and a video worth posting. Follow Clipflow for updates. #Clipflow #ShortFormVideo",
    imageIdeas: ["A lone electric lime spark floating in a dark room.", "A stack of blank film frames assembling into a vertical spine.", "A complete vertical spine of five luminous blank film frames and nodes.", "An electric lime sunrise opening across a dark horizon."],
  },
  "clip-1a53c2dc-9598-4d52-a577-d7fad03fe444": {
    template: "mstudio-pricing" as const, brand: "mstudio", concept: "MStudio Web pricing, clearly shown", hook: "How much does a website cost?", keyMessage: "MStudio Web publishes one-time pricing for three separate offers.",
    supportingPoint: "Speed Site €299. AI Automation Build €449. Brand + Website System €699.", proof: "See each offer's scope and handoff details on the pricing page.",
    cta: "Full scope: link in bio.",
    sceneCopy: ["No more price guessing.", "Pick the build.", "Three builds. Clear prices.", "Full scope. Link in bio."],
    sceneSeconds: [2.6, 1.4, 9.4, 2.6],
    script: "How much does a website cost? Here are the prices. Speed Site: two ninety-nine. AI Automation Build: four forty-nine. Brand and Website System: six ninety-nine. One-time pricing. Scope and handoff included. Full details, link in bio.",
    cues: [
      ["How much does a website cost?", ["cost"]], ["Here are the prices.", ["prices"]],
      ["Speed Site: two ninety-nine.", ["ninety-nine"]], ["AI Automation Build: four forty-nine.", ["forty-nine"]],
      ["Brand and Website System: six ninety-nine.", ["ninety-nine"]], ["One-time pricing.", ["pricing"]],
      ["Scope and handoff included.", ["scope", "handoff"]], ["Full details, link in bio.", ["bio"]],
    ] as [string, string[]][],
    postCopy: "Clear, one-time prices at MStudio Web: Speed Site €299; AI Automation Build €449; Brand + Website System €699. See the scope and handoff for each offer at https://mstudioweb.pt/pricing — link in bio. #MStudioWeb #WebDesign",
    imageIdeas: ["A blank price tag half hidden in electric blue fog.", "A clean architectural blueprint and storefront in a dark studio.", "Three blank floating glass cards in a dark void.", "A doorway of electric blue light opening in darkness."],
  },
};

type Story = (typeof stories)[keyof typeof stories];
function words(text: string) { return text.trim().split(/\s+/).map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")); }
function makeCues(script: string, cues: [string, string[]][], timings: WordTiming[]) {
  const all = words(script);
  let cursor = 0;
  return cues.map(([text, emphasis]) => {
    const phrase = words(text);
    const start = cursor;
    if (all.slice(start, start + phrase.length).join(" ") !== phrase.join(" ")) throw new Error(`Caption phrase does not match narration: ${text}`);
    cursor += phrase.length;
    return { text, start: Math.max(0, timings[start].start - 0.06), end: timings[cursor - 1].end + 0.08, emphasis };
  });
}

function synthBed(seconds: number, seed: number) {
  const rate = 24000;
  const audio = new Float32Array(Math.ceil(seconds * rate));
  const notes = seed === 0 ? [110, 164.81, 220, 329.63] : [98, 146.83, 196, 293.66];
  for (let i = 0; i < audio.length; i++) {
    const t = i / rate;
    const pulse = Math.pow(Math.max(0, Math.sin(2 * Math.PI * (seed === 0 ? 1.25 : 1.5) * t)), 5);
    const fade = Math.min(1, t / 0.4, (seconds - t) / 0.6);
    const pad = notes.reduce((sum, hz, index) => sum + Math.sin(2 * Math.PI * hz * t + Math.sin(t * 0.24) * .2) * (0.13 / (index + 1)), 0);
    audio[i] = Math.max(-1, Math.min(1, (pad + pulse * Math.sin(2 * Math.PI * notes[0] * t) * .05) * Math.max(0, fade)));
  }
  return encodePcmWav(audio, rate);
}

function synthSfx(seconds: number, boundaries: number[], pops: number[]) {
  const rate = 24000;
  const audio = new Float32Array(Math.ceil(seconds * rate));
  let noise = 99173;
  const rand = () => { noise ^= noise << 13; noise ^= noise >>> 17; noise ^= noise << 5; return (noise >>> 0) / 0xffffffff * 2 - 1; };
  for (let i = 0; i < audio.length; i++) {
    const t = i / rate;
    let value = 0;
    for (const boundary of boundaries) {
      const local = t - boundary + 0.2;
      if (local >= 0 && local < 0.5) value += rand() * Math.sin(Math.PI * local / 0.5) * 0.2;
    }
    for (const pop of pops) {
      const local = t - pop;
      if (local >= 0 && local < 0.24) value += Math.sin(2 * Math.PI * (420 - local * 900) * local) * Math.exp(-local * 23) * 0.35;
    }
    audio[i] = Math.max(-1, Math.min(1, value));
  }
  return encodePcmWav(audio, rate);
}

async function normalizeVoice(clip: ClipBrief, voicePath: string, tempo: number) {
  const input = path.join(process.cwd(), "public", voicePath);
  const output = input.replace(/\.wav$/, "-lufs14.wav");
  await exec("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-af", `atempo=${tempo},loudnorm=I=-14:TP=-1.5:LRA=11`, output]);
  const measured = await exec("ffmpeg", ["-hide_banner", "-nostats", "-i", output, "-af", "ebur128=peak=true", "-f", "null", "NUL"]);
  const matches = [...measured.stderr.matchAll(/I:\s*(-?\d+(?:\.\d+)?) LUFS/g)];
  const lufs = Number(matches.at(-1)?.[1]);
  if (!Number.isFinite(lufs) || Math.abs(lufs + 14) > 1.5) throw new Error(`${clip.id}: voice integrated loudness ${lufs} LUFS is outside target`);
  console.log(`${clip.id}: voice ${lufs.toFixed(1)} LUFS`);
  return path.relative(path.join(process.cwd(), "public"), output).replace(/\\/g, "/");
}

async function prepare(clip: ClipBrief, story: Story) {
  const cached = clip.voiceover.script === story.script && clip.voiceover.generatedFor === voiceoverDigest(clip.voiceover.voiceId, story.script) && clip.voiceover.audioPath?.endsWith("-lufs14.wav") && clip.voiceover.wordTimings.length > 0;
  let normalizedPath: string;
  let wordTimings: WordTiming[];
  let generatedFor: string | null;
  let narrationSeconds: number;
  if (cached && clip.voiceover.audioPath) {
    await readFile(path.join(process.cwd(), "public", clip.voiceover.audioPath));
    normalizedPath = clip.voiceover.audioPath;
    wordTimings = clip.voiceover.wordTimings;
    generatedFor = clip.voiceover.generatedFor;
    narrationSeconds = wordTimings.at(-1)!.end;
  } else {
    const generated = await generateVoiceover(story.script, clip.id, process.cwd(), undefined, { voiceId: clip.voiceover.voiceId });
    const tempo = story.template === "mstudio-pricing" ? 1.15 : 1;
    normalizedPath = await normalizeVoice(clip, generated.audioPath, tempo);
    narrationSeconds = generated.durationSeconds / tempo;
    wordTimings = generated.wordTimings.map((word) => ({ ...word, start: word.start / tempo, end: word.end / tempo }));
    generatedFor = generated.generatedFor;
  }
  const durationSeconds = Math.max(10, Math.ceil(narrationSeconds + 0.55));
  const folder = `scene-backgrounds/${story.template}`;
  const scenes = await Promise.all(story.imageIdeas.map(async (idea, index) => {
    const prompt = `${style} ${story.brand === "clipflow" ? "Electric lime #CFFF47 accent." : "Electric blue #246BFD accent."} ${idea}`;
    const promptHash = createHash("sha256").update(prompt).digest("hex").slice(0, 12);
    const imagePath = `${folder}/scene-${index + 1}.png`;
    const previous = clip.creative?.scenes[index]?.bg;
    if (previous && previous.promptHash !== promptHash && !process.argv.includes("--accept-new-images")) {
      throw new Error(`Scene ${index + 1} prompt changed. Generate a new text-free image at ${imagePath}, then rerun with --accept-new-images.`);
    }
    await readFile(path.join(process.cwd(), "public", imagePath));
    return { bg: { prompt, promptHash, imagePath }, evidenceApproved: false };
  }));
  const audioDir = path.join(process.cwd(), "public", "local-assets", "scene-audio");
  await mkdir(audioDir, { recursive: true });
  const musicPath = `local-assets/scene-audio/${story.template}-bed.wav`;
  const sfxPath = `local-assets/scene-audio/${story.template}-sfx.wav`;
  const weights = story.sceneSeconds;
  const sum = weights.reduce((a, b) => a + b, 0);
  const boundaries = weights.slice(0, -1).map((_, index) => weights.slice(0, index + 1).reduce((a, b) => a + b, 0) / sum * durationSeconds);
  const pops = story.template === "mstudio-pricing" ? [boundaries[1] + .3, boundaries[1] + 1.2, boundaries[1] + 2.1] : [boundaries[1] + .3, boundaries[1] + .7, boundaries[1] + 1.1, boundaries[1] + 1.5, boundaries[1] + 1.9];
  await writeFile(path.join(process.cwd(), "public", musicPath), synthBed(durationSeconds + 1, story.brand === "clipflow" ? 0 : 1));
  await writeFile(path.join(process.cwd(), "public", sfxPath), synthSfx(durationSeconds + 1, boundaries, pops));
  const updated: ClipBrief = {
    ...clip, concept: story.concept, hook: story.hook, keyMessage: story.keyMessage, supportingPoint: story.supportingPoint,
    proof: story.proof, cta: story.cta, sceneCopy: story.sceneCopy, postCopy: story.postCopy,
    durationSeconds, voiceover: { ...clip.voiceover, script: story.script, audioPath: normalizedPath, wordTimings, generatedFor },
    creative: { template: story.template, sceneSeconds: story.sceneSeconds, scenes, captionCues: makeCues(story.script, story.cues, wordTimings), musicPath, sfxPath },
    status: "needs_review", progress: 0, outputPath: null, coverPath: null, renderError: null, updatedAt: new Date().toISOString(),
  };
  await updateClip(batchId, clip.id, updated);
  console.log(`${story.template}: ${narrationSeconds.toFixed(2)}s narration / ${durationSeconds}s video`);
}

async function main() {
  const batch = await getBatch(batchId);
  if (!batch) throw new Error(`Batch ${batchId} not found`);
  const clipFilter = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  for (const [id, story] of Object.entries(stories)) {
    if (clipFilter && clipFilter !== id) continue;
    const clip = batch.clips.find((item) => item.id === id);
    if (!clip) throw new Error(`Clip ${id} not found`);
    await prepare(clip, story);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
