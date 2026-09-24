import { z } from "zod";
import { createBatch, listBatches, type CreateBrief } from "@/src/lib/batch-store";
import { parseCsv } from "@/src/lib/csv";
import { listBrands } from "@/src/lib/brand-store";
import { requireLocalMutation } from "@/src/lib/security";

export const runtime = "nodejs";

const briefSchema = z.object({
  brandId: z.string().min(3).max(64), concept: z.string().trim().min(1).max(180), hook: z.string().trim().min(1).max(180),
  keyMessage: z.string().trim().min(1).max(500), supportingPoint: z.string().max(400).optional(), proof: z.string().max(500).optional(),
  cta: z.string().max(180).optional(), format: z.enum(["explainer", "demo", "proof"]).optional(), durationSeconds: z.coerce.number().int().min(10).max(60).optional(),
  postCopy: z.string().max(1200).optional(),
}).superRefine((brief, context) => {
  if (brief.format === "proof" && !brief.proof?.trim()) context.addIssue({ code: "custom", path: ["proof"], message: "Proof/story clips need operator-supplied proof." });
});

function parseCsvBriefs(csv: string, validBrandIds: Set<string>, brandNames: Map<string, string>) {
  const { headers, records } = parseCsv(csv);
  const required = ["concept", "hook", "keyMessage"];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);
  const accepted = new Set(["brandId", "brand", ...required, "supportingPoint", "proof", "cta", "format", "durationSeconds", "postCopy"]);
  const unknown = headers.filter((header) => !accepted.has(header));
  if (unknown.length) throw new Error(`Unknown CSV columns: ${unknown.join(", ")}`);
  const errors: string[] = [];
  const briefs: CreateBrief[] = [];
  records.forEach(({ line, values }) => {
    const rawBrand = values.brandId || values.brand || "";
    const brandId = validBrandIds.has(rawBrand) ? rawBrand : brandNames.get(rawBrand.trim().toLowerCase());
    const raw: Record<string, unknown> = { ...values, brandId, durationSeconds: values.durationSeconds || undefined };
    delete raw.brand;
    if (!raw.format) delete raw.format;
    const parsed = briefSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`Line ${line}: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "row"} ${issue.message}`).join("; ")}`);
      return;
    }
    if (!validBrandIds.has(parsed.data.brandId)) errors.push(`Line ${line}: unknown brand "${rawBrand}"`);
    else briefs.push(parsed.data);
  });
  return { briefs, errors };
}

export async function GET() {
  const batches = await listBatches();
  return Response.json({ batches });
}

export async function POST(request: Request) {
  const denied = requireLocalMutation(request);
  if (denied) return denied;
  try {
    const body = await request.json() as { name?: unknown; briefs?: unknown; csv?: unknown };
    const name = z.string().trim().min(1).max(100).parse(body.name);
    const brands = await listBrands();
    const validBrandIds = new Set(brands.map((brand) => brand.id));
    const brandNames = new Map(brands.map((brand) => [brand.name.toLowerCase(), brand.id]));
    let briefs: CreateBrief[];
    if (typeof body.csv === "string") {
      const parsed = parseCsvBriefs(body.csv, validBrandIds, brandNames);
      if (parsed.errors.length) return Response.json({ errors: parsed.errors }, { status: 400 });
      briefs = parsed.briefs;
    } else {
      const rows = z.array(briefSchema).min(10).max(20).parse(body.briefs);
      const unknownBrands = rows.map((row, index) => validBrandIds.has(row.brandId) ? null : `Clip ${index + 1}: unknown brand "${row.brandId}"`).filter((value): value is string => Boolean(value));
      if (unknownBrands.length) return Response.json({ errors: unknownBrands }, { status: 400 });
      briefs = rows;
    }
    if (briefs.length < 10 || briefs.length > 20) return Response.json({ error: "Create batches with 10–20 valid clip rows" }, { status: 400 });
    const batch = await createBatch(name, briefs);
    return Response.json(batch, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ") }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Could not create batch" }, { status: 400 });
  }
}
