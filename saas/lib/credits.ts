import type { Database } from "better-sqlite3";

// Quotas are hardcoded here rather than imported from billing.ts to avoid a
// circular dependency (billing would need tiers/quota lookups too).
const QUOTAS = { free: 5, creator: 60, studio: 200 } as const;

export function quotaFor(tier: "free" | "creator" | "studio"): number {
  return QUOTAS[tier];
}

export function monthKey(now: Date): string {
  return now.toISOString().slice(0, 7);
}

export function recordRender(
  db: Database,
  email: string,
  now: Date = new Date(),
): number {
  const info = db
    .prepare("INSERT INTO renders(user_email, created_at) VALUES (?, ?)")
    .run(email, now.toISOString());
  return Number(info.lastInsertRowid);
}

export function rendersUsedThisMonth(
  db: Database,
  email: string,
  now: Date = new Date(),
): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS n FROM renders WHERE user_email = ? AND SUBSTR(created_at, 1, 7) = ?",
    )
    .get(email, monthKey(now)) as { n: number };
  return row.n;
}

export function canRender(
  db: Database,
  email: string,
  tier: "free" | "creator" | "studio",
  now: Date = new Date(),
): boolean {
  return rendersUsedThisMonth(db, email, now) < quotaFor(tier);
}

export function grantCredits(
  db: Database,
  email: string,
  amount: number,
  reason: string,
  now: Date = new Date(),
): void {
  db.prepare(
    "INSERT INTO credits_ledger(user_email, delta, reason, created_at) VALUES (?, ?, ?, ?)",
  ).run(email, amount, reason, now.toISOString());
}

export function spendCredits(
  db: Database,
  email: string,
  amount: number,
  reason: string,
  now: Date = new Date(),
): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const txn = db.transaction(() => {
    const row = db
      .prepare(
        "SELECT COALESCE(SUM(delta), 0) AS balance FROM credits_ledger WHERE user_email = ?",
      )
      .get(email) as { balance: number };
    if (amount > row.balance) return false;
    db.prepare(
      "INSERT INTO credits_ledger(user_email, delta, reason, created_at) VALUES (?, ?, ?, ?)",
    ).run(email, -amount, reason, now.toISOString());
    return true;
  });
  return txn();
}

export function balanceFor(db: Database, email: string): number {
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(delta), 0) AS balance FROM credits_ledger WHERE user_email = ?",
    )
    .get(email) as { balance: number };
  return row.balance;
}
