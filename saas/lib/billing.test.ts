import { describe, expect, it } from "vitest";
import { freshTestDb } from "./waitlist";
import { setSubscription, tierFor } from "./billing";

describe("billing tiers", () => {
  it("defaults to free and reflects stored subscriptions", () => {
    const db = freshTestDb();
    expect(tierFor(db, "x@y.co")).toBe("free");
    setSubscription(db, "x@y.co", "creator", "active");
    expect(tierFor(db, "x@y.co")).toBe("creator");
    setSubscription(db, "x@y.co", "studio", "canceled");
    expect(tierFor(db, "x@y.co")).toBe("free"); // inactive subscription = free
    setSubscription(db, "x@y.co", "studio", "active");
    expect(tierFor(db, "x@y.co")).toBe("studio");
  });
});
