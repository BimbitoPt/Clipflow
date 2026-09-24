export const MAX_ASSET_BYTES = 10 * 1024 * 1024;

const formats: Record<string, { extension: string; signature: (bytes: Uint8Array) => boolean }> = {
  "image/png": { extension: "png", signature: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/jpeg": { extension: "jpg", signature: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/gif": { extension: "gif", signature: (b) => String.fromCharCode(...b.slice(0, 3)) === "GIF" },
  "image/webp": { extension: "webp", signature: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP" },
  "audio/mpeg": { extension: "mp3", signature: (b) => String.fromCharCode(...b.slice(0, 3)) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  "audio/wav": { extension: "wav", signature: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WAVE" },
  "font/woff2": { extension: "woff2", signature: (b) => String.fromCharCode(...b.slice(0, 4)) === "wOF2" },
};

export function validatedAssetExtension(mimeType: string, bytes: Uint8Array): string | null {
  const format = formats[mimeType];
  return format?.signature(bytes) ? format.extension : null;
}
