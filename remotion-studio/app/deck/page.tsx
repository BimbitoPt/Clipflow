"use client";

import DeckPlayer from "../../components/DeckPlayer";
import { clipflowLaunchDeck } from "../../src/remotion/deck/clipflow-launch";

export default function DeckPage() {
  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Clipflow launch deck</h1>
      <p style={{ opacity: 0.7, marginBottom: 16 }}>
        Arrow keys / space step forward and back at presenter pace. Same frames as the MP4 export.
      </p>
      <DeckPlayer deck={clipflowLaunchDeck()} />
    </main>
  );
}
