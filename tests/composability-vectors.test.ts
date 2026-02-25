import { describe, it, expect } from "vitest";
import {
  COMPOSABILITY_VECTOR_SUITE,
  COMPOSABILITY_VECTORS,
  COMPOSABILITY_VECTORS_COUNT,
} from "../src/composability-vectors";

describe("composability-vectors subpath", () => {
  it("exports a stable named suite with vectors", () => {
    expect(COMPOSABILITY_VECTOR_SUITE).toBe("nfkc-tr39-divergence-v1");
    expect(COMPOSABILITY_VECTORS_COUNT).toBe(COMPOSABILITY_VECTORS.length);
    expect(COMPOSABILITY_VECTORS_COUNT).toBeGreaterThanOrEqual(30);
  });

  it("includes known Long S divergence vector", () => {
    const longS = COMPOSABILITY_VECTORS.find((row) => row.codePoint === "U+017F");
    expect(longS).toBeDefined();
    expect(longS?.tr39).toBe("f");
    expect(longS?.nfkc).toBe("s");
  });
});
