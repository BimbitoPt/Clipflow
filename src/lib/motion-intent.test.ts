import { describe, expect, it } from "vitest";
import { selectMotionDirection } from "../../shared/motion-direction";
import { planFrames } from "./planner";
import type { VideoScript } from "./script";

describe("content-directed motion", () => {
  it("lets car footage carry the motion across all beats", () => {
    const fullText = "One Porsche GT3 RS. Same car, every angle.";
    expect(selectMotionDirection({ copy: "ONE GT3 RS", fullText, role: "hook" }).intent).toBe("kinetic-type");
    expect(selectMotionDirection({ copy: "First, turn into the night drive", fullText, role: "beat" }).intent).toBe("none");
    expect(selectMotionDirection({ copy: "The aero. That silhouette.", fullText, role: "beat" }).intent).toBe("focus");
  });
  it("requires meaningful states and steps instead of arbitrary keyword cards", () => {
    expect(selectMotionDirection({ copy: "Make something from your ideas" }).intent).toBe("kinetic-type");
    expect(selectMotionDirection({ copy: "From scattered notes to a finished script." })).toMatchObject({ intent: "transform", labels: ["scattered notes", "CHANGE", "a finished script"] });
    expect(selectMotionDirection({ copy: "First write the brief; then pick footage; finally export" })).toMatchObject({ intent: "sequence", labels: ["write the brief", "pick footage", "export"] });
    expect(selectMotionDirection({ copy: "Manual editing versus reusable scenes" })).toMatchObject({ intent: "comparison", labels: ["Manual editing", "reusable scenes"] });
  });
  it("highlights only a supplied value and keeps unapproved media out of evidence motion", () => {
    expect(selectMotionDirection({ copy: "The export takes 20 seconds." })).toMatchObject({ intent: "metric", labels: ["20 seconds"] });
    expect(selectMotionDirection({ copy: "A useful result", approvedProof: false }).intent).not.toBe("evidence-reveal");
    expect(selectMotionDirection({ copy: "A useful result", approvedProof: true }).intent).toBe("evidence-reveal");
  });
  it("uses selected media in the immutable frame plan, deterministically", () => {
    const script = { cues: [{ kind: "hook", text: "Something worth watching", start: 0, end: 9 }, { kind: "beat", text: "First make it move", start: 9, end: 45 }] } as VideoScript;
    const media = [{ kind: "video" as const, keywords: [] }, { kind: "video" as const, keywords: [] }];
    const frames = planFrames(script, 30, null, [], media);
    expect(frames[300].motionIntent).toBe("none");
    expect(frames).toEqual(planFrames(script, 30, null, [], media));
  });
});
