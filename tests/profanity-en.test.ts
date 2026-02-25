import { describe, it, expect } from "vitest";
import {
  PROFANITY_WORDS_EN,
  PROFANITY_WORDS_EN_COUNT,
  createEnglishProfanityValidator,
} from "../src/profanity-en";

describe("profanity-en subpath helpers", () => {
  it("exposes a non-empty curated list", () => {
    expect(Array.isArray(PROFANITY_WORDS_EN)).toBe(true);
    expect(PROFANITY_WORDS_EN_COUNT).toBe(PROFANITY_WORDS_EN.length);
    expect(PROFANITY_WORDS_EN_COUNT).toBeGreaterThan(1000);
  });

  it("includes curated additions", () => {
    expect(PROFANITY_WORDS_EN).toContain("putangina");
    expect(PROFANITY_WORDS_EN).toContain("assclart");
    expect(PROFANITY_WORDS_EN).toContain("pussyclaat");
  });

  it("excludes curated false-positive removals", () => {
    expect(PROFANITY_WORDS_EN).not.toContain("sexy");
    expect(PROFANITY_WORDS_EN).not.toContain("hardcore");
    expect(PROFANITY_WORDS_EN).not.toContain("deth");
  });

  it("blocks evasion variants with the helper validator", async () => {
    const validator = createEnglishProfanityValidator({ mode: "evasion" });
    const blocked = await validator("5h1t");
    expect(blocked).not.toBeNull();
  });

  it("does not block removed false positives as exact terms", async () => {
    const validator = createEnglishProfanityValidator({
      mode: "basic",
      checkSubstrings: false,
    });
    const result = await validator("hardcore");
    expect(result).toBeNull();
  });
});
