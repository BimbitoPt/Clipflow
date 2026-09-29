export type GuidedBrief = {
  brandId: string;
  concept: string;
  hook: string;
  keyMessage: string;
  supportingPoint: string;
  proof: string;
  cta: string;
  format: "explainer" | "demo" | "proof";
  durationSeconds: number;
  postCopy: string;
};

export type BriefIssue = { index: number; field: keyof GuidedBrief | "batch"; message: string };

export function blankBrief(brandId = ""): GuidedBrief {
  return { brandId, concept: "", hook: "", keyMessage: "", supportingPoint: "", proof: "", cta: "", format: "demo", durationSeconds: 20, postCopy: "" };
}

export function validateGuidedBriefs(briefs: GuidedBrief[]): BriefIssue[] {
  const issues: BriefIssue[] = [];
  if (briefs.length < 10 || briefs.length > 20) issues.push({ index: -1, field: "batch", message: "A batch needs 10–20 clips." });
  briefs.forEach((brief, index) => {
    for (const field of ["brandId", "concept", "hook", "keyMessage"] as const) {
      if (!brief[field].trim()) issues.push({ index, field, message: `${field === "brandId" ? "Brand" : field === "keyMessage" ? "Key message" : field === "concept" ? "Concept" : "Hook"} is required.` });
    }
    if (brief.format === "proof" && !brief.proof.trim()) issues.push({ index, field: "proof", message: "Proof/story needs a verified proof point." });
    if (!Number.isInteger(brief.durationSeconds) || brief.durationSeconds < 10 || brief.durationSeconds > 60) issues.push({ index, field: "durationSeconds", message: "Duration must be 10–60 seconds." });
  });
  return issues;
}
