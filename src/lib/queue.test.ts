import { describe, expect, it } from "vitest";
import { MSTUDIO_PROFILE } from "./profile";
import type { ClientProfile } from "./client";
import { queueBuilds } from "./queue";

const CLIENT: ClientProfile = { ...MSTUDIO_PROFILE, packId: "mstudio" };

describe("queue", () => {
  it("builds one spec per idea with mirrored profile and packId", () => {
    const specs = queueBuilds(CLIENT, ["idea one", "idea two"]);
    expect(specs.length).toBe(2);
    expect(specs[0]).toEqual({
      client: CLIENT,
      idea: "idea one",
      profile: MSTUDIO_PROFILE,
      packId: "mstudio",
    });
    expect(specs[1]!.idea).toBe("idea two");
    expect(specs[1]!.packId).toBe("mstudio");
  });

  it("skips empty ideas", () => {
    expect(queueBuilds(CLIENT, [])).toEqual([]);
    expect(queueBuilds(CLIENT, ["", "   ", "\n\t "])).toEqual([]);
    const specs = queueBuilds(CLIENT, ["ok", "", "  ", "fine"]);
    expect(specs.map((s) => s.idea)).toEqual(["ok", "fine"]);
  });

  it("is pure with no input mutation", () => {
    const ideas = ["a", "b"];
    const specs = queueBuilds(CLIENT, ideas);
    expect(ideas).toEqual(["a", "b"]);
    expect(specs.length).toBe(2);
    expect(specs[0]!.profile).not.toBe(CLIENT);
    expect(specs[0]!.profile).toEqual(MSTUDIO_PROFILE);
  });
});
