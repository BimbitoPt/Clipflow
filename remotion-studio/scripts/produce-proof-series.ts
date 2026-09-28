import { access } from "node:fs/promises";
import { createBatch, listBatches, updateClip, type CreateBrief } from "../src/lib/batch-store";
import { alignCaptionPhrases } from "../src/lib/caption-cues";
import { approveClip } from "../src/lib/clip-state";
import type { ClipBrief } from "../src/lib/domain";
import { enqueueApproved, getAllJobs } from "../src/lib/render-queue";
import { generateVoiceover } from "../src/lib/voiceover";
import { normalizeVoiceover } from "../src/lib/voiceover-production";

const batchName = "Proof on screen · Clipflow + MStudio · 10-episode pilot";
const appUrl = "http://localhost:8081/";
const siteUrl = "https://www.mstudioweb.pt/";
const pricingUrl = `${siteUrl}pricing`;
const screens = {
  context: "clipflow-context", idea: "clipflow-idea", script: "clipflow-script", preview: "clipflow-preview", export: "clipflow-export", caption: "clipflow-caption",
  home: "mstudio-home-hero", pricing: "mstudio-pricing-hero", speed: "mstudio-speed", automation: "mstudio-automation", ownership: "mstudio-ownership", services: "mstudio-services-hero", contact: "mstudio-contact-hero",
} as const;
type Screen = keyof typeof screens;
type Episode = {
  brandId: "clipflow" | "mstudio"; number: number; title: string; hero?: boolean;
  hook: string; keyMessage: string; proof: string; cta: string;
  phrases: { text: string; emphasis?: string[] }[];
  sceneCopy: [string, string, string, string]; shots: [Screen, Screen, Screen, Screen];
};

