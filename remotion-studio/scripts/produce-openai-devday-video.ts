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
const concept = "OpenAI DevDay: AI is moving from chat to action";
const script = "OpenAI DevDay just made one thing clear: AI is moving from chat to action. OpenAI introduced Dots, a personal agent designed to take on tasks. The real test isn't the demo. It's what it can reliably finish, and when it knows to hand control back. That's the shift worth watching.";
const phrases = [
  { text: "OpenAI DevDay just made one thing clear:", emphasis: ["OpenAI DevDay"] },
  { text: "AI is moving from chat to action.", emphasis: ["chat", "action"] },
  { text: "OpenAI introduced Dots,", emphasis: ["Dots"] },
  { text: "a personal agent designed to take on tasks.", emphasis: ["take on tasks"] },
  { text: "The real test isn't the demo.", emphasis: ["real test"] },
  { text: "It's what it can reliably finish,", emphasis: ["reliably finish"] },
  { text: "and when it knows to hand control back.", emphasis: ["hand control back"] },
  { text: "That's the shift worth watching.", emphasis: ["worth watching"] },
];
const postCopy = "OpenAI DevDay's headline: Dots, a personal AI agent designed to take on tasks. The bigger shift is from AI that answers prompts to agents that can carry work forward. The real test is reliability—and knowing when to hand control back. What would you trust an AI agent to handle first? Source: Axios, https://www.axios.com/2026/09/29/openai-dots-ai-assistant-devday #OpenAIDevDay #AIagents #ArtificialIntelligence #Clipflow";

async function main() {
  const current = await getBatch(batchId);
  if (!current) throw new Error("Production batch is missing");
  let clip = current.clips.find((item) => item.concept === concept && item.brandId === "clipflow");
  if (!clip) {
    if (current.batch.clipIds.length >= 20) throw new Error("Production batch has no room for the DevDay video");
    const brief: CreateBrief = {
      brandId: "clipflow", concept, hook: "AI is moving from chat to action.",
      keyMessage: "At DevDay, OpenAI introduced Dots, a personal agent designed to take on tasks.",
      supportingPoint: "The practical shift is from getting answers to handing an agent work.",
      proof: "Axios reports OpenAI introduced Dots at its September 29, 2026 DevDay event.",
      cta: "Follow for the AI shifts worth watching.", format: "explainer", durationSeconds: 25, postCopy,
    };
    const added = await appendClips(batchId, [brief]);
    clip = added.clips.at(-1)!;
  }
  if (clip.status === "rendering") throw new Error("DevDay video is already rendering");
  if (clip.status === "rendered" && clip.outputPath) {
    console.log(`Already rendered: ${clip.outputPath}`);
    return;
  }

  const generated = await generateVoiceover(script, clip.id, process.cwd(), undefined, { voiceId: clip.voiceover.voiceId });
  const voice = await normalizeVoiceover(generated, process.cwd(), 1.04);
  const copy = [
    "AI IS MOVING FROM CHAT TO ACTION.",
    "MEET DOTS: OPENAI'S PERSONAL AGENT.",
    "CHAT → ANSWERS. AGENT → TASKS.",
    "THE TEST: WHAT CAN IT RELIABLY FINISH?",
  ];
  const intents = ["transform", "sequence", "comparison", "payoff"] as const;
  const scenes = await Promise.all(copy.map(async (_text, index) => {
    const imagePath = `scene-backgrounds/clipflow-spine/scene-${index + 1}.png`;
    await readFile(path.join(process.cwd(), "public", imagePath));
    const prompt = `Approved Clipflow brand visual for OpenAI DevDay AI agent explainer, scene ${index + 1}.`;
    return {
      bg: { prompt, promptHash: createHash("sha256").update(prompt).digest("hex").slice(0, 12), imagePath },
      ...(index === 2 ? { visual: { kind: "cards" as const, items: ["CHAT → ANSWERS", "AGENT → TASKS"] } } : {}),
      motionIntent: intents[index], evidenceApproved: false,
    };
  }));
  const now = new Date().toISOString();
  const updated: ClipBrief = {
    ...clip,
    hook: "AI is moving from chat to action.",
    keyMessage: "At DevDay, OpenAI introduced Dots, a personal agent designed to take on tasks.",
    supportingPoint: "The practical shift is from getting answers to handing an agent work.",
    proof: "Axios reports OpenAI introduced Dots at its September 29, 2026 DevDay event.",
    cta: "Follow for the AI shifts worth watching.",
    format: "explainer", sceneCopy: copy, postCopy,
    durationSeconds: Math.max(10, Math.min(60, Math.ceil(voice.durationSeconds + 0.7))),
    voiceover: { ...clip.voiceover, script, audioPath: voice.audioPath, wordTimings: voice.wordTimings, generatedFor: voice.generatedFor },
    motionStyle: "snap",
    creative: {
      template: "cinematic-story", sceneSeconds: [4, 4, 6, 7], scenes,
      captionCues: alignCaptionPhrases(script, phrases, voice.wordTimings),
      musicPath: "scene-audio/clipflow-bed.wav", sfxPath: null,
      source: { title: "OpenAI debuts dots, its assistant to take on Muse", url: sourceUrl, publishedAt: "2026-09-29", verifiedAt: now },
    },
    status: "needs_review", progress: 0, outputPath: null, coverPath: null, renderError: null, updatedAt: now,
  };
  await updateClip(clip.batchId, clip.id, updated);
  console.log(`Prepared ${concept}: ${voice.durationSeconds.toFixed(1)}s narration, ${updated.durationSeconds}s video`);
  console.log(`Clip ID: ${clip.id}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
