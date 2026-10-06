/** Probe real Chromium for WebCodecs config support. Usage: node scripts/probe-codecs.mjs */
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
// WebCodecs only exists in secure contexts: probe from the app origin,
// not about:blank.
await page.goto("http://localhost:8081/", { waitUntil: "load", timeout: 60000 });
const results = await page.evaluate(async () => {
  const out = {};
  const audioConfigs = {
    "aac-16k-mono-96k": { codec: "mp4a.40.2", sampleRate: 16000, numberOfChannels: 1, bitrate: 96000 },
    "aac-16k-mono-nobitrate": { codec: "mp4a.40.2", sampleRate: 16000, numberOfChannels: 1 },
    "aac-44100-stereo": { codec: "mp4a.40.2", sampleRate: 44100, numberOfChannels: 2, bitrate: 128000 },
    "aac-44100-mono": { codec: "mp4a.40.2", sampleRate: 44100, numberOfChannels: 1 },
    "aac-48000-stereo": { codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 },
    "mpac-legacy": { codec: "mpac", sampleRate: 16000, numberOfChannels: 1, bitrate: 96000 },
  };
  out.audioEncoderDefined = typeof AudioEncoder !== "undefined";
  out.videoEncoderDefined = typeof VideoEncoder !== "undefined";
  out.audio = {};
  if (out.audioEncoderDefined) {
    for (const [name, config] of Object.entries(audioConfigs)) {
      try {
        const r = await AudioEncoder.isConfigSupported(config);
        out.audio[name] = r.supported;
      } catch (e) {
        out.audio[name] = `throw: ${e.message}`;
      }
    }
  }
  out.video = {};
  if (out.videoEncoderDefined) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec: "avc1.42001f", width: 720, height: 1280, bitrate: 5000000, framerate: 30 });
      out.video["avc-720x1280"] = r.supported;
    } catch (e) {
      out.video["avc-720x1280"] = `throw: ${e.message}`;
    }
  }
  out.ua = navigator.userAgent;
  return out;
});
console.log(JSON.stringify(results, null, 2));
await browser.close();
