import { createDeck, type Deck } from "./deck";

/** Sample keynote: the Clipflow launch story. Presented live or exported. */
export function clipflowLaunchDeck(): Deck {
  return createDeck({
    title: "Clipflow launch",
    fps: 30,
    holdFrames: 150,
    slides: [
      {
        id: "title",
        eyebrow: "MSTUDIO PRESENTS",
        title: "Idea in, video out.",
        points: ["Clipflow turns one line into a finished short."],
      },
      {
        id: "problem",
        eyebrow: "THE PROBLEM",
        title: "Editing eats the idea.",
        points: [
          "A 30 second short still eats two hours.",
          "Ideas die in the notes app.",
          "Posting daily is the whole game.",
        ],
      },
      {
        id: "how",
        eyebrow: "HOW IT WORKS",
        title: "Type one line. Post the short.",
        points: [
          "Script, voice, captions, b-roll — automatic.",
          "Local-first. No server, no keys.",
          "Unlimited drafts, clean 720p.",
        ],
      },
      {
        id: "watch",
        eyebrow: "WATCH IT WORK",
        title: "Made by the engine itself.",
        points: ["Voice, captions and b-roll — rendered locally."],
        media: { src: "demo/clipflow-demo.mp4" },
        // 41s demo + tail margin so export plays it through.
        holdFrames: 1260,
      },
      {
        id: "proof",
        eyebrow: "PROOF",
        title: "Every announcement is dogfood.",
        points: [
          "Each video is itself made with Clipflow.",
          "Same engine, same loop, on stage.",
        ],
      },
      {
        id: "cta",
        eyebrow: "JOIN US",
        title: "Your next 30 videos are one sentence each.",
        points: ["Join the waitlist."],
      },
    ],
  });
}
