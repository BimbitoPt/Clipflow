import type { ClientProfile } from "./client";
import type { Profile } from "./profile";

export interface BuildSpec { client: ClientProfile; idea: string; profile: Profile; packId: string; }

export function queueBuilds(client: ClientProfile, ideas: string[]): BuildSpec[] {
  const out: BuildSpec[] = [];
  for (const idea of ideas) {
    if (typeof idea !== "string") continue;
    if (idea.trim().length === 0) continue;
    const profile: Profile = {
      niche: client.niche,
      audience: client.audience,
      offer: client.offer,
      tone: client.tone,
      proof: client.proof,
    };
    out.push({ client, idea, profile, packId: client.packId });
  }
  return out;
}
