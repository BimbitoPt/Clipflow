import type { Database } from "better-sqlite3";
import type { Session } from "next-auth";
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { getDb } from "./lib/db";

type DatabaseUser = { id?: string };
type EmailUser = { email?: string | null };
type SessionLike = { user?: (DatabaseUser & EmailUser) | null };

export function sessionUserId(
  session: SessionLike,
  db: Database,
): string {
  const email = session.user?.email;
  if (!email) throw new Error("session user email is required");
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as
    | { id: string }
    | undefined;
  if (existing) {
    session.user!.id = existing.id;
    return existing.id;
  }
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO users(id, email) VALUES (?, ?) ON CONFLICT(email) DO NOTHING").run(id, email);
  session.user!.id = id;
  return id;
}

const adapter = {
  createUser(data: { id?: string; email: string; emailVerified?: Date | null; name?: string | null; image?: string | null }) {
    const db = getDb();
    const id = data.id ?? crypto.randomUUID();
    db.prepare(
      "INSERT INTO users(id, email, email_verified, name, image) VALUES (?, ?, ?, ?, ?)",
    ).run(
      id,
      data.email,
      data.emailVerified ? data.emailVerified.toISOString() : null,
      data.name ?? null,
      data.image ?? null,
    );
    const user = getUserById(id, db);
    if (!user) throw new Error("failed to create user");
    return user;
  },
  getUser(id: string) {
    return getUserById(id, getDb());
  },
  getUserByEmail(email: string) {
    return getUserById(
      (getDb().prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: string } | undefined)?.id,
      getDb(),
    );
  },
  getUserByAccount({ provider, providerAccountId }: { provider: string; providerAccountId: string }) {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT u.* FROM users u JOIN accounts a ON a.user_id = u.id WHERE a.provider = ? AND a.provider_account_id = ?",
      )
      .get(provider, providerAccountId) as { id: string } | undefined;
    return getUserById(row?.id, db);
  },
  updateUser(partial: { id: string; email?: string; emailVerified?: Date | null; name?: string | null; image?: string | null }) {
    const db = getDb();
    db.prepare(
      `UPDATE users SET
         email = COALESCE(?, email),
         email_verified = COALESCE(?, email_verified),
         name = COALESCE(?, name),
         image = COALESCE(?, image)
       WHERE id = ?`,
    ).run(
      partial.email ?? null,
      partial.emailVerified ? partial.emailVerified.toISOString() : null,
      partial.name ?? null,
      partial.image ?? null,
      partial.id,
    );
    return getUserById(partial.id, db)!;
  },
  linkAccount(account: {
    userId: string;
    type: string;
    provider: string;
    providerAccountId: string;
    refresh_token?: string | null;
    access_token?: string | null;
    expires_at?: number | null;
    token_type?: string | null;
    scope?: string | null;
    id_token?: string | null;
    session_state?: string | null;
  }): Promise<void> {
    getDb()
      .prepare(
        `INSERT INTO accounts(id, user_id, type, provider, provider_account_id, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        account.userId,
        account.type,
        account.provider,
        account.providerAccountId,
        account.refresh_token ?? null,
        account.access_token ?? null,
        account.expires_at ?? null,
        account.token_type ?? null,
        account.scope ?? null,
        account.id_token ?? null,
        account.session_state ?? null,
      );
    return Promise.resolve();
  },
  createVerificationToken({ identifier, token, expires }: { identifier: string; token: string; expires: Date }) {
    getDb()
      .prepare(
        "INSERT INTO verification_tokens(identifier, token, expires) VALUES (?, ?, ?) ON CONFLICT(identifier, token) DO UPDATE SET expires = excluded.expires",
      )
      .run(identifier, token, expires.toISOString());
    return { identifier, token, expires };
  },
  useVerificationToken({ identifier, token }: { identifier: string; token: string }) {
    const db = getDb();
    const row = db
      .prepare("SELECT identifier, token, expires FROM verification_tokens WHERE identifier = ? AND token = ?")
      .get(identifier, token) as { identifier: string; token: string; expires: string } | undefined;
    if (!row) return null;
    db.prepare("DELETE FROM verification_tokens WHERE identifier = ? AND token = ?").run(identifier, token);
    return { identifier: row.identifier, token: row.token, expires: new Date(row.expires) };
  },
};

function getUserById(id: string | undefined, db: Database) {
  if (!id) return null;
  const row = db
    .prepare("SELECT id, email, email_verified, name, image FROM users WHERE id = ?")
    .get(id) as
    | { id: string; email: string; email_verified: string | null; name: string | null; image: string | null }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.email_verified ? new Date(row.email_verified) : null,
    name: row.name,
    image: row.image,
  };
}

const config = {
  adapter,
  session: { strategy: "database" as const },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY!,
      from: "Clipflow <onboarding@resend.dev>",
      sendVerificationRequest: async ({ identifier, url }: { identifier: string; url: string }) => {
        if (process.env.RESEND_API_KEY) {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Clipflow <onboarding@resend.dev>",
              to: identifier,
              subject: "Sign in to Clipflow",
              html: `<p><a href="${url}">Sign in</a></p>`,
            }),
          });
          if (!res.ok) throw new Error("Resend send failed: " + (await res.text()));
          return;
        }
        console.log(`[auth] magic link for ${identifier}: ${url}`);
      },
    }),
  ],
  callbacks: {
    session({ session }: { session: Session }) {
      sessionUserId(session, getDb());
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
