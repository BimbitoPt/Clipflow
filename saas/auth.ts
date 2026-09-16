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
): string | undefined {
  const email = session.user?.email;
  if (!email) return undefined;
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as
    | { id: string }
    | undefined;
  if (existing) {
    if (session.user) session.user.id = existing.id;
    return existing.id;
  }
  db.prepare("INSERT INTO users(id, email) VALUES (?, ?) ON CONFLICT(email) DO NOTHING").run(crypto.randomUUID(), email);
  const id = (db.prepare("SELECT id FROM users WHERE email = ?").get(email) as
    | { id: string }
    | undefined)?.id;
  if (!id) return undefined;
  if (session.user) session.user.id = id;
  return id;
}

export const adapter = {
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
    const user = getUserById(partial.id, db);
    if (!user) throw new Error("user not found after update");
    return user;
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
    const row = getDb()
      .prepare("DELETE FROM verification_tokens WHERE token = ? RETURNING identifier, token, expires")
      .get(token) as { identifier: string; token: string; expires: string } | undefined;
    if (!row) return null;
    return { identifier: row.identifier, token: row.token, expires: new Date(row.expires) };
  },
  createSession({ sessionToken, userId, expires }: { sessionToken: string; userId: string; expires: Date }) {
    getDb()
      .prepare("INSERT INTO sessions(id, session_token, user_id, expires) VALUES (?, ?, ?, ?)")
      .run(crypto.randomUUID(), sessionToken, userId, expires.toISOString());
    const row = getDb()
      .prepare("SELECT id, session_token, user_id, expires FROM sessions WHERE session_token = ?")
      .get(sessionToken) as
      | { id: string; session_token: string; user_id: string; expires: string }
      | undefined;
    if (!row) throw new Error("failed to create session");
    return {
      id: row.id,
      sessionToken: row.session_token,
      userId: row.user_id,
      expires: new Date(row.expires),
    };
  },
  getSessionAndUser(sessionToken: string) {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT s.id AS s_id, s.session_token, s.user_id, s.expires AS s_expires,
                u.id AS u_id, u.email, u.email_verified, u.name, u.image
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.session_token = ?`,
      )
      .get(sessionToken) as
      | {
          s_id: string;
          session_token: string;
          user_id: string;
          s_expires: string;
          u_id: string;
          email: string;
          email_verified: string | null;
          name: string | null;
          image: string | null;
        }
      | undefined;
    if (!row) return null;
    return {
      session: {
        id: row.s_id,
        sessionToken: row.session_token,
        userId: row.user_id,
        expires: new Date(row.s_expires),
      },
      user: {
        id: row.u_id,
        email: row.email,
        emailVerified: row.email_verified ? new Date(row.email_verified) : null,
        name: row.name,
        image: row.image,
      },
    };
  },
  updateSession(
    sessionTokenOrSession: string | { sessionToken: string; userId?: string; expires?: Date },
    maybeUpdates?: { sessionToken?: string; userId?: string; expires?: Date },
  ) {
    const token =
      typeof sessionTokenOrSession === "string" ? sessionTokenOrSession : sessionTokenOrSession.sessionToken;
    const updates =
      typeof sessionTokenOrSession === "string"
        ? maybeUpdates
        : {
            sessionToken: sessionTokenOrSession.sessionToken,
            userId: sessionTokenOrSession.userId,
            expires: sessionTokenOrSession.expires,
          };
    if (!token || !updates) return null;
    const row = getDb()
      .prepare("SELECT id, session_token, user_id, expires FROM sessions WHERE session_token = ?")
      .get(token) as
      | { id: string; session_token: string; user_id: string; expires: string }
      | undefined;
    if (!row) return null;
    getDb()
      .prepare(
        `UPDATE sessions SET
           session_token = COALESCE(?, session_token),
           user_id = COALESCE(?, user_id),
           expires = COALESCE(?, expires)
         WHERE session_token = ?`,
      )
      .run(
        updates.sessionToken ?? null,
        updates.userId ?? null,
        updates.expires ? updates.expires.toISOString() : null,
        token,
      );
    const updated = getDb()
      .prepare("SELECT id, session_token, user_id, expires FROM sessions WHERE session_token = ?")
      .get(updates.sessionToken ?? token) as
      | { id: string; session_token: string; user_id: string; expires: string }
      | undefined;
    if (!updated) return null;
    return {
      id: updated.id,
      sessionToken: updated.session_token,
      userId: updated.user_id,
      expires: new Date(updated.expires),
    };
  },
  deleteSession(sessionToken: string) {
    getDb().prepare("DELETE FROM sessions WHERE session_token = ?").run(sessionToken);
    return Promise.resolve();
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
        if (process.env.NODE_ENV === "production") {
          throw new Error("RESEND_API_KEY is required in production to send sign-in emails");
        }
        console.log(`[auth] magic link for ${identifier}: ${url}`);
      },
    }),
  ],
  callbacks: {
    session({ session }: { session: Session }) {
      if (!session?.user?.email) return session;
      sessionUserId(session, getDb());
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
