import { getBrand, saveBrand, storeUploadedAsset } from "@/src/lib/brand-store";
import { requireLocalMutation } from "@/src/lib/security";
import { MAX_ASSET_BYTES, validatedAssetExtension } from "@/src/lib/asset-validation";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request, context: { params: { brandId: string } }) {
  const denied = requireLocalMutation(request);
  if (denied) return denied;
  const brand = await getBrand(context.params.brandId);
  if (!brand) return Response.json({ error: "Brand not found" }, { status: 404 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    const kind = form.get("kind");
    if (!(file instanceof File)) return Response.json({ error: "Choose a file to upload" }, { status: 400 });
    if (file.size < 1 || file.size > MAX_ASSET_BYTES) return Response.json({ error: "Assets must be under 10 MB" }, { status: 413 });
    if (!["logo", "audio", "approved"].includes(String(kind))) return Response.json({ error: "Unknown asset category" }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = validatedAssetExtension(file.type, bytes);
    if (!extension) return Response.json({ error: "Allowed media signatures: PNG, JPEG, GIF, WebP, MP3, WAV or WOFF2" }, { status: 415 });
    const assetPath = await storeUploadedAsset(brand.id, bytes, extension);
    const now = new Date().toISOString();
    const updated = kind === "logo"
      ? { ...brand, logoPath: assetPath, updatedAt: now }
      : kind === "audio"
        ? { ...brand, audioPath: assetPath, updatedAt: now }
        : { ...brand, approvedAssets: [...brand.approvedAssets, { path: assetPath, note: String(form.get("note") ?? "").slice(0, 300), source: String(form.get("source") ?? "").slice(0, 300) }], updatedAt: now };
    await saveBrand(updated);
    return Response.json({ brand: updated, assetPath }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 400 });
  }
}
