export type HeaderRequest = { headers: { get(name: string): string | null } };

function localHost(value: string | null): URL | null {
  if (!value) return null;
  try {
    const url = new URL(`http://${value}`);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

export function isLocalMutation(request: HeaderRequest): boolean {
  const host = localHost(request.headers.get("host"));
  const origin = request.headers.get("origin");
  if (!host || !origin) return false;
  try {
    const originUrl = new URL(origin);
    return ["http:", "https:"].includes(originUrl.protocol)
      && ["127.0.0.1", "localhost", "[::1]"].includes(originUrl.hostname)
      && originUrl.host.toLowerCase() === host.host.toLowerCase();
  } catch {
    return false;
  }
}

export function requireLocalMutation(request: HeaderRequest): Response | null {
  return isLocalMutation(request) ? null : Response.json({ error: "Local same-origin request required" }, { status: 403 });
}