const episodes: Episode[] = [
  { brandId: "clipflow", number: 1, title: "One idea to a video plan", hero: true, hook: "The blank page ends here.", keyMessage: "A typed idea becomes a structured short-video script in Clipflow.", proof: "Real local Clipflow idea, script and preview screens.", cta: "Follow Clipflow for updates.",
    phrases: [{ text: "You have the idea." }, { text: "The blank page is the hard part.", emphasis: ["blank"] }, { text: "Type it into Clipflow." }, { text: "See a hook, three beats, and a call to action.", emphasis: ["hook", "beats"] }, { text: "Then preview the vertical frame." }, { text: "Follow Clipflow for updates." }],
    sceneCopy: ["ONE IDEA.", "TYPE IT IN.", "A SCRIPT APPEARS.", "SEE THE FRAME."], shots: ["idea", "idea", "script", "preview"] },
  { brandId: "clipflow", number: 2, title: "The five-part spine", hook: "A short needs a spine.", keyMessage: "Clipflow structures an idea into a hook, three beats and CTA.", proof: "Real generated script in Clipflow.", cta: "Follow Clipflow for updates.",
    phrases: [{ text: "A short is more than one good line." }, { text: "Give it a hook." }, { text: "Three beats that move the story." }, { text: "Then one clear next step.", emphasis: ["next"] }, { text: "That's the structure you see in Clipflow." }, { text: "Follow for the next episode." }],
    sceneCopy: ["ONE LINE ISN'T ENOUGH.", "START WITH A HOOK.", "BUILD THREE BEATS.", "LAND THE NEXT STEP."], shots: ["idea", "script", "script", "preview"] },
  { brandId: "clipflow", number: 3, title: "Preview before export", hook: "See the frame first.", keyMessage: "Clipflow shows a vertical preview alongside the generated script.", proof: "Real preview canvas and script panel.", cta: "Follow Clipflow for updates.",
    phrases: [{ text: "A script can sound good in a document." }, { text: "But will it work in a vertical frame?" }, { text: "Clipflow puts the plan beside a preview.", emphasis: ["preview"] }, { text: "Check the message before you export." }, { text: "Follow Clipflow for updates." }],
    sceneCopy: ["WORDS ON A PAGE?", "TRY A VERTICAL FRAME.", "SCRIPT + PREVIEW.", "CHECK BEFORE EXPORT."], shots: ["script", "preview", "script", "export"] },
  { brandId: "clipflow", number: 4, title: "From idea to MP4", hook: "The last step is a file.", keyMessage: "Clipflow exports a vertical MP4 from the local workflow.", proof: "Real Clipflow preview and export control.", cta: "Follow Clipflow for updates.",
    phrases: [{ text: "An idea becomes a script." }, { text: "The script becomes a vertical preview." }, { text: "Then you export an MP4.", emphasis: ["MP4"] }, { text: "One local workflow, from first thought to video file." }, { text: "Follow Clipflow for updates." }],
    sceneCopy: ["START WITH THE IDEA.", "SHAPE THE SCRIPT.", "PREVIEW THE FORMAT.", "EXPORT AN MP4."], shots: ["idea", "script", "preview", "export"] },
  { brandId: "clipflow", number: 5, title: "One video, two feeds", hook: "Make once. Post twice.", keyMessage: "A 9:16 MP4 can be used as a YouTube Short or TikTok post; Clipflow provides TikTok caption copy.", proof: "Real Clipflow export and TikTok caption controls.", cta: "Follow Clipflow for updates.",
    phrases: [{ text: "Your vertical video can work in two feeds." }, { text: "Export the MP4 from Clipflow." }, { text: "Use it for Shorts or TikTok." }, { text: "There is even TikTok caption copy to start from.", emphasis: ["caption"] }, { text: "Follow Clipflow for updates." }],
    sceneCopy: ["ONE VERTICAL VIDEO.", "EXPORT THE MP4.", "SHORTS OR TIKTOK.", "START WITH CAPTION COPY."], shots: ["preview", "export", "preview", "caption"] },
  { brandId: "mstudio", number: 1, title: "A site with a visible price", hero: true, hook: "What if the price was already on the page?", keyMessage: "MStudio Web publishes fixed prices for its two main offers.", proof: "Live MStudio pricing page shows Speed Site €299 and AI Automation Build €449.", cta: "See the pricing page. Link in bio.",
    phrases: [{ text: "Most website pitches hide the number." }, { text: "Ours puts it on the page.", emphasis: ["page"] }, { text: "Speed Site: two ninety-nine." }, { text: "AI Automation Build: four forty-nine." }, { text: "Fixed offers, visible before the call." }, { text: "See the pricing page. Link in bio." }],
    sceneCopy: ["WHERE'S THE PRICE?", "RIGHT ON THE PAGE.", "€299 / €449.", "SEE THE FULL SCOPE."], shots: ["home", "pricing", "speed", "automation"] },
  { brandId: "mstudio", number: 2, title: "The €299 Speed Site", hook: "Your website can start at €299.", keyMessage: "MStudio's Speed Site is listed at €299 one-time with a documented handoff.", proof: "Live Speed Site card on MStudio pricing page.", cta: "See what's included. Link in bio.",
    phrases: [{ text: "Need a site that looks like a real business?" }, { text: "The Speed Site is two ninety-nine, one time.", emphasis: ["two ninety-nine"] }, { text: "The page lists design, mobile speed, contact form and handoff." }, { text: "Read the full scope before you start." }, { text: "Link in bio." }],
    sceneCopy: ["LOOK CREDIBLE ONLINE.", "SPEED SITE · €299.", "DESIGN TO HANDOFF.", "READ THE SCOPE."], shots: ["home", "speed", "ownership", "pricing"] },
  { brandId: "mstudio", number: 3, title: "The €449 automation build", hook: "One repetitive workflow, rebuilt.", keyMessage: "MStudio lists a fixed-price AI Automation Build at €449.", proof: "Live MStudio pricing card describes one workflow, testing and documentation.", cta: "Explore the build. Link in bio.",
    phrases: [{ text: "What task do you repeat every day?" }, { text: "MStudio maps one workflow, builds it, tests it, and documents it." }, { text: "The AI Automation Build is four forty-nine, one time.", emphasis: ["four forty-nine"] }, { text: "Explore the build. Link in bio." }],
    sceneCopy: ["SAME TASK. EVERY DAY?", "MAP ONE WORKFLOW.", "AUTOMATION · €449.", "SEE THE BUILD."], shots: ["services", "automation", "automation", "contact"] },
  { brandId: "mstudio", number: 4, title: "You own the result", hook: "A handoff should actually hand off.", keyMessage: "MStudio's pricing page says code, docs, hosting and content remain with the customer.", proof: "Live ownership section on the MStudio pricing page.", cta: "Read the ownership terms. Link in bio.",
    phrases: [{ text: "A new website should not trap you with its maker." }, { text: "MStudio says the code, documentation, domain and content are yours.", emphasis: ["yours"] }, { text: "The pricing page spells out the handoff." }, { text: "Read the ownership terms. Link in bio." }],
    sceneCopy: ["WHO OWNS THE SITE?", "YOU DO.", "CODE + DOCS + ACCESS.", "READ THE HANDOFF."], shots: ["pricing", "ownership", "ownership", "contact"] },
  { brandId: "mstudio", number: 5, title: "The two-minute brief", hook: "You don't need a polished deck.", keyMessage: "MStudio offers a short project brief as the first step.", proof: "Live contact form and pricing process section on MStudio site.", cta: "Send the brief. Link in bio.",
    phrases: [{ text: "You do not need a perfect project deck." }, { text: "Start with a short brief." }, { text: "Tell MStudio what you're building, and get a written scope and timeline." }, { text: "The form is on the site." }, { text: "Send the brief. Link in bio." }],
    sceneCopy: ["NO POLISHED DECK.", "START WITH A BRIEF.", "SCOPE + TIMELINE.", "SEND IT FROM THE SITE."], shots: ["home", "contact", "pricing", "contact"] },
];

