import type { BrandKit } from "./domain";

const timestamp = "2026-09-24T00:00:00.000Z";

export const starterBrands: BrandKit[] = [
  {
    schemaVersion: 1,
    id: "clipflow",
    name: "Clipflow",
    palette: { background: "#080A0D", foreground: "#F7F8FA", accent: "#CFFF47", accentAlt: "#CFFF47" },
    fonts: { heading: "System UI", body: "System UI" },
    logoPath: "brand/mark.png",
    audioPath: null,
    toneNotes: "Direct and confident. No fluff. Captions use short chunks of up to three words. Use lime green on black for motion, captions, calls to action and wins.",
    defaultCta: "Make your next video with Clipflow.",
    captionStyle: { wordsPerChunk: 3, highlightColor: "#CFFF47", safeAreaPercent: 10 },
    approvedAssets: [],
    updatedAt: timestamp,
  },
  {
    schemaVersion: 1,
    id: "mstudio",
    name: "MStudio Web",
    palette: { background: "#080A0D", foreground: "#F7F8FA", accent: "#246BFD", accentAlt: "#246BFD" },
    fonts: { heading: "System UI", body: "System UI" },
    logoPath: null,
    audioPath: null,
    toneNotes: "Use electric blue consistently. Position custom brand and web systems around clear outcomes, fixed scope and fast delivery. Use only claims from approved brand material. Starter hooks are in src/packs/mstudio.json.",
    defaultCta: "Start at mstudioweb.pt.",
    captionStyle: { wordsPerChunk: 3, highlightColor: "#246BFD", safeAreaPercent: 10 },
    approvedAssets: [],
    updatedAt: timestamp,
  },
];
