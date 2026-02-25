import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type BenchRow = {
  id?: unknown;
  identifier?: unknown;
  label?: unknown;
  target?: unknown;
  protect?: unknown;
  category?: unknown;
  threatClass?: unknown;
  notes?: unknown;
};

const datasetPath = resolve(__dirname, "..", "docs", "data", "confusable-bench.v1.json");
const raw = JSON.parse(readFileSync(datasetPath, "utf8")) as BenchRow[];

describe("confusable benchmark dataset", () => {
  it("is a non-empty JSON array", () => {
    expect(Array.isArray(raw)).toBe(true);
    expect(raw.length).toBeGreaterThan(100);
  });

  it("contains rows compatible with calibrate/recommend dataset parsing", () => {
    for (const [index, row] of raw.entries()) {
      expect(typeof row.identifier, `row ${index + 1} identifier`).toBe("string");
      expect((row.identifier as string).length, `row ${index + 1} identifier length`).toBeGreaterThan(0);

      expect(row.label === "malicious" || row.label === "benign", `row ${index + 1} label`).toBe(
        true
      );
      expect(typeof row.target, `row ${index + 1} target`).toBe("string");

      expect(Array.isArray(row.protect), `row ${index + 1} protect`).toBe(true);
      expect((row.protect as unknown[]).length, `row ${index + 1} protect length`).toBeGreaterThan(0);
      expect((row.protect as unknown[]).every((value) => typeof value === "string")).toBe(true);

      expect(typeof row.category, `row ${index + 1} category`).toBe("string");
    }
  });

  it("has unique ids and both malicious + benign classes", () => {
    const ids = raw.map((row) => row.id);
    expect(ids.every((id) => typeof id === "string")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);

    const maliciousCount = raw.filter((row) => row.label === "malicious").length;
    const benignCount = raw.filter((row) => row.label === "benign").length;
    expect(maliciousCount).toBeGreaterThan(0);
    expect(benignCount).toBeGreaterThan(0);
  });

  it("covers key attack and control categories", () => {
    const categories = new Set(raw.map((row) => row.category));

    expect(categories.has("nfkc-tr39-divergence")).toBe(true);
    expect(categories.has("mixed-script-confusable")).toBe(true);
    expect(categories.has("invisible-default-ignorable")).toBe(true);
    expect(categories.has("invisible-bidi-control")).toBe(true);
    expect(categories.has("combining-mark-evasion")).toBe(true);
    expect(categories.has("ascii-lookalike")).toBe(true);
    expect(categories.has("benign-combining-legit")).toBe(true);
    expect(categories.has("benign-unicode-precomposed")).toBe(true);
  });
});
