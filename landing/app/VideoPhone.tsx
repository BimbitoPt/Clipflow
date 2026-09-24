"use client";

import { useEffect, useRef, useState } from "react";

export default function VideoPhone() {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const v = ref.current;
    if (v) v.muted = true; // autoplay requires muted start
  }, []);

  function toggle() {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) v.volume = 1;
    setMuted(!muted);
  }

  return (
    <div className="phone">
      <video
        ref={ref}
        src="/brand/hero.mp4"
        autoPlay
        muted={muted}
        loop
        playsInline
        preload="auto"
        aria-label="A finished Clipflow short rendered by the engine"
      />
      <button
        type="button"
        className="sound-toggle"
        onClick={toggle}
        aria-pressed={!muted}
        aria-label={muted ? "Turn sound on" : "Turn sound off"}
      >
        {muted ? "Sound off" : "Sound on"}
      </button>
    </div>
  );
}
