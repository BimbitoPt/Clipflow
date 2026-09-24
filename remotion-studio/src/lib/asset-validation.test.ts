import { describe, expect, it } from "vitest";
import { MAX_ASSET_BYTES, validatedAssetExtension } from "./asset-validation";

describe("asset validation", () => {
  it("accepts a PNG signature and rejects a mismatched declaration", () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(validatedAssetExtension("image/png", pngHeader)).toBe("png");
    expect(validatedAssetExtension("image/jpeg", pngHeader)).toBeNull();
  });
  it("rejects unsupported types and enforces the documented upload ceiling", () => {
    expect(validatedAssetExtension("image/svg+xml", new TextEncoder().encode("<svg/>"))).toBeNull();
    expect(MAX_ASSET_BYTES).toBe(10 * 1024 * 1024);
  });
});
