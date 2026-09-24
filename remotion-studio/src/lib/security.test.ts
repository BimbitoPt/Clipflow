import { describe, expect, it } from "vitest";
import { isLocalMutation, type HeaderRequest } from "./security";

function request(host: string, origin: string | null): HeaderRequest {
  return { headers: { get: (key) => key === "host" ? host : key === "origin" ? origin : null } };
}

describe("local mutation guard", () => {
  it("accepts matching loopback origins", () => {
    expect(isLocalMutation(request("127.0.0.1:3020", "http://127.0.0.1:3020"))).toBe(true);
  });
  it("rejects missing origins, foreign hosts and mismatches", () => {
    expect(isLocalMutation(request("127.0.0.1:3020", null))).toBe(false);
    expect(isLocalMutation(request("clipflow.test", "https://clipflow.test"))).toBe(false);
    expect(isLocalMutation(request("127.0.0.1:3020", "http://localhost:3020"))).toBe(false);
  });
});
