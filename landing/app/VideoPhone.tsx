"use client";

import { useRef, useState } from "react";

export default function VideoPhone() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [soundOn, setSoundOn] = useState(false);

  async function toggleSound() {
    const video = videoRef.current;
    if (!video) return;
    const next = !soundOn;
    setSoundOn(next);
    video.muted = !next;
    if (next) {
      try {
        await video.play();
      } catch {
        // Autoplay policy may still block audible playback; stay muted-safe.
        video.muted = true;
        setSoundOn(false);
      }
    }
  }

  return (
    <div className="phone">
      <video
        ref={videoRef}
        src="/brand/hero.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-label="Clipflow in 24 seconds: idea in, finished short out"
      />
      <button
        type="button"
        className="sound-toggle"
        onClick={toggleSound}
        aria-pressed={soundOn}
        aria-label={soundOn ? "Mute demo sound" : "Play demo with sound"}
      >
        {soundOn ? "Mute" : "Sound on"}
      </button>
    </div>
  );
}
