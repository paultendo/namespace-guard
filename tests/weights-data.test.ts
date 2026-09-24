import { describe, expect, it } from "vitest";
import { CONFUSABLE_WEIGHTS } from "../src/confusable-weights";
import { FONT_SPECIFIC_WEIGHTS } from "../src/font-specific-weights";

describe("confusable weights data", () => {
  it("keeps the stronger finding for a pair measured within one font and across fonts", () => {
    // Tamil zero is alike to o in every text font drawing both (1.0), but in 41% of cross-font combinations
    expect(CONFUSABLE_WEIGHTS["௦"]?.["o"]?.danger).toBe(1);
  });
});

describe("font-specific weights data", () => {
  it("comes from release 2, scoring each pair in the fonts where it is alike", () => {
    expect(FONT_SPECIFIC_WEIGHTS["Arial"]?.["ј"]?.["j"]?.danger).toBe(1); // Cyrillic je
    expect(FONT_SPECIFIC_WEIGHTS["Roboto"]).toBeDefined();
  });

  it("scores every entry between 0 and 1", () => {
    for (const weights of Object.values(FONT_SPECIFIC_WEIGHTS)) {
      for (const targets of Object.values(weights)) {
        for (const w of Object.values(targets)) {
          expect(w.danger).toBeGreaterThanOrEqual(0);
          expect(w.danger).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
