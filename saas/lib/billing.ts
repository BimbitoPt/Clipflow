import type { Database } from "better-sqlite3";

export const TIERS = { free: 0, creator: 19, studio: 49 } as const;

export type Tier = keyof typeof TIERS;

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function setSubscription(
  db: Database,
  email: string,
  tier: string,
  status: string,
): void {
  db.prepare(
    `INSERT INTO subscriptions(user_email, tier, status, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_email) DO UPDATE SET
       tier = excluded.tier,
       status = excluded.status,
       updated_at = excluded.updated_at`,
  ).run(email, tier, status);
}

export function tierFor(db: Database, email: string): Tier {
  const row = db
    .prepare("SELECT tier, status FROM subscriptions WHERE user_email = ?")
    .get(email) as { tier: string; status: string } | undefined;
  if (!row || !ACTIVE_STATUSES.has(row.status)) return "free";
  return (row.tier in TIERS ? row.tier : "free") as Tier;
}
