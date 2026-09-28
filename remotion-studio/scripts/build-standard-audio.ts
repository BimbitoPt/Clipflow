import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { encodePcmWav } from "../src/lib/voiceover";

const rate = 24000;
const root = path.join(process.cwd(), "public", "scene-audio");

function bed(seed: number) {
  const length = 24;
  const notes = seed === 0 ? [110, 164.81, 220, 329.63] : [98, 146.83, 196, 293.66];
  const audio = new Float32Array(length * rate);
  for (let i = 0; i < audio.length; i++) {
    const t = i / rate;
    const pulse = Math.pow(Math.max(0, Math.sin(2 * Math.PI * (seed === 0 ? 1.25 : 1.5) * t)), 5);
    const pad = notes.reduce((sum, hz, index) => sum + Math.sin(2 * Math.PI * hz * t + Math.sin(t * .24) * .2) * (.13 / (index + 1)), 0);
    const fade = Math.min(1, t / .35, (length - t) / .5);
    audio[i] = (pad + pulse * Math.sin(2 * Math.PI * notes[0] * t) * .05) * Math.max(0, fade);
  }
  return encodePcmWav(audio, rate);
}

function cue(kind: "whoosh" | "pop") {
  const length = kind === "whoosh" ? .5 : .24;
  const audio = new Float32Array(Math.ceil(length * rate));
  let noise = 99173;
  for (let i = 0; i < audio.length; i++) {
    const t = i / rate;
    if (kind === "whoosh") {
      noise ^= noise << 13; noise ^= noise >>> 17; noise ^= noise << 5;
      audio[i] = ((noise >>> 0) / 0xffffffff * 2 - 1) * Math.sin(Math.PI * t / length) * .16;
    } else audio[i] = Math.sin(2 * Math.PI * (420 - t * 900) * t) * Math.exp(-t * 23) * .32;
  }
  return encodePcmWav(audio, rate);
}

async function main() {
  await mkdir(root, { recursive: true });
  await Promise.all([
    writeFile(path.join(root, "clipflow-bed.wav"), bed(0)),
    writeFile(path.join(root, "mstudio-bed.wav"), bed(1)),
    writeFile(path.join(root, "transition-whoosh.wav"), cue("whoosh")),
    writeFile(path.join(root, "step-pop.wav"), cue("pop")),
  ]);
  console.log(`Wrote four reusable audio assets to ${root}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
