import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { appendClips, getBatch, updateClip, type CreateBrief } from "../src/lib/batch-store";
import { alignCaptionPhrases } from "../src/lib/caption-cues";
import type { ClipBrief } from "../src/lib/domain";
import { generateVoiceover } from "../src/lib/voiceover";
import { normalizeVoiceover } from "../src/lib/voiceover-production";

const batchId = "batch-3329024d-d228-4a1a-b2dc-5b3110fca943";
const stories = [
  {
    brandId: "clipflow", concept: "Shorts Series: make episode one", format: "explainer" as const,
    hook: "Your next Short could be episode one.", keyMessage: "YouTube is rolling out Shorts Series, inviting creators to structure Shorts into episodes.",
    supportingPoint: "One idea can become an episodic story arc.", proof: "YouTube announced the rollout on September 23, 2026.", cta: "Type your idea. Make episode one.",
    postCopy: "YouTube announced Shorts Series on September 23, 2026 and says it is rolling out to creators. A repeatable story arc can start with one idea: hook → problem → shift → proof → payoff. Type your idea; make episode one with Clipflow. Source: https://blog.youtube/news-and-events/made-on-youtube-creators-shorts-series-tv-features/ #Clipflow #YouTubeShorts #CreatorStrategy",
    source: { title: "Connect with creators on the biggest screen with YouTube’s latest features", url: "https://blog.youtube/news-and-events/made-on-youtube-creators-shorts-series-tv-features/", publishedAt: "2026-09-23" },
    script: "YouTube is rolling out Shorts Series. Stop treating every Short like a one-off. Turn one idea into five episodes: hook, problem, shift, proof, payoff. Give viewers a reason to watch what happens next. Type your idea. Make episode one with Clipflow.",
    phrases: [
      { text: "YouTube is rolling out Shorts Series.", emphasis: ["Series"] },
      { text: "Stop treating every Short like a one-off.", emphasis: ["one-off"] },
      { text: "Turn one idea into five episodes:", emphasis: ["five", "episodes"] },
      { text: "hook, problem, shift, proof, payoff.", emphasis: ["hook", "payoff"] },
      { text: "Give viewers a reason to watch what happens next.", emphasis: ["next"] },
      { text: "Type your idea.", emphasis: ["idea"] },
      { text: "Make episode one with Clipflow.", emphasis: ["episode"] },
    ],
    sceneCopy: ["ONE SHORT. NOT THE STORY.", "SHORTS. BECOME SERIES.", "FIVE EPISODES. ONE ARC.", "YOUR IDEA. EPISODE ONE."],
    sceneSeconds: [3, 3, 7, 3],
    visual: { kind: "steps" as const, items: ["HOOK", "PROBLEM", "SHIFT", "PROOF", "PAYOFF"] },
    imageFolder: "clipflow-series", tempo: 1.05,
    imagePrompts: [
      "Vertical 9:16 cinematic editorial still. One solitary blank portrait film frame suspended in a vast deep charcoal studio. A single electric lime #CFFF47 thread of light emerges, tactile material, subtle haze, photorealistic, dark central-left negative space. No text, letters, numbers, logos, watermarks, or UI.",
      "Vertical 9:16 cinematic editorial still. Five blank portrait film frames connected into a flowing chain in a dark charcoal studio, a lime #CFFF47 pulse along the chain, realistic glass and metal, haze, central-left negative space. No text, letters, numbers, logos, watermarks, or UI.",
      "Vertical 9:16 cinematic editorial still. Five blank portrait portals ascending like a staircase through a deep charcoal architectural void, each with an electric lime #CFFF47 glimmer, haze and grain, central-left negative space. No text, letters, numbers, logos, watermarks, or UI.",
      "Vertical 9:16 cinematic editorial still. An empty portrait film frame at a dark horizon opens toward an electric lime #CFFF47 dawn with more subtle receding frames, photorealistic haze and grain, dark central-left negative space. No text, letters, numbers, logos, watermarks, or UI.",
    ],
  },
  {
    brandId: "mstudio", concept: "AI Search: the website basics", format: "proof" as const,
    hook: "AI Search still needs a useful website.", keyMessage: "Google says its AI Search features have no special markup requirement; SEO fundamentals still apply.",
    supportingPoint: "Allow crawling, publish useful text, and connect pages with clear links.", proof: "Google Search Central's AI features and your website guidance.", cta: "Explore MStudio Web's builds. Link in bio.",
    postCopy: "AI Search is changing discovery, but Google says there is no special markup or secret AI file required for its AI features. Start with crawlable pages, useful answers in text, and clear internal links. These practices support eligibility; they do not guarantee placement. Explore MStudio Web's builds — link in bio. Google guidance: https://developers.google.com/search/docs/appearance/ai-features . 2026 site-owner update: https://blog.google/products-and-platforms/products/search/new-controls-website-owners/ #MStudioWeb #WebDesign #AISearch",
    source: { title: "AI features and your website", url: "https://developers.google.com/search/docs/appearance/ai-features", publishedAt: "2025-12-10" },
    script: "AI Search is changing how people find businesses. Google says there's no special markup for it. Start with the basics: allow crawling, answer real questions in text, and connect your pages with clear links. Build a site for the person who lands there. See MStudio Web's builds, link in bio.",
    phrases: [
      { text: "AI Search is changing how people find businesses.", emphasis: ["Search"] },
      { text: "Google says there's no special markup for it.", emphasis: ["markup"] },
      { text: "Start with the basics:", emphasis: ["basics"] },
      { text: "allow crawling,", emphasis: ["crawling"] },
      { text: "answer real questions in text,", emphasis: ["text"] },
      { text: "and connect your pages with clear links.", emphasis: ["links"] },
      { text: "Build a site for the person who lands there.", emphasis: ["person"] },
      { text: "See MStudio Web's builds, link in bio.", emphasis: ["bio"] },
    ],
    sceneCopy: ["AI SEARCH. CHANGES DISCOVERY.", "NO MAGIC. MARKUP.", "THREE BASICS. STILL MATTER.", "BUILT FOR. REAL PEOPLE."],
    sceneSeconds: [3.2, 3, 8, 3.6],
    visual: { kind: "cards" as const, items: ["CRAWLABLE PAGES", "USEFUL TEXT", "CLEAR LINKS"] },
    imageFolder: "mstudio-ai-search", tempo: 1.15,
    imagePrompts: [
      "Vertical 9:16 cinematic editorial still. Electric blue #246BFD light paths branch through a deep charcoal architectural void and converge on a blank glass website plane; photorealistic haze and grain, central-left negative space. No text, letters, numbers, logos, watermarks, or UI.",
      "Vertical 9:16 cinematic editorial still. A false silver key dissolves into dust while a simple electric blue #246BFD doorway remains solid in a deep charcoal studio, photorealistic haze and grain, central-left negative space. No text, letters, numbers, logos, watermarks, or UI.",
      "Vertical 9:16 cinematic editorial still. A website imagined as interconnected blank glass rooms, three electric blue #246BFD luminous paths flow between them, photorealistic dark architecture, central-left negative space. No text, letters, numbers, logos, watermarks, or UI.",
      "Vertical 9:16 cinematic editorial still. A minimalist dark stone and glass storefront at dusk with one open electric blue #246BFD door leading into warm human-scale light, subtle fog and grain, central-left negative space. No text, letters, numbers, logos, watermarks, or UI.",
    ],
  },
] as const;

