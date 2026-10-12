import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { appendClips, getBatch, updateClip, type CreateBrief } from "../src/lib/batch-store";
import { alignCaptionPhrases } from "../src/lib/caption-cues";
import type { ClipBrief } from "../src/lib/domain";
import { generateVoiceover, voiceoverDigest } from "../src/lib/voiceover";
import { normalizeVoiceover } from "../src/lib/voiceover-production";

const batchId = "batch-3329024d-d228-4a1a-b2dc-5b3110fca943";
const kinstaUrl = "https://kinsta.com/blog/ai-discovery-trust/";

const stories = [
  {
    brandId: "clipflow",
    concept: "Clipflow first TikTok: one idea, four beats",
    format: "explainer" as const,
    hook: "Your idea deserves more than a static template.",
    keyMessage: "Clipflow turns one idea into a moving short-form story with timed captions and a vertical export.",
    supportingPoint: "Shape the scenes, preview the frame, then export.",
    proof: "The Clipflow editor supports editable scenes, animated graphics, timed captions and vertical MP4 export.",
    cta: "Comment the idea you want to turn into a video.",
    postCopy: "One idea in. A video with momentum out. Clipflow turns a thought into a hook, build, proof and payoff—with motion, timed captions and a vertical preview you can shape before export. This is our first TikTok. What should we make next? #Clipflow #VideoCreation #TikTokTips #CreatorTools",
    script: "Your idea deserves more than a static template. Clipflow turns one thought into a four-beat story: hook, build, proof, payoff. Give each beat its own motion, add timed captions, preview the frame, then export vertical. One idea in. A video with momentum out. What should we make first?",
    phrases: [
      { text: "Your idea deserves more than a static template.", emphasis: ["static template"] },
      { text: "Clipflow turns one thought into a four-beat story:", emphasis: ["four-beat story"] },
      { text: "hook, build, proof, payoff.", emphasis: ["proof", "payoff"] },
      { text: "Give each beat its own motion,", emphasis: ["motion"] },
      { text: "add timed captions, preview the frame,", emphasis: ["preview"] },
      { text: "then export vertical.", emphasis: ["export"] },
      { text: "One idea in. A video with momentum out.", emphasis: ["momentum"] },
      { text: "What should we make first?", emphasis: ["first"] },
    ],
    sceneCopy: [
      "ONE IDEA. MORE THAN A TEMPLATE.",
      "HOOK → BUILD → PROOF → PAYOFF.",
      "TIMED CAPTIONS. REAL MOTION.",
      "YOUR FIRST VIDEO STARTS HERE.",
    ],
    sceneSeconds: [4, 5, 6, 5],
    imageFolder: "clipflow-spine",
    visual: { kind: "steps" as const, items: ["HOOK", "BUILD", "PROOF", "PAYOFF"] },
    motionIntents: ["transform", "sequence", "comparison", "payoff"] as const,
    motionStyle: "snap" as const,
    tempo: 1.04,
    source: undefined,
  },
  {
    brandId: "mstudio",
    concept: "AI shortlist, website trust test: 44.7% still check",
    format: "proof" as const,
    hook: "AI made the shortlist. Your website still has to win.",
    keyMessage: "A September 2026 Kinsta survey found many consumers still check the company website after an AI recommendation.",
    supportingPoint: "Make the offer, real work and next step easy to find.",
    proof: "Kinsta and Propeller Insights surveyed 1,008 U.S. consumers: 44.7% always or most of the time visit a company's website after an AI recommendation; 61.1% associate website quality with product or service quality.",
    cta: "Make the click count. Start at mstudioweb.pt.",
    postCopy: "AI can put your business on the shortlist. The website still has to earn trust. In a September 2026 survey of 1,008 U.S. consumers by Kinsta and Propeller Insights, 44.7% said they always or most of the time visit a company website after an AI recommendation, while 61.1% connect website quality with product or service quality. Make your offer, real work and next step clear. Source: Kinsta, https://kinsta.com/blog/ai-discovery-trust/ #MStudioWeb #WebDesign #AISearch #SmallBusiness",
    script: "AI just recommended three businesses. What makes someone pick yours? A September Kinsta survey of 1,008 U.S. consumers found 44.7% usually check a company's website after an AI recommendation. And 61.1% say website quality shapes how they rate its product or service. Make your offer, real work, and next step obvious. MStudio Web. Make the click count.",
    phrases: [
      { text: "AI just recommended three businesses.", emphasis: ["three businesses"] },
      { text: "What makes someone pick yours?", emphasis: ["yours"] },
      { text: "A September Kinsta survey", emphasis: ["Kinsta"] },
      { text: "of 1,008 U.S. consumers found", emphasis: ["1,008"] },
      { text: "44.7% usually check a company's website", emphasis: ["44.7%"] },
      { text: "after an AI recommendation.", emphasis: ["AI recommendation"] },
      { text: "And 61.1% say website quality", emphasis: ["61.1%", "website quality"] },
      { text: "shapes how they rate its product", emphasis: ["rate"] },
      { text: "or service.", emphasis: ["service"] },
      { text: "Make your offer, real work,", emphasis: ["offer"] },
      { text: "and next step obvious.", emphasis: ["next step"] },
      { text: "MStudio Web. Make the click count.", emphasis: ["click count"] },
    ],
    sceneCopy: [
      "AI MAKES THE SHORTLIST.",
      "44.7% STILL CHECK THE SITE.",
      "61.1% LINK SITE TO QUALITY.",
      "MAKE THE CLICK COUNT.",
    ],
    sceneSeconds: [4, 6, 6, 5],
    imageFolder: "mstudio-ai-search",
    visual: { kind: "cards" as const, items: ["44.7% CHECK THE SITE", "61.1% LINK SITE TO QUALITY"] },
    motionIntents: ["transform", "comparison", "sequence", "payoff"] as const,
    motionStyle: "cinematic" as const,
    tempo: 1.06,
    source: { title: "Are websites dead? AI discovery, trust, and website quality", url: kinstaUrl, publishedAt: "2026-09-22" },
  },
] as const;

