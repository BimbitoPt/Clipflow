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
    expect((children[0] as React.ReactElement).props).toMatchObject({ src: "/local-assets/clipflow/approved.mp3", volume: 0.18, loop: true });
    expect((children[1] as React.ReactElement).type).toBe(Explainer);
  });

  it("keeps compositions without an approved brand track unchanged", () => {
    const tree = WithSoundtrack({ ...defaultCompositionProps, Component: Explainer });
    const children = React.Children.toArray((tree.props as { children: React.ReactNode }).children);
    expect(children).toHaveLength(1);
    expect((children[0] as React.ReactElement).type).toBe(Explainer);
  });
});
