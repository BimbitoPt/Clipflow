import { createClient, type Client } from "@libsql/client";
import path from "node:path";
import fs from "node:fs";

let db: Client | null = null;
let ready: Promise<Client> | null = null;

// Uses Turso (libsql://...) in production; a local file for dev.
function getDb(): Promise<Client> {
  if (ready) return ready;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  let client: Client;
  if (url && authToken) {
    client = createClient({ url, authToken });
  } else {
    const dataDir = path.join(process.cwd(), "data");
    fs.mkdirSync(dataDir, { recursive: true });
    client = createClient({ url: `file:${path.join(dataDir, "waitlist.db")}` });
  }

  ready = client
    .execute(
      `
    CREATE TABLE IF NOT EXISTS waitlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      source TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      token TEXT NOT NULL UNIQUE
    );
  `
    )
    .then(() => client);
  db = client;

  return ready;
}

export async function addSignup(
  email: string,
  source: string | null
): Promise<{ duplicate?: boolean; token?: string }> {
  const d = await getDb();
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(9))).toString(
    "hex"
  );
  try {
    await d.execute({
      sql: "INSERT INTO waitlist (email, source, token) VALUES (?, ?, ?)",
      args: [email, source, token],
    });
    return { token };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) {
      const rs = await d.execute({
        sql: "SELECT token FROM waitlist WHERE email = ?",
        args: [email],
      });
      const row = rs.rows[0];
      return { duplicate: true, token: row?.token as string | undefined };
    }
    throw e;
  }
}

export async function getCount(): Promise<number> {
  const d = await getDb();
  const rs = await d.execute("SELECT COUNT(*) AS c FROM waitlist");
  return Number(rs.rows[0]?.c ?? 0);
}
