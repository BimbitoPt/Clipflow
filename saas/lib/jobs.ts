import type { Database } from "better-sqlite3";

export interface Job {
  id: number;
  user_email: string;
  idea: string;
  voice: string;
  status: string;
  out_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export function enqueue(
  db: Database,
  email: string,
  idea: string,
  voice = "auto",
): number {
  const info = db
    .prepare("INSERT INTO jobs(user_email, idea, voice) VALUES (?, ?, ?)")
    .run(email, idea, voice);
  return Number(info.lastInsertRowid);
}

export function claimNextJob(db: Database): Job | null {
  const txn = db.transaction((): Job | null => {
    const row = db
      .prepare(
        "SELECT * FROM jobs WHERE status = 'queued' ORDER BY id ASC LIMIT 1",
      )
      .get() as Job | undefined;
    if (!row) return null;
    const info = db
      .prepare(
        "UPDATE jobs SET status = 'running', updated_at = datetime('now') WHERE id = ? AND status = 'queued'",
      )
      .run(row.id);
    if (info.changes === 0) return null;
    return db.prepare("SELECT * FROM jobs WHERE id = ?").get(row.id) as Job;
  });
  return txn();
}

export function completeJob(db: Database, id: number, outPath: string): void {
  db.prepare(
    "UPDATE jobs SET status = 'done', out_path = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(outPath, id);
}

export function failJob(db: Database, id: number, error: string): void {
  db.prepare(
    "UPDATE jobs SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(error.slice(0, 500), id);
}