type Story = (typeof stories)[number];

async function ensureClip(story: Story): Promise<ClipBrief> {
  const existing = await getBatch(batchId);
  if (!existing) throw new Error(`Batch ${batchId} is missing`);
  const found = existing.clips.find((clip) => clip.concept === story.concept && clip.brandId === story.brandId);
  if (found) return found;
  const brief: CreateBrief = { brandId: story.brandId, concept: story.concept, hook: story.hook, keyMessage: story.keyMessage, supportingPoint: story.supportingPoint, proof: story.proof, cta: story.cta, format: story.format, durationSeconds: 25, postCopy: story.postCopy };
  const appended = await appendClips(batchId, [brief]);
  return appended.clips.at(-1)!;
}

async function prepare(story: Story) {
  const clip = await ensureClip(story);
  if (clip.status === "rendering") throw new Error(`${clip.id} is rendering; wait before changing its source`);
  const cached = clip.voiceover.script === story.script && clip.voiceover.audioPath?.endsWith("-lufs14.wav") && clip.voiceover.wordTimings.length > 0;
  let voice: { audioPath: string; durationSeconds: number; wordTimings: ClipBrief["voiceover"]["wordTimings"]; generatedFor: string | null; measuredLufs?: number };
  if (cached && clip.voiceover.audioPath) {
    await readFile(path.join(process.cwd(), "public", clip.voiceover.audioPath));
    voice = { audioPath: clip.voiceover.audioPath, durationSeconds: clip.voiceover.wordTimings.at(-1)!.end, wordTimings: clip.voiceover.wordTimings, generatedFor: clip.voiceover.generatedFor };
  } else {
    const generated = await generateVoiceover(story.script, clip.id, process.cwd(), undefined, { voiceId: clip.voiceover.voiceId });
    voice = await normalizeVoiceover(generated, process.cwd(), story.tempo);
  }
  const scenes = await Promise.all(story.imagePrompts.map(async (prompt, index) => {
    const imagePath = `scene-backgrounds/${story.imageFolder}/scene-${index + 1}.png`;
    await readFile(path.join(process.cwd(), "public", imagePath));
    const promptHash = createHash("sha256").update(prompt).digest("hex").slice(0, 12);
    const previous = clip.creative?.scenes[index]?.bg;
    if (previous && previous.promptHash !== promptHash && !process.argv.includes("--accept-new-images") && clip.creative?.source?.url === story.source.url) {
      throw new Error(`Scene ${index + 1} prompt changed. Replace ${imagePath} and rerun with --accept-new-images.`);
    }
    return {
      evidenceApproved: false,
      bg: { prompt, promptHash, imagePath },
      visual: index === 2 ? { kind: story.visual.kind, items: [...story.visual.items] } : undefined,
      motionGraphic: index === 2 ? undefined : story.brandId === "clipflow" ? "filmstrip" as const : "site-network" as const,
    };
  }));
  const updated: ClipBrief = {
    ...clip, concept: story.concept, hook: story.hook, keyMessage: story.keyMessage, supportingPoint: story.supportingPoint, proof: story.proof,
    cta: story.cta, format: story.format, sceneCopy: [...story.sceneCopy], postCopy: story.postCopy,
    durationSeconds: Math.max(10, Math.ceil(voice.durationSeconds + .6)),
    voiceover: { script: story.script, voiceId: clip.voiceover.voiceId, audioPath: voice.audioPath, wordTimings: voice.wordTimings, generatedFor: voice.generatedFor },
    creative: { template: "cinematic-story", sceneSeconds: [...story.sceneSeconds], scenes, captionCues: alignCaptionPhrases(story.script, story.phrases.map((phrase) => ({ text: phrase.text, emphasis: [...phrase.emphasis] })), voice.wordTimings), musicPath: story.brandId === "clipflow" ? "scene-audio/clipflow-bed.wav" : "scene-audio/mstudio-bed.wav", sfxPath: null, source: { ...story.source, verifiedAt: new Date().toISOString() } },
    status: "needs_review", progress: 0, outputPath: null, coverPath: null, renderError: null, updatedAt: new Date().toISOString(),
  };
  await updateClip(batchId, clip.id, updated);
  console.log(`${clip.id} ${story.brandId}: ${voice.durationSeconds.toFixed(2)}s speech / ${updated.durationSeconds}s video${voice.measuredLufs ? ` / ${voice.measuredLufs.toFixed(1)} LUFS` : ""}`);
}

async function main() {
  const filter = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  for (const story of stories) if (!filter || filter === story.brandId) await prepare(story);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
