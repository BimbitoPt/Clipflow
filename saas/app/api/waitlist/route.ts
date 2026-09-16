import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { joinWaitlist } from "@/lib/waitlist";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let email: unknown;
  try {
    const body = await req.json();
    email = body?.email;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }
  const result = joinWaitlist(getDb(), String(email ?? ""));
  if (result.ok) return NextResponse.json({ ok: true });
  if (result.reason === "duplicate") {
    return NextResponse.json({ ok: false, reason: "duplicate" }, { status: 409 });
  }
  return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
}
