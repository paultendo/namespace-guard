import { describe, expect, it } from "vitest";
import {
  canonicalise,
  isClean,
  LLM_CONFUSABLE_MAP,
  scan,
} from "../src/index";

type Sample = {
  char: string;
  latin: string;
  ssimScore: number;
};

function pickNovelSample(): Sample {
  for (const [char, entries] of Object.entries(LLM_CONFUSABLE_MAP)) {
    const novel = entries.find((entry) => entry.source === "novel" && entry.ssimScore >= 0.7);
    if (!novel) continue;
    return { char, latin: novel.latin, ssimScore: novel.ssimScore };
  }
  throw new Error("No novel confusable sample found in LLM_CONFUSABLE_MAP.");
}

function pickThresholdSample(): Sample {
  for (const [char, entries] of Object.entries(LLM_CONFUSABLE_MAP)) {
    const candidate = entries.find(
      (entry) => entry.ssimScore >= 0.7 && entry.ssimScore <= 0.95
    );
    if (!candidate) continue;
    return { char, latin: candidate.latin, ssimScore: candidate.ssimScore };
  }
  throw new Error("No threshold sample found in LLM_CONFUSABLE_MAP.");
}

describe("LLM preprocessing: canonicalise", () => {
  it("passes clean ASCII text unchanged", () => {
    const input = "The seller assumes all liability.";
    expect(canonicalise(input)).toBe(input);
  });

  it("replaces mixed-script Cyrillic lookalikes in Latin words", () => {
    const input = "The seller аssumes аll liаbility."; // Cyrillic а
    const output = canonicalise(input);
    expect(output).toBe("The seller assumes all liability.");
  });

  it("does not canonicalise standalone non-Latin words", () => {
    const input = "Москва Москва";
    expect(canonicalise(input)).toBe(input);
  });

  it("canonicalises novel confusables when includeNovel is true", () => {
    const sample = pickNovelSample();
    const input = `a${sample.char}z`;
    const output = canonicalise(input, { includeNovel: true });
    expect(output).toBe(`a${sample.latin}z`);
  });

  it("does not canonicalise novel confusables when includeNovel is false", () => {
    const sample = pickNovelSample();
    const input = `a${sample.char}z`;
    const output = canonicalise(input, { includeNovel: false });
    expect(output).toBe(input);
  });

  it("applies threshold filtering", () => {
    const sample = pickThresholdSample();
    const input = `a${sample.char}z`;

    const canonicalised = canonicalise(input, { threshold: sample.ssimScore - 0.001 });
    expect(canonicalised).toBe(`a${sample.latin}z`);

    const blocked = canonicalise(input, { threshold: sample.ssimScore + 0.001 });
    expect(blocked).toBe(input);
  });

  it("supports script allowlists", () => {
    const input = "The seller liаbility clause applies."; // Cyrillic а
    expect(canonicalise(input, { scripts: ["Greek"] })).toBe(input);
    expect(canonicalise(input, { scripts: ["Cyrillic"] })).toBe(
      "The seller liability clause applies."
    );
  });

  it("returns empty string for empty input", () => {
    expect(canonicalise("")).toBe("");
  });

  it("with strategy 'all', rewrites standalone non-Latin confusable words", () => {
    // Cyrillic п/о/п mimicking "non" -- all-Cyrillic token, no Latin present
    const input = "поп-refundable";
    // Default (mixed): standalone Cyrillic is preserved
    expect(canonicalise(input)).toBe("поп-refundable");
    // Strategy 'all': every confusable is replaced
    expect(canonicalise(input, { strategy: "all" })).toBe("non-refundable");
  });

  it("with strategy 'all', still passes clean ASCII unchanged", () => {
    expect(canonicalise("The seller assumes all liability.", { strategy: "all" }))
      .toBe("The seller assumes all liability.");
  });

  it("processes 10k-char text quickly", () => {
    const input = "The seller аssumes liability and indemnity. ".repeat(250);
    expect(input.length).toBeGreaterThanOrEqual(10_000);

    const start = performance.now();
    const output = canonicalise(input);
    const elapsedMs = performance.now() - start;

    expect(output.length).toBe(input.length);
    // Performance sanity check; intentionally generous for CI variance.
    expect(elapsedMs).toBeLessThan(25);
  });
});

