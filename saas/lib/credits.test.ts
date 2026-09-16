import { describe, expect, it } from "vitest";
import { freshTestDb } from "./waitlist";
import { canRender, grantCredits, quotaFor, rendersUsedThisMonth, spendCredits, balanceFor, recordRender } from "./credits";

const M1 = new Date("2026-09-05T10:00:00Z");
const M2 = new Date("2026-10-05T10:00:00Z");

describe("credits", () => {
  it("quota follows tier", () => {
    expect(quotaFor("free")).toBe(5);
    expect(quotaFor("creator")).toBe(60);
    expect(quotaFor("studio")).toBe(200);
  });
  it("counts renders within the month and resets across months", () => {
    const db = freshTestDb();
    for (let i = 0; i < 3; i++) recordRender(db, "a@b.co", M1);
    expect(rendersUsedThisMonth(db, "a@b.co", M1)).toBe(3);
    expect(rendersUsedThisMonth(db, "a@b.co", M2)).toBe(0);
  });
  it("gates rendering by tier quota", () => {
    const db = freshTestDb();
    expect(canRender(db, "a@b.co", "free", M1)).toBe(true);
    for (let i = 0; i < 5; i++) recordRender(db, "a@b.co", M1);
    expect(canRender(db, "a@b.co", "free", M1)).toBe(false);
  });
  it("credit balance may not go negative", () => {
    const db = freshTestDb();
    expect(balanceFor(db, "a@b.co")).toBe(0);
    expect(spendCredits(db, "a@b.co", 1, "test", M1)).toBe(false);
    grantCredits(db, "a@b.co", 10, "grant", M1);
    expect(balanceFor(db, "a@b.co")).toBe(10);
    expect(spendCredits(db, "a@b.co", 11, "test", M1)).toBe(false);
    expect(spendCredits(db, "a@b.co", 10, "test", M1)).toBe(true);
    expect(balanceFor(db, "a@b.co")).toBe(0);
  });
});

