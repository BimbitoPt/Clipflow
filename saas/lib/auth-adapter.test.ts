import { mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterAll, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "./db";
import { adapter } from "../auth";

process.env.CLIPFLOW_DB = path.join(mkdtempSync(path.join(os.tmpdir(), "clipflow-auth-")), "test.db");

describe("auth adapter sessions", () => {
  it("roundtrips updateSession and deleteSession", () => {
    const db = getDb();
    db.prepare("INSERT INTO users(id, email) VALUES (?, ?)").run("u1", "s@b.co");
    const expires = new Date(Date.now() + 60_000);
    const created = adapter.createSession({ sessionToken: "tok1", userId: "u1", expires });
    expect(created.sessionToken).toBe("tok1");
    expect(created.userId).toBe("u1");
    expect(created.expires.getTime()).toBeGreaterThanOrEqual(expires.getTime() - 1000);

    const found = adapter.getSessionAndUser("tok1");
    expect(found?.user.email).toBe("s@b.co");
    expect(found?.session.sessionToken).toBe("tok1");

    const newExpires = new Date(Date.now() + 120_000);
    const updated = adapter.updateSession("tok1", { expires: newExpires, sessionToken: "tok2" });
    expect(updated?.sessionToken).toBe("tok2");
    expect(updated?.expires.getTime()).toBeGreaterThanOrEqual(newExpires.getTime() - 1000);
    expect(adapter.getSessionAndUser("tok1")).toBeNull();
    expect(adapter.getSessionAndUser("tok2")?.session.sessionToken).toBe("tok2");

    adapter.deleteSession("tok2");
    expect(adapter.getSessionAndUser("tok2")).toBeNull();
    expect(adapter.updateSession("tok2", { expires: newExpires })).toBeNull();
  });

  afterAll(() => {
    resetDbForTests();
  });
});