describe("LLM preprocessing: scan", () => {
  it("returns clean result for clean text", () => {
    const result = scan("The seller assumes all liability.");
    expect(result.hasConfusables).toBe(false);
    expect(result.count).toBe(0);
    expect(result.findings).toHaveLength(0);
    expect(result.summary.riskLevel).toBe("none");
  });

  it("returns detailed findings for mixed-script confusables", () => {
    const result = scan("The seller liаbility clause applies."); // Cyrillic а
    expect(result.hasConfusables).toBe(true);
    expect(result.count).toBeGreaterThan(0);

    const finding = result.findings[0];
    expect(finding.codepoint).toMatch(/^U\+/);
    expect(typeof finding.script).toBe("string");
    expect(finding.script.length).toBeGreaterThan(0);
    expect(/^[a-z0-9]$/i.test(finding.latinEquivalent)).toBe(true);
    expect(typeof finding.ssimScore).toBe("number");
    expect(finding.ssimScore).toBeGreaterThanOrEqual(0);
    expect(finding.ssimScore).toBeLessThanOrEqual(1);
    expect(finding.word.length).toBeGreaterThan(0);
    expect(typeof finding.mixedScript).toBe("boolean");

    expect(result.summary.scriptsDetected.length).toBeGreaterThan(0);
  });

  it("assigns low risk to standalone non-Latin confusable words", () => {
    const result = scan("ааа"); // Cyrillic-only token
    expect(result.hasConfusables).toBe(true);
    expect(result.findings.every((finding) => finding.mixedScript === false)).toBe(true);
    expect(result.summary.riskLevel).toBe("low");
  });

  it("with strategy 'all', elevates risk for standalone confusable words", () => {
    // "ааа" is standalone Cyrillic -- normally "low" risk
    const normal = scan("ааа");
    expect(normal.summary.riskLevel).toBe("low");

    // With strategy 'all', standalone confusables are treated as suspicious
    const aggressive = scan("ааа", { strategy: "all" });
    expect(aggressive.summary.riskLevel).not.toBe("low");
  });

  it("assigns medium risk for sparse mixed-script findings", () => {
    const result = scan("The seller has liаbility caps.");
    expect(result.hasConfusables).toBe(true);
    expect(result.summary.riskLevel).toBe("medium");
  });

  it("assigns high risk for multiple mixed-script legal-term hits", () => {
    const input = "liаbility indemnitу penаlty terms apply"; // Cyrillic а, у
    const result = scan(input);
    expect(result.hasConfusables).toBe(true);
    expect(result.summary.riskLevel).toBe("high");
  });

  it("respects script allowlists", () => {
    const input = "The seller liаbility clause applies."; // Cyrillic а
    const excluded = scan(input, { scripts: ["Greek"] });
    expect(excluded.hasConfusables).toBe(false);
    expect(excluded.count).toBe(0);

    const included = scan(input, { scripts: ["Cyrillic"] });
    expect(included.hasConfusables).toBe(true);
    expect(included.count).toBeGreaterThan(0);
  });
});

describe("LLM preprocessing: isClean", () => {
  it("returns true for clean Latin text", () => {
    expect(isClean("The seller assumes all liability.")).toBe(true);
  });

  it("returns false for mixed-script confusable substitutions", () => {
    expect(isClean("The seller liаbility clause applies.")).toBe(false);
  });

  it("returns true for standalone non-Latin words", () => {
    expect(isClean("Москва القاهرة 東京")).toBe(true);
  });

  it("with strategy 'all', returns false for standalone confusable words", () => {
    // Default: "поп" is all-Cyrillic (standalone), "refundable" is all-Latin.
    // Neither token is mixed-script, so default isClean passes.
    expect(isClean("поп-refundable")).toBe(true);
    // Standalone Cyrillic: default is fine
    expect(isClean("ааа")).toBe(true);
    // Strategy 'all': any confusable character fails the gate
    expect(isClean("ааа", { strategy: "all" })).toBe(false);
    expect(isClean("поп-refundable", { strategy: "all" })).toBe(false);
  });
});
