// Keep this entrypoint dependency-free so module-load failures in the real
// encoder worker can be reported to the UI instead of degrading into the
// generic E_ENCODER_INIT timeout.
export {};

// The main thread posts `init` immediately after constructing the worker,
// while this dynamic import is still in flight. A dedicated worker with no
// onmessage handler yet silently drops those messages (they are NOT queued),
// so buffer early payloads and replay them once the real handler is
// installed — otherwise every export dies on the E_ENCODER_INIT timeout.
const buffered: unknown[] = [];
const bufferer = (event: MessageEvent) => {
  buffered.push(event.data);
};
self.onmessage = bufferer;
try {
  await import("./export-worker");
  const handler = (self as unknown as { onmessage: ((event: MessageEvent) => void) | null }).onmessage;
  if (handler && handler !== bufferer) {
    for (const data of buffered) handler({ data } as MessageEvent);
  }
} catch (error) {
  const message = error instanceof Error
    ? `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`
    : String(error);
  self.postMessage({ type: "error", message: `E_ENCODER_BOOTSTRAP: ${message}` });
}
