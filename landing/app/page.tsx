export const dynamic = "force-dynamic";

import SignupForm from "./SignupForm";
import VideoPhone from "./VideoPhone";
import { getCount } from "@/lib/db";
import Image from "next/image";

const FAQ = [
  {
    q: "When does it open?",
    a: "First access goes out in waves, starting with the earliest signups. You will get one email when your spot is ready.",
  },
  {
    q: "What will it cost?",
    a: "Waitlist members get founding pricing locked for life. Everyone else pays the public rate at launch.",
  },
  {
    q: "Do I need to be on camera?",
    a: "No. Clipflow generates the voice and visuals. Bring your face only if you want to.",
  },
  {
    q: "Can I edit what it makes?",
    a: "Yes. Change the script, swap the voice, restyle the captions, then re-render.",
  },
  {
    q: "Who owns the videos?",
    a: "You do. Full commercial use, including client work.",
  },
];

export default async function Home() {
  const count = Math.max(1200, await getCount());

  return (
    <>
      {/* top bar */}
      <header className="topbar">
        <div className="wrap topbar-inner">
          <a href="/" className="brand" aria-label="Clipflow home">
            <Image src="/brand/mark.png" alt="" width={28} height={28} className="brand-mark" priority />
            <span className="brand-word">Clipflow</span>
          </a>
          <nav className="topbar-nav" aria-label="Site">
            <a className="topbar-link" href="/roadmap">
              roadmap
            </a>
            <a className="topbar-link" href="#join">
              join the waitlist
            </a>
          </nav>
        </div>
      </header>

      {/* hero */}
      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="streak streak-1" aria-hidden="true" />
        <div className="streak streak-2" aria-hidden="true" />
        <div className="streak streak-3" aria-hidden="true" />
        <div className="wrap hero-inner">
          <div>
            <h1>
              Idea in,
              <br />
              <span className="accent">video out.</span>
            </h1>
            <p className="subhead">
              Clipflow writes the script, records the voice, cuts the captions
              and renders the b-roll. <strong>You type one line.</strong> You
              get a finished short.
            </p>
            <SignupForm id="hero-email" variant="hero" />
          </div>
          <VideoPhone />
        </div>
      </section>

      {/* problem strip */}
      <section className="problems" aria-label="The problem">
        <div className="wrap problems-grid">
          <p className="problem">Editing a 30 second short still eats two hours.</p>
          <p className="problem">
            Ideas die in your notes app because shipping is the hard part.
          </p>
          <p className="problem">
            Posting daily is the whole game and nobody can keep up alone.
          </p>
        </div>
      </section>

      {/* how it works */}
      <section className="how">
        <div className="wrap">
          <div className="section-label">How it works</div>
          <div className="steps">
            <div className="step">
              <h3>01. Drop the idea.</h3>
              <p>One sentence, a link, or a voice note. That is the entire input.</p>
            </div>
            <div className="step">
              <h3>02. Clipflow builds it.</h3>
              <p>
                Script, voiceover, punch-word captions, b-roll and cuts, on
                brand every time.
              </p>
            </div>
            <div className="step">
              <h3>03. Post it.</h3>
              <p>Download the 9:16 file or push it straight to your queue.</p>
            </div>
          </div>
        </div>
      </section>

      {/* benefits */}
      <section className="benefits">
        <div className="wrap">
          <div className="benefit">
            <h3>From idea to post in under two minutes.</h3>
            <p>
              No timeline, no keyframes, no render queue. You review, you
              publish.
            </p>
          </div>
          <div className="benefit">
            <h3>Captions that hold attention.</h3>
            <p>
              Chunked to three words, punched on the beat, styled to your brand
              colours. The format that keeps people watching past second three.
            </p>
          </div>
          <div className="benefit">
            <h3>A consistent look, every single clip.</h3>
            <p>
              Set your colours, voice and caption style once. Every video after
              that matches without you thinking about it.
            </p>
          </div>
        </div>
      </section>

      {/* who it is for */}
      <section className="who" aria-label="Who it is for">
        <div className="wrap">
          <ul className="chips-row">
            <li className="chip">Solo creators</li>
            <li className="chip">Build-in-public founders</li>
            <li className="chip">Agencies</li>
            <li className="chip">Faceless channels</li>
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="faq" aria-label="Frequently asked questions">
        <div className="wrap">
          <div className="section-label">FAQ</div>
          <div>
            {FAQ.map((item) => (
              <details key={item.q} className="faq-item">
                <summary>{item.q}</summary>
                <p className="answer">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* closing CTA */}
      <section className="closing" id="join">
        <div className="wrap">
          <h2>Your next 30 videos are one sentence each.</h2>
          <div className="closing-form-box">
            <SignupForm id="cta-email" variant="closing" />
          </div>
        </div>
      </section>

      {/* footer */}
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
