import { beforeEach, describe, expect, it, vi } from "vitest";
import { freshTestDb } from "../../../lib/waitlist";

vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { email: "jobs@test.co" } })) }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
import { getDb } from "@/lib/db";
import { POST } from "./route";

describe("job admission", () => {
  let db: ReturnType<typeof freshTestDb>;
  beforeEach(() => { db = freshTestDb(); vi.mocked(getDb).mockReturnValue(db); });
  const request = (body: unknown) => new Request("http://localhost/api/jobs", {
    method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  });
  it("rejects null JSON and unsupported paid voices without consuming quota", async () => {
    expect((await POST(request(null))).status).toBe(400);
    expect((await POST(request({ idea: "A product demo", voice: "eleven:abcdefgh" }))).status).toBe(400);
    expect(db.prepare("SELECT COUNT(*) AS n FROM renders").get()).toEqual({ n: 0 });
  });
  it("enqueues exactly the free quota and accounts for each accepted job", async () => {
    for (let i = 0; i < 5; i++) expect((await POST(request({ idea: "A product demo" }))).status).toBe(200);
    expect((await POST(request({ idea: "A product demo" }))).status).toBe(402);
    expect(db.prepare("SELECT COUNT(*) AS n FROM jobs").get()).toEqual({ n: 5 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM renders").get()).toEqual({ n: 5 });
  });
  it("rolls back enqueue if quota accounting fails", async () => {
    db.exec("CREATE TRIGGER reject_render BEFORE INSERT ON renders BEGIN SELECT RAISE(ABORT, 'write failed'); END");
    await expect(POST(request({ idea: "A product demo" }))).rejects.toThrow("write failed");
    expect(db.prepare("SELECT COUNT(*) AS n FROM jobs").get()).toEqual({ n: 0 });
  });
});
