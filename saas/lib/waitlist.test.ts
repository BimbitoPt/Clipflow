import { describe, expect, it } from "vitest";
import { freshTestDb, joinWaitlist, isWaitlisted } from "./waitlist";

describe("waitlist", () => {
  it("accepts a valid email once, rejects duplicates and garbage", () => {
    const db = freshTestDb();
    expect(joinWaitlist(db, "a@b.co")).toEqual({ ok: true });
    expect(joinWaitlist(db, "a@b.co")).toEqual({ ok: false, reason: "duplicate" });
    expect(joinWaitlist(db, "not-an-email")).toEqual({ ok: false, reason: "invalid" });
    expect(isWaitlisted(db, "a@b.co")).toBe(true);
  });
});
