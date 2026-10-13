import { describe, expect, it } from "vitest";
import { safeStorageGet, type KeyValueStore } from "./storage";

function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe("safeStorageGet", () => {
  it("returns the stored value", () => {
    const store = memoryStore();
    store.setItem("k", "v");
    expect(safeStorageGet(store, "k")).toBe("v");
  });

  it("returns null for a missing key", () => {
    expect(safeStorageGet(memoryStore(), "missing")).toBeNull();
  });

  it("swallows a throwing store instead of crashing the read", () => {
    const throwing: KeyValueStore = {
      getItem() {
        throw new Error("storage disabled");
      },
      setItem() {},
      removeItem() {},
    };
    expect(safeStorageGet(throwing, "k")).toBeNull();
  });
});