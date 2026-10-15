// Keep this entrypoint dependency-free so module-load failures in the real
// encoder worker can be reported to the UI instead of degrading into the
// generic E_ENCODER_INIT timeout.
try {
  await import("./export-worker");
} catch (error) {
  const message = error instanceof Error
    ? `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`
    : String(error);
  self.postMessage({ type: "error", message: `E_ENCODER_BOOTSTRAP: ${message}` });
}
