import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

let db: Database.Database | null = null;

export function schemaSql() {
  return readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
}

export function getDb(): Database.Database {
  if (db) return db;
  const file = process.env.CLIPFLOW_DB || path.join(process.cwd(), "data", "clipflow.db");
  const dir = path.dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const instance = new Database(file);
  instance.pragma("journal_mode = WAL");
  instance.exec(schemaSql());
  db = instance;
  return db;
}

export function resetDbForTests() {
  if (db) {
    db.close();
    db = null;
  }
}
