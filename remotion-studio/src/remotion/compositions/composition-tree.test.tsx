import React from "react";
import { describe, expect, it } from "vitest";
import { TransitionSeries } from "@remotion/transitions";
import { Explainer } from "./Explainer";
import { ProductDemo } from "./ProductDemo";
import { ProofStory } from "./ProofStory";
import { defaultCompositionProps } from "../default-props";

describe("registered motion family trees", () => {
  it.each([Explainer, ProductDemo, ProofStory])("uses direct TransitionSeries primitives", (Component) => {
    const tree = Component(defaultCompositionProps);
    const children = React.Children.toArray((tree.props as { children: React.ReactNode }).children);
    expect(tree.type).toBe(TransitionSeries);
    expect(children[0]?.type).toBe(TransitionSeries.Sequence);
    expect(children[1]?.type).toBe(TransitionSeries.Transition);
    expect(children).toHaveLength(7);
  });
});
