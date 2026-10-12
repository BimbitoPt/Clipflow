import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Clipflow roadmap — what ships, and when",
  description:
    "Clipflow's public roadmap by quarter. We'd rather overdeliver: quarters are intentions, and a phase ships when its exit criteria pass.",
};

type Status = "shipped" | "now" | "planned" | "exploring";

const STATUS_LABEL: Record<Status, string> = {
  shipped: "Shipped",
  now: "In progress",
  planned: "Planned",
  exploring: "Exploring",
};

interface Quarter {
  id: string;
  range: string;
  title: string;
  status: Status;
  intro: string;
  items: string[];
}

const QUARTERS: Quarter[] = [
  {
    id: "shipped",
    range: "Live today",
    title: "The studio works",
    status: "shipped",
    intro: "Free, local-first, no watermarks. Already in your hands.",
    items: [
      "Idea-to-video studio: script, voice, captions, b-roll, 9:16 export",
      "Word-level captions with safe-zone placement and hook cards",
      "Desktop app with native projects and local rendering",
      "Week queue for the daily-posting cadence",
    ],
  },
  {
    id: "q4-2026",
    range: "Q4 2026",
    title: "Trust the file",
    status: "now",
    intro: "No new things to learn — every export provably matches the preview.",
    items: [
      "Full export verification across browser and desktop",
      "Preview-to-export fidelity audit, discrepancies fixed",
      "Stability hardening across the render pipeline",
    ],
  },
  {
    id: "q1-2027",
    range: "Q1 2027",
    title: "Look pro",
    status: "planned",
    intro: "Captions that match what top creators post. No new surfaces.",
    items: [
      "Caption style presets for different content energies",
      "Transcript proofing before burn-in, so typos never ship",
      "Safe-zone overlay in preview, verifiable by eye",
    ],
  },
  {
    id: "q2-2027",
    range: "Q2 2027",
    title: "Go further",
    status: "planned",
    intro: "For heavier users, without complicating the core loop.",
    items: [
      "A path from the weekly queue into batch production",
      "Higher-resolution export as a paid convenience",
      "Optional cloud voices next to the local default",
    ],
  },
  {
    id: "h2-2027",
    range: "H2 2027",
    title: "Grow the loop",
    status: "exploring",
    intro: "Distribution built where accounts exist — never as paywalls.",
    items: [
      "Template and style sharing between creators",
      "Referral credit for bringing your collaborators",
      "Managed production for teams that want it done for them",
    ],
  },
];

const NEVER = [
  "No watermarks on your work",
  "No credit meters on creating",
  "No expiring projects",
  "No auto-posting without you",
];

export default function Roadmap() {
  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <a href="/" className="brand" aria-label="Clipflow home">
            <Image src="/brand/mark.png" alt="" width={28} height={28} className="brand-mark" priority />
            <span className="brand-word">Clipflow</span>
          </a>
          <a className="topbar-link" href="/#join">
            join the waitlist
          </a>
        </div>
      </header>

      <main className="wrap roadmap">
        <div className="section-label">Roadmap</div>
        <h1>
          We&apos;d rather <span className="accent">overdeliver.</span>
        </h1>
        <p className="roadmap-lede">
          Quarters below are intentions, not promises. A phase ships when its
          exit criteria pass — and we only start the next one when the current
          one is done, verified, and merged.
        </p>

        <ol className="roadmap-list">
          {QUARTERS.map((quarter) => (
            <li key={quarter.id} className={`roadmap-card roadmap-${quarter.status}`}>
              <div className="roadmap-head">
                <span className="roadmap-range">{quarter.range}</span>
                <span className={`roadmap-pill roadmap-pill-${quarter.status}`}>
                  {STATUS_LABEL[quarter.status]}
                </span>
              </div>
              <h2>{quarter.title}</h2>
              <p>{quarter.intro}</p>
              <ul>
                {quarter.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        <section className="roadmap-never" aria-label="What we will not build">
          <div className="section-label">Never on the table</div>
          <ul className="chips-row">
            {NEVER.map((item) => (
              <li key={item} className="chip">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="closing">
          <h2>Want it first when the next phase lands?</h2>
          <div className="closing-form-box">
            <a className="topbar-link" href="/#join">
              join the waitlist
            </a>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap footer-inner">
          <a href="/" className="brand">
            <Image src="/brand/mark.png" alt="" width={22} height={22} className="brand-mark" />
            <span className="brand-word">Clipflow</span>
          </a>
          <nav className="footer-links" aria-label="Site links">
            <a href="/roadmap">Roadmap</a>
            <a href="https://www.tiktok.com/@clipflowapp" rel="noopener noreferrer" target="_blank">
              TikTok
            </a>
          </nav>
          <span>© {new Date().getFullYear()} Clipflow. All rights reserved.</span>
        </div>
      </footer>
    </>
  );
}
