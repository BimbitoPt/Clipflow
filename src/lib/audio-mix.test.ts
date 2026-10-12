import { describe, expect, it } from "vitest";
import {
  AMBIENT,
  DUCK,
  LOUDNORM,
  MIX_LIMIT,
  MUSIC_BED,
  SFX,
  VOICE,
  ambientChain,
  cueFit,
  limiterChain,
  musicBedChain,
  musicVolumeAt,
  peakGain,
  voiceMixTail,
  voicePlacement,
} from "../../shared/audio-mix";

describe("audio-mix voice shaping", () => {
  it("leaves headroom when voice fits the window", () => {
    const { fitSecs, tempo } = cueFit(3, 5);
    expect(tempo).toBe(1);
    expect(fitSecs).toBe(3);
  });

  it("speeds up only when voice overruns the window", () => {
    const { fitSecs, tempo } = cueFit(6, 5);
    expect(fitSecs).toBeCloseTo(5 - VOICE.windowHeadroomSec);
    expect(tempo).toBeCloseTo(6 / (5 - VOICE.windowHeadroomSec));
  });

  it("never divides by a non-positive window", () => {
    const { fitSecs, tempo } = cueFit(2, 0.2);
    expect(tempo).toBe(1);
    expect(fitSecs).toBeGreaterThanOrEqual(0);
  });

  it("normalizes peaks to the encode target with a gain cap", () => {
    expect(peakGain(0.2)).toBeCloseTo(VOICE.peakTarget / 0.2);
    expect(peakGain(0.89)).toBeCloseTo(1);
    expect(peakGain(0.0001)).toBe(1);
    expect(peakGain(0.1)).toBe(VOICE.maxGain);
  });
});

describe("audio-mix ffmpeg graph", () => {
  it("places voice with rounded ms delay and atempo only when needed", () => {
    expect(voicePlacement(0, 4.25, 1, "a0")).toBe("[0:a]adelay=4250:all=1[a0]");
    expect(voicePlacement(2, 1, 1.2345, "a2")).toBe("[2:a]atempo=1.2345,adelay=1000:all=1[a2]");
  });

  it("mixes without normalization and pads to the timeline", () => {
    expect(voiceMixTail(3, 45)).toBe("[a0][a1][a2]amix=inputs=3:duration=longest:normalize=0[mix];[mix]apad=whole_dur=45[a]");
  });

  it("emits a silent pad when there are no cues", () => {
    expect(voiceMixTail(0, 12)).toContain("anullsrc");
    expect(voiceMixTail(0, 12)).toContain("whole_dur=12");
  });

  it("keeps the octane ambient and bed chains identical to the shipped script", () => {
    expect(ambientChain()).toBe("volume=0.13,highpass=f=90,lowpass=f=900");
    expect(AMBIENT.volume).toBe(0.13);
    expect(musicBedChain(24)).toBe("volume=0.92,afade=t=in:st=0:d=0.04,afade=t=out:st=23.650:d=0.35");
    expect(MUSIC_BED.fadeOutSec).toBe(0.35);
    expect(limiterChain()).toBe("alimiter=limit=0.94");
    expect(MIX_LIMIT).toBe(0.94);
    expect(LOUDNORM).toBe("I=-14:TP=-1.5:LRA=11");
  });
});

describe("audio-mix ducking (pins the Remotion preview numbers)", () => {
  const words = [
    { start: 2, end: 2.4 },
    { start: 5, end: 5.3 },
  ];

  it("ducks the music bed inside voice windows including the lead", () => {
    expect(musicVolumeAt(2.1, words, false)).toBe(DUCK.standard.speaking);
    expect(musicVolumeAt(2 - DUCK.standard.leadSec + 0.01, words, false)).toBe(DUCK.standard.speaking);
    expect(musicVolumeAt(5.3 + DUCK.standard.leadSec - 0.01, words, false)).toBe(DUCK.standard.speaking);
  });

  it("restores the bed outside voice windows and at the far edge", () => {
    expect(musicVolumeAt(3.5, words, false)).toBe(DUCK.standard.idle);
    expect(musicVolumeAt(2 - DUCK.standard.leadSec - 0.01, words, false)).toBe(DUCK.standard.idle);
    expect(musicVolumeAt(5.3 + DUCK.standard.leadSec, words, false)).toBe(DUCK.standard.idle);
  });

  it("uses the creative bed levels for creative clips", () => {
    expect(musicVolumeAt(2.1, words, true)).toBe(DUCK.creative.speaking);
    expect(musicVolumeAt(3.5, words, true)).toBe(DUCK.creative.idle);
  });

  it("pins the shipped soundtrack gains", () => {
    expect(SFX).toEqual({ voiceGain: 1, featured: 0.42, sceneWhoosh: 0.32, stepPop: 0.3 });
    expect(DUCK.standard.speaking).toBe(0.055);
    expect(DUCK.standard.idle).toBe(0.18);
    expect(DUCK.creative.speaking).toBe(0.12);
    expect(DUCK.creative.idle).toBe(0.26);
    expect(DUCK.standard.leadSec).toBe(0.15);
    expect(DUCK.creative.leadSec).toBe(0.15);
  });
});
