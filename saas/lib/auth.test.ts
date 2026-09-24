import { describe, expect, it } from "vitest";
import { sessionUserId } from "../auth";
import { freshTestDb } from "./waitlist";

describe("auth session", () => {
  it("attaches the database user id to the session", () => {
    const session = { user: { email: "a@b.co", id: undefined } };
    expect(session.user.id).toBeUndefined();
    const db = freshTestDb();
    const id = sessionUserId(session, db);
    expect(id).toBeTruthy();
    expect(sessionUserId(session, db)).toBe(id);
    expect(session.user!.id).toBe(id);
  });
});
