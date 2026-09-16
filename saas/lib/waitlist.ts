import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";

export type JoinResult = { ok: true } | { ok: false; reason: "duplicate" | "invalid" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SCHEMA = readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");

export function freshTestDb() {
  const db = new Database(":memory:");
  db.exec(SCHEMA);
  return db;
}

function runInsert(db: Database.Database, email: string): JoinResult {
  try {
    db.prepare("INSERT INTO waitlist(email) VALUES (?)").run(email);
    return { ok: true };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "SQLITE_CONSTRAINT_PRIMARYKEY" || code === "SQLITE_CONSTRAINT") {
      return { ok: false, reason: "duplicate" };
    }
    throw e;
  }
}

export function joinWaitlist(db: Database.Database, email: string): JoinResult {
  if (!EMAIL_RE.test(email)) return { ok: false, reason: "invalid" };
  return runInsert(db, email);
}

export function isWaitlisted(db: Database.Database, email: string): boolean {
  const row = db.prepare("SELECT 1 FROM waitlist WHERE email = ?").get(email);
  return row !== undefined;
}