function brief(story: (typeof stories)[number]): CreateBrief {
  return {
    brandId: story.brandId, concept: story.concept, hook: story.hook, keyMessage: story.keyMessage,
    supportingPoint: story.supportingPoint, proof: story.proof, cta: story.cta,
    format: story.format, durationSeconds: 30, postCopy: story.postCopy,
  };
}

async function prepare(clip: ClipBrief, story: (typeof stories)[number]) {
  if (clip.status === "rendering") throw new Error(`${clip.concept} is already rendering`);
  let voice: Awaited<ReturnType<typeof normalizeVoiceover>>;
  const cached = clip.voiceover.script === story.script && clip.voiceover.generatedFor === voiceoverDigest(clip.voiceover.voiceId, story.script) && clip.voiceover.audioPath?.endsWith("-lufs14.wav") && clip.voiceover.wordTimings.length > 0;
  if (cached && clip.voiceover.audioPath) {
    await readFile(path.join(process.cwd(), "public", clip.voiceover.audioPath));
    voice = { audioPath: clip.voiceover.audioPath, durationSeconds: clip.voiceover.wordTimings.at(-1)!.end, wordTimings: clip.voiceover.wordTimings, generatedFor: clip.voiceover.generatedFor ?? "cached", measuredLufs: -14 };
  } else {
    const generated = await generateVoiceover(story.script, clip.id, process.cwd(), undefined, { voiceId: clip.voiceover.voiceId });
    voice = await normalizeVoiceover(generated, process.cwd(), story.tempo);
  }
  const scenes = await Promise.all(story.sceneCopy.map(async (_copy, index) => {
    const imagePath = `scene-backgrounds/${story.imageFolder}/scene-${index + 1}.png`;
    await readFile(path.join(process.cwd(), "public", imagePath));
    const prompt = `Approved brand-matched editorial still reused for ${story.concept}, scene ${index + 1}.`;
    return {
      bg: { prompt, promptHash: createHash("sha256").update(prompt).digest("hex").slice(0, 12), imagePath },
      visual: index === 2 ? { kind: story.visual.kind, items: [...story.visual.items] } : undefined,
      motionIntent: story.motionIntents[index],
      evidenceApproved: false,
    };
  }));
  const now = new Date().toISOString();
  const updated: ClipBrief = {
    ...clip,
    hook: story.hook, keyMessage: story.keyMessage, supportingPoint: story.supportingPoint, proof: story.proof,
    cta: story.cta, format: story.format, sceneCopy: [...story.sceneCopy], postCopy: story.postCopy,
    durationSeconds: Math.max(10, Math.min(60, Math.ceil(voice.durationSeconds + 0.7))),
    voiceover: { ...clip.voiceover, script: story.script, audioPath: voice.audioPath, wordTimings: voice.wordTimings, generatedFor: voice.generatedFor },
    motionStyle: story.motionStyle,
    creative: {
      template: "cinematic-story", sceneSeconds: [...story.sceneSeconds], scenes,
      captionCues: alignCaptionPhrases(story.script, story.phrases.map((phrase) => ({ text: phrase.text, emphasis: [...phrase.emphasis] })), voice.wordTimings),
      musicPath: story.brandId === "clipflow" ? "scene-audio/clipflow-bed.wav" : "scene-audio/mstudio-bed.wav",
      sfxPath: null,
      ...(story.source ? { source: { ...story.source, verifiedAt: now } } : {}),
    },
    status: "needs_review", progress: 0, outputPath: null, coverPath: null, renderError: null, updatedAt: now,
  };
  await updateClip(clip.batchId, clip.id, updated);
  console.log(`${clip.concept}: ${voice.durationSeconds.toFixed(1)}s narration, ${updated.durationSeconds}s video, ${voice.measuredLufs?.toFixed(1)} LUFS`);
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const current = await getBatch(batchId);
  if (!current) throw new Error(`Production batch ${batchId} is missing`);
  const missing = stories.filter((story) => !current.clips.some((clip) => clip.concept === story.concept && clip.brandId === story.brandId));
  if (current.batch.clipIds.length + missing.length > 20) throw new Error("Production batch has no room for both new videos");
  if (missing.length) await appendClips(batchId, missing.map(brief));
  const updated = await getBatch(batchId);
  if (!updated) throw new Error("Production batch could not be reloaded");
  for (const story of stories) {
    const clip = updated.clips.find((item) => item.concept === story.concept && item.brandId === story.brandId);
    if (!clip) throw new Error(`Missing generated brief for ${story.concept}`);
    if (clip.status === "rendered" && clip.outputPath && !(refresh && story.brandId === "mstudio")) {
      console.log(`Already rendered: ${clip.concept}`);
      continue;
    }
    await prepare(clip, story);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
