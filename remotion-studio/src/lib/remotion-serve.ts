/**
 * Remotion serves the render bundle via its own static server, probing ports
 * 3000–3100 by default. On Windows that probe binds IPv6 (`::`) first, which
 * can succeed even when a dev server already owns `0.0.0.0:3000` — the
 * renderer then loads the foreign page ("not a Remotion project"). Pin the
 * serve port outside the probe range so renders never collide with a local
 * dev server.
 */
export const REMOTION_SERVE_PORT = 3477;
