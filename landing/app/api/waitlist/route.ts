import { NextResponse } from "next/server";
import { addSignup } from "@/lib/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  let body: { email?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || typeof body.email !== "string" ||
      (body.source !== undefined && typeof body.source !== "string")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = body.email.trim().toLowerCase();
  const source = (body.source ?? "").trim().slice(0, 100) || null;

  if (!email) {
    return NextResponse.json({ error: "Enter your email." }, { status: 400 });
  }
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "That email doesn't look right. Check it and try again." },
      { status: 400 }
    );
  }

  const result = await addSignup(email, source);
  return NextResponse.json(
    { ok: true, duplicate: result.duplicate ?? false, token: result.token },
    { status: 200 }
  );
}
