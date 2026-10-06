import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { appendClips, getBatch, updateClip, type CreateBrief } from "../src/lib/batch-store";
import { alignCaptionPhrases } from "../src/lib/caption-cues";
import type { ClipBrief } from "../src/lib/domain";
import { generateVoiceover } from "../src/lib/voiceover";
import { normalizeVoiceover } from "../src/lib/voiceover-production";

const batchId = "batch-3329024d-d228-4a1a-b2dc-5b3110fca943";
const sourceUrl = "https://www.axios.com/2026/09/29/openai-dots-ai-assistant-devday";
const concept = "MStudio Web: the website test for OpenAI's new AI agents";
const script = "OpenAI introduced Dots at DevDay, a personal AI agent designed to take on tasks. That points to a bigger shift: AI moving from answers to action. For your business, here's the website test: if an AI sends someone your way, can they understand what you do, see why they should trust you, and take the next step? MStudio Web builds clear sites for that moment. Make the handoff count.";
const phrases = [
  { text: "OpenAI introduced Dots at DevDay,", emphasis: ["Dots", "DevDay"] },
  { text: "a personal AI agent designed to take on tasks.", emphasis: ["take on tasks"] },
  { text: "That points to a bigger shift:", emphasis: ["bigger shift"] },
  { text: "AI moving from answers to action.", emphasis: ["answers", "action"] },
  { text: "For your business, here's the website test:", emphasis: ["website test"] },
  { text: "if an AI sends someone your way,", emphasis: ["sends someone"] },
  { text: "can they understand what you do,", emphasis: ["understand"] },
  { text: "see why they should trust you,", emphasis: ["trust"] },
  { text: "and take the next step?", emphasis: ["next step"] },
  { text: "MStudio Web builds clear sites for that moment.", emphasis: ["clear sites"] },
  { text: "Make the handoff count.", emphasis: ["handoff count"] },
];
const postCopy = "OpenAI introduced Dots at DevDay: a personal AI agent designed to take on tasks. As AI moves from answers toward action, your website still has a job at the handoff: make your service clear, show why people can trust you, and make the next step easy. If an AI sends someone your way, can your site finish the job? MStudio Web builds focused websites for that moment. Source: Axios, https://www.axios.com/2026/09/29/openai-dots-ai-assistant-devday #MStudioWeb #WebDesign #OpenAIDevDay #AIagents #SmallBusiness";

async function main() {
  const current = await getBatch(batchId);
  if (!current) throw new Error("Production batch is missing");
  let clip = current.clips.find((item) => item.concept === concept && item.brandId === "mstudio");
  if (!clip) {
    if (current.batch.clipIds.length >= 20) throw new Error("Production batch has no room for the MStudio DevDay video");
    const brief: CreateBrief = {
      brandId: "mstudio", concept, hook: "AI is moving from answers to action.",
      keyMessage: "OpenAI introduced Dots at DevDay, a personal agent designed to take on tasks.",
      supportingPoint: "A clear website can help people understand the offer, trust the business, and take the next step.",
      proof: "Axios reports OpenAI introduced Dots at its September 29, 2026 DevDay event.",
      cta: "MStudio Web. Make the handoff count.", format: "explainer", durationSeconds: 28, postCopy,
    };
    const added = await appendClips(batchId, [brief]);
    clip = added.clips.at(-1)!;
  }
  if (clip.status === "rendering") throw new Error("MStudio DevDay video is already rendering");
  if (clip.status === "rendered" && clip.outputPath) {
    console.log(`Already rendered: ${clip.outputPath}`);
    return;
  }

  const generated = await generateVoiceover(script, clip.id, process.cwd(), undefined, { voiceId: "af_bella" });
  const voice = await normalizeVoiceover(generated, process.cwd(), 1.04);
  const copy = [
    "AI IS MOVING FROM ANSWERS TO ACTION.",
    "OPENAI INTRODUCES DOTS AT DEVDAY.",
    "WHEN AI SENDS THE CLICK...",
    "MAKE THE HANDOFF COUNT.",
  ];
  const intents = ["transform", "sequence", "comparison", "payoff"] as const;
  const scenes = await Promise.all(copy.map(async (_text, index) => {
    const imagePath = `scene-backgrounds/mstudio-ai-search/scene-${index + 1}.png`;
    await readFile(path.join(process.cwd(), "public", imagePath));
    const prompt = `Approved MStudio Web brand visual for an AI agent website handoff story, scene ${index + 1}.`;
    return {
      bg: { prompt, promptHash: createHash("sha256").update(prompt).digest("hex").slice(0, 12), imagePath },
      ...(index === 2 ? { visual: { kind: "cards" as const, items: ["CLEAR SERVICE", "TRUST PROOF", "NEXT STEP"] } } : {}),
      motionIntent: intents[index], evidenceApproved: false,
    };
  }));
  const now = new Date().toISOString();
  const updated: ClipBrief = {
    ...clip,
    hook: "AI is moving from answers to action.",
    keyMessage: "OpenAI introduced Dots at DevDay, a personal agent designed to take on tasks.",
    supportingPoint: "A clear website can help people understand the offer, trust the business, and take the next step.",
    proof: "Axios reports OpenAI introduced Dots at its September 29, 2026 DevDay event.",
    cta: "MStudio Web. Make the handoff count.",
    format: "explainer", sceneCopy: copy, postCopy,
    durationSeconds: Math.max(10, Math.min(60, Math.ceil(voice.durationSeconds + 0.7))),
    voiceover: { ...clip.voiceover, voiceId: "af_bella", script, audioPath: voice.audioPath, wordTimings: voice.wordTimings, generatedFor: voice.generatedFor },
    motionStyle: "cinematic",
    creative: {
      template: "cinematic-story", sceneSeconds: [4, 4, 7, 7], scenes,
      captionCues: alignCaptionPhrases(script, phrases, voice.wordTimings),
      musicPath: "scene-audio/mstudio-bed.wav", sfxPath: null,
      source: { title: "OpenAI debuts dots, its assistant to take on Muse", url: sourceUrl, publishedAt: "2026-09-29", verifiedAt: now },
    },
    status: "needs_review", progress: 0, outputPath: null, coverPath: null, renderError: null, updatedAt: now,
  };
  await updateClip(clip.batchId, clip.id, updated);
  console.log(`Prepared ${concept}: ${voice.durationSeconds.toFixed(1)}s narration, ${updated.durationSeconds}s video`);
  console.log(`Clip ID: ${clip.id}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
