import { getBrand, saveBrand } from "@/src/lib/brand-store";
import { requireLocalMutation } from "@/src/lib/security";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: { brandId: string } }) {
  const brand = await getBrand(context.params.brandId);
  return brand ? Response.json({ brand }) : Response.json({ error: "Brand not found" }, { status: 404 });
}

export async function PUT(request: Request, context: { params: { brandId: string } }) {
  const denied = requireLocalMutation(request);
  if (denied) return denied;
  try {
    const current = await getBrand(context.params.brandId);
    if (!current) return Response.json({ error: "Brand not found" }, { status: 404 });
    const input = await request.json();
    if (input.id !== current.id) return Response.json({ error: "Brand ID cannot be changed" }, { status: 400 });
    const brand = await saveBrand({ ...input, updatedAt: new Date().toISOString() });
    return Response.json({ brand });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid brand kit" }, { status: 400 });
  }
}
