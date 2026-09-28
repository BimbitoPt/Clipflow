import React from "react";
import { describe, expect, it } from "vitest";
import { Audio } from "remotion";
import { defaultCompositionProps } from "../default-props";
import { Explainer } from "../compositions/Explainer";
import { WithSoundtrack } from "./WithSoundtrack";

describe("composition soundtrack", () => {
  it("embeds only the brand-approved local track at the shared low level", () => {
    const tree = WithSoundtrack({ ...defaultCompositionProps, brand: { ...defaultCompositionProps.brand, audioPath: "local-assets/clipflow/approved.mp3" }, Component: Explainer });
    const children = React.Children.toArray((tree.props as { children: React.ReactNode }).children);
    expect(children).toHaveLength(2);
    expect((children[0] as React.ReactElement).type).toBe(Audio);
    expect((children[0] as React.ReactElement).props).toMatchObject({ src: "/local-assets/clipflow/approved.mp3", loop: true });
    expect((children[0] as React.ReactElement).props.volume(0)).toBe(0.18);
    expect((children[1] as React.ReactElement).type).toBe(Explainer);
  });

  it("adds the generated voice track and lowers approved music during narration", () => {
    const tree = WithSoundtrack({ ...defaultCompositionProps, clip: { ...defaultCompositionProps.clip, voiceover: { script: "hello", voiceId: "af_heart", audioPath: "local-assets/voiceovers/test.wav", generatedFor: "abc", wordTimings: [{ word: "hello", start: 0, end: 1 }] } }, brand: { ...defaultCompositionProps.brand, audioPath: "local-assets/clipflow/approved.mp3" }, Component: Explainer });
    const children = React.Children.toArray((tree.props as { children: React.ReactNode }).children);
    expect(children).toHaveLength(3);
    expect((children[1] as React.ReactElement).props.src).toBe("/local-assets/voiceovers/test.wav");
    expect((children[0] as React.ReactElement).props.volume(0)).toBeLessThan(0.18);
    expect((children[0] as React.ReactElement).props.volume(45)).toBe(0.18);
  });

  it("keeps compositions without an approved brand track unchanged", () => {
    const tree = WithSoundtrack({ ...defaultCompositionProps, Component: Explainer });
    const children = React.Children.toArray((tree.props as { children: React.ReactNode }).children);
    expect(children).toHaveLength(1);
    expect((children[0] as React.ReactElement).type).toBe(Explainer);
  });

  it("layers a featured clip's score, sound cues and voice while ducking the score", () => {
    const creative = { template: "clipflow-spine" as const, sceneSeconds: [2, 2], scenes: [], captionCues: [], musicPath: "local-assets/scene-audio/bed.wav", sfxPath: "local-assets/scene-audio/sfx.wav" };
    const clip = { ...defaultCompositionProps.clip, creative, voiceover: { ...defaultCompositionProps.clip.voiceover, audioPath: "local-assets/voiceovers/voice.wav", wordTimings: [{ word: "hello", start: 0, end: 1 }] } };
    const tree = WithSoundtrack({ ...defaultCompositionProps, clip, Component: Explainer });
    const children = React.Children.toArray((tree.props as { children: React.ReactNode }).children) as React.ReactElement[];
    expect(children.map((item) => item.props.src)).toEqual(["/local-assets/scene-audio/bed.wav", "/local-assets/scene-audio/sfx.wav", "/local-assets/voiceovers/voice.wav", undefined]);
    expect(children[0].props.volume(0)).toBeLessThan(children[0].props.volume(45));
  });
});
