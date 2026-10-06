import { readFile } from "node:fs/promises";
import { saveBrand } from "../src/lib/brand-store";
import { createBatch, listBatches, updateClip, type CreateBrief } from "../src/lib/batch-store";

type ContentPack = {
  batchName: string;
  brandId: string;
  clips: Array<CreateBrief & { script: string; source: string }>;
};

async function main() {
  const brand = JSON.parse(await readFile("../brand/octane-archive-brandkit.json", "utf8"));
  const pack: ContentPack = JSON.parse(await readFile("../brand/octane-archive-pilot.json", "utf8"));
  await saveBrand(brand);

  const existing = (await listBatches()).find(({ batch }) => batch.name === pack.batchName);
  const briefs = pack.clips.map(({ script: _script, source, ...brief }) => ({
    ...brief,
    brandId: pack.brandId,
    postCopy: `${brief.hook}\n\n${brief.keyMessage}\n\n${brief.cta}\n\nSource: ${source}`,
  }));
  const created = existing || await createBatch(pack.batchName, briefs);
  for (const [index, clip] of created.clips.entries()) {
    const brief = briefs[index];
    await updateClip(clip.batchId, clip.id, {
      ...clip,
      ...brief,
      sceneCopy: [brief.hook, brief.supportingPoint || brief.keyMessage, brief.proof || brief.keyMessage, brief.cta || "Learn more."],
      voiceover: { ...clip.voiceover, script: pack.clips[index].script },
    });
  }

  console.log(JSON.stringify({ batchId: created.batch.id, clipCount: created.clips.length, reused: Boolean(existing) }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
