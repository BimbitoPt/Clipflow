import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { tierFor } from "@/lib/billing";
import { canRender, recordRender } from "@/lib/credits";
import { enqueue } from "@/lib/jobs";

export const runtime = "nodejs";

const VOICES = new Set(["auto", "sapi", "off"]);

function validVoice(voice: unknown): boolean {
  if (typeof voice !== "string") return false;
  return VOICES.has(voice) || voice.startsWith("eleven:");
}

export async function POST(request: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: { idea?: unknown; voice?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const idea = body.idea;
  if (typeof idea !== "string" || idea.trim().length === 0 || idea.length > 1000) {
    return NextResponse.json({ error: "empty idea" }, { status: 400 });
  }
  if (!validVoice(body.voice ?? "auto")) {
    return NextResponse.json({ error: "invalid voice" }, { status: 400 });
  }

  const db = getDb();
  const tier = tierFor(db, email);
  if (!canRender(db, email, tier)) {
    return NextResponse.json({ error: "quota" }, { status: 402 });
  }

  const id = enqueue(db, email, idea, typeof body.voice === "string" ? body.voice : "auto");
  recordRender(db, email);
  return NextResponse.json({ id });
}
