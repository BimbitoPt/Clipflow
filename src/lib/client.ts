import { isProfile, type Profile } from "./profile";

export type ClientProfile = Profile & { packId: string };

export function isClientProfile(v: unknown): v is ClientProfile {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return isProfile(o) && typeof o["packId"] === "string" && (o["packId"] as string).trim().length > 0;
}

export function stringifyClient(client: ClientProfile): string {
  return JSON.stringify(client);
}

export function parseClient(json: unknown): ClientProfile | null {
  try {
    const parsed: unknown = typeof json === "string" ? JSON.parse(json) : json;
    return isClientProfile(parsed) ? parsed : null;
  } catch { return null; }
}

export function parseClientOrThrow(json: unknown): ClientProfile {
  let parsed: unknown;
  if (typeof json === "string") {
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error("E_CLIENT_JSON: invalid JSON");
    }
  } else {
    parsed = json;
  }
  if (!isClientProfile(parsed)) throw new Error("E_CLIENT_INVALID: not a ClientProfile");
  return parsed;
}
