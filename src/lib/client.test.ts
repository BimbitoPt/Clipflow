import { describe, expect, it } from "vitest";
import { MSTUDIO_PROFILE } from "./profile";
import { parseClient, parseClientOrThrow, stringifyClient, type ClientProfile } from "./client";

const CLIENT: ClientProfile = { ...MSTUDIO_PROFILE, packId: "mstudio" };

describe("client", () => {
  it("round-trips valid client through JSON", () => {
    const raw = stringifyClient(CLIENT);
    expect(parseClient(raw)).toEqual(CLIENT);
    expect(parseClientOrThrow(raw)).toEqual(CLIENT);
  });

  it("accepts parsed objects without JSON string", () => {
    expect(parseClient({ ...CLIENT })).toEqual(CLIENT);
  });

  it("returns null for invalid shapes and empty packId", () => {
    const cases: unknown[] = [
      "{}",
      "[]",
      "\"str\"",
      "123",
      "null",
      "{nope",
      JSON.stringify({ ...MSTUDIO_PROFILE }),
      JSON.stringify({ ...CLIENT, packId: "" }),
      JSON.stringify({ ...CLIENT, packId: "   " }),
      JSON.stringify({ ...CLIENT, packId: 123 }),
      JSON.stringify({ ...CLIENT, niche: "" }),
      null,
      undefined,
      42,
    ];
    for (const raw of cases) {
      expect(parseClient(raw), String(raw)).toBeNull();
    }
  });

  it("throws E_ prefixed errors on invalid input", () => {
    expect(() => parseClientOrThrow("{nope")).toThrow(/E_CLIENT_JSON/);
    expect(() => parseClientOrThrow(JSON.stringify({ ...CLIENT, packId: "" }))).toThrow(/E_CLIENT_INVALID/);
    expect(() => parseClientOrThrow("{}")).toThrow(/E_CLIENT_INVALID/);
  });
});
