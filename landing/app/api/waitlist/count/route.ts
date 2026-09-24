import { NextResponse } from "next/server";
import { getCount } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ count: await getCount() });
}
