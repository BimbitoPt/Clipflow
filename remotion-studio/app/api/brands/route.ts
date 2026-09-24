import { listBrands, saveBrand } from "@/src/lib/brand-store";
import { requireLocalMutation } from "@/src/lib/security";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ brands: await listBrands() });
}

export async function POST(request: Request) {
  const denied = requireLocalMutation(request);
  if (denied) return denied;
  try {
    const brand = await saveBrand(await request.json());
    return Response.json({ brand }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid brand kit" }, { status: 400 });
  }
}
