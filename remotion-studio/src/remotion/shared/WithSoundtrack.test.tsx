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
});