async function main() {
  const existing = (await listBatches()).find(({ batch }) => batch.name === batchName);
  const created = existing ?? await createBatch(batchName, episodes.map((episode): CreateBrief => ({ brandId: episode.brandId, concept: `${episode.brandId.toUpperCase()} / ${episode.number.toString().padStart(2, "0")} / ${episode.title}`, hook: episode.hook, keyMessage: episode.keyMessage, proof: episode.proof, cta: episode.cta, format: "demo", durationSeconds: 16 })));
  console.log(`BATCH ${created.batch.id}`);
  if (process.argv.includes("--render") || process.argv.includes("--render-first") || process.argv.includes("--rerender-first") || process.argv.includes("--rerender-first-mstudio") || process.argv.includes("--rerender-clipflow")) {
    const targets = (await listBatches()).find(({ batch }) => batch.id === created.batch.id)!.clips;
    const activeIds = new Set((await getAllJobs()).filter((job) => job.status === "queued" || job.status === "running").map((job) => job.clipId));
    const selected = process.argv.includes("--rerender-first-mstudio") ? targets.slice(5, 7) : process.argv.includes("--rerender-clipflow") ? targets.slice(1, 5) : process.argv.includes("--render-first") || process.argv.includes("--rerender-first") ? targets.slice(0, 1) : targets;
    for (const clip of selected) {
      if (clip.status === "rendering" && !activeIds.has(clip.id)) await updateClip(created.batch.id, clip.id, approveClip({ ...clip, status: "failed" }));
      else if (clip.status === "needs_review" || clip.status === "failed" || ((process.argv.includes("--rerender-first") || process.argv.includes("--rerender-first-mstudio") || process.argv.includes("--rerender-clipflow")) && clip.status === "rendered")) await updateClip(created.batch.id, clip.id, approveClip(clip));
    }
    const jobs = await enqueueApproved(created.batch.id);
    console.log(`QUEUED ${jobs.length}`);
    return;
  }
  for (const [index, episode] of episodes.entries()) {
    const clip = created.clips[index];
    if (clip.status === "rendered" || clip.status === "rendering") { console.log(`SKIP ${episode.title}: ${clip.status}`); continue; }
    const script = episode.phrases.map(({ text }) => text).join(" ");
    let voice: Pick<ClipBrief["voiceover"], "audioPath" | "wordTimings" | "generatedFor"> & { durationSeconds: number };
    if (clip.voiceover.script === script && clip.voiceover.audioPath && clip.voiceover.wordTimings.length) {
      voice = { ...clip.voiceover, durationSeconds: clip.voiceover.wordTimings.at(-1)!.end };
    } else {
      const generated = await generateVoiceover(script, clip.id, process.cwd(), undefined, { voiceId: clip.voiceover.voiceId });
      voice = await normalizeVoiceover(generated, process.cwd(), 1.12);
    }
    for (const key of episode.shots) await access(`public/proof-screens/${screens[key]}.png`);
    const scenes = episode.shots.map((key, sceneIndex) => ({
      screen: { imagePath: `proof-screens/${screens[key]}.png`, sourceUrl: episode.brandId === "clipflow" ? appUrl : key === "home" || key === "services" || key === "contact" ? `${siteUrl}${key === "home" ? "" : key}` : pricingUrl },
      bg: { prompt: `Existing approved ${episode.brandId} text-free cinematic background ${sceneIndex + 1}.`, promptHash: "000000000000", imagePath: `scene-backgrounds/${episode.brandId === "clipflow" ? "clipflow-spine" : "mstudio-pricing"}/scene-${sceneIndex + 1}.png` },
    }));
    const updated: ClipBrief = { ...clip, concept: `${episode.brandId.toUpperCase()} / ${episode.number.toString().padStart(2, "0")} / ${episode.title}`, hook: episode.hook, keyMessage: episode.keyMessage, proof: episode.proof, cta: episode.cta,
      sceneCopy: [...episode.sceneCopy], durationSeconds: Math.max(10, Math.ceil(voice.durationSeconds + .5)),
      postCopy: `${episode.hook}\n\n${episode.keyMessage}\n\n${episode.cta}\n\n#${episode.brandId === "clipflow" ? "Clipflow #YouTubeShorts #TikTok" : "MStudioWeb #WebDesign #SmallBusiness"}`,
      voiceover: { script, voiceId: clip.voiceover.voiceId, audioPath: voice.audioPath, wordTimings: voice.wordTimings, generatedFor: voice.generatedFor },
      creative: { template: episode.hero ? "proof-hero" : "proof-series", sceneSeconds: episode.hero ? [3.7, 3.2, 3.6, 3.5] : [3, 3.2, 3.5, 3.2], scenes,
        captionCues: alignCaptionPhrases(script, episode.phrases, voice.wordTimings), musicPath: `scene-audio/${episode.brandId === "clipflow" ? "clipflow" : "mstudio"}-bed.wav`, sfxPath: null },
      status: "needs_review", progress: 0, outputPath: null, coverPath: null, renderError: null, updatedAt: new Date().toISOString(),
    };
    await updateClip(created.batch.id, clip.id, updated);
    console.log(`${index + 1}/10 ${episode.title}: ${voice.durationSeconds.toFixed(1)}s voice / ${updated.durationSeconds}s video`);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
