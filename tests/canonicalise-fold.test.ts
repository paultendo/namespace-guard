import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { canonicalise, isClean, scan } from "../src/index";

// The Denial of Spend test documents (confusable-vision, scripts/denial-of-spend.mjs): a contract, the same contract
// with 18 negations spelt with lookalikes (поŧ for not), and flooded (60% of lowercase letters swapped)
const DOS = join(__dirname, "../../confusable-vision/data/output/denial-of-spend");
const haveDocs = existsSync(join(DOS, "contract.flood.txt"));
const doc = (v: string) => readFileSync(join(DOS, `contract.${v}.txt`), "utf8");
const nonAscii = (s: string) => [...s].filter((c) => c.codePointAt(0)! > 0x7f);

describe("canonicalise: words that show tampering are folded in full", () => {
  it("restores a word mixing Cyrillic with Latin letters that carry a stroke", () => {
    // Cyrillic п and о, Latin t with stroke
    expect(canonicalise("shall поŧ be limited")).toBe("shall not be limited");
  });

  it("restores a word made of technical and obsolete letters", () => {
    // h with hook, g with oblique stroke, y with stroke
    expect(canonicalise("ɦello ꞡood ɏes")).toBe("hello good yes");
  });

  it("treats a non-ASCII capital inside a lowercase word as tampering", () => {
    // t with stroke and I with dot above are both in modern use; the capital inside "time" gives it away
    expect(canonicalise("ŧİme")).toBe("time");
    expect(canonicalise("McDonald")).toBe("McDonald");
  });

  it("lowercases a capital swapped into the middle of a lowercase word", () => {
    // T, h with hook, I with dot above, s
    expect(canonicalise("Tɦİs")).toBe("This");
  });

  it("keeps the case of a word in capitals", () => {
    // Epigraphic I longa, I with dot above, B, I, L, T with stroke
    expect(canonicalise("ꟾİABILIŦY", { strategy: "all" })).toBe("LIABILITY");
  });

  it("folds letters NFKC maps to ASCII (modifier and fullwidth letters) in a tampered word", () => {
    // modifier capital W, i with dot above as a capital, t with stroke, h with hook
    expect(canonicalise("ᵂİŧɦout").toLowerCase()).toBe("without");
  });
});

describe("canonicalise: ordinary text in other languages is left alone by default", () => {
  const samples = ["Москва", "İstanbul", "łódź", "Köln", "Tromsø", "Đà Nẵng", "ŧ", "Ελλάδα", "naïve café"];
  for (const s of samples) {
    it(`leaves ${s}`, () => {
      expect(canonicalise(s)).toBe(s);
      expect(isClean(s)).toBe(true);
    });
  }

  it("folds them when told the text is Latin", () => {
    expect(canonicalise("İstanbul Köln łódź", { strategy: "all" })).toBe("Istanbul Koln lodz");
  });

  it("respects an explicit threshold as a floor", () => {
    // п scores below 0.7 against n; with the threshold set, it stays even in a mixed word
    expect(canonicalise("пot", { threshold: 0.9 })).toBe("пot");
  });
});

describe("isClean and scan agree with canonicalise", () => {
  const texts = [
    "The seller assumes all liability.",
    "shall поŧ be limited",
    "Tɦİs",
    "İstanbul",
    "Москва",
    "ɦello",
    "ɑdmin",
    "pаypal",
    "ｈello",
    "naïve café",
  ];
  for (const strategy of ["mixed", "all"] as const) {
    for (const t of texts) {
      it(`${strategy}: ${t}`, () => {
        const changed = canonicalise(t, { strategy }) !== t;
        expect(isClean(t, { strategy })).toBe(!changed);
        // scan() reports every rewrite, and also lookalikes it leaves alone (a Russian word's letters) at low risk
        if (changed) expect(scan(t, { strategy }).hasConfusables).toBe(true);
      });
    }
  }
});

describe.skipIf(!haveDocs)("the Denial of Spend documents", () => {
  it("flood: strategy all restores the contract exactly, case included", () => {
    expect(canonicalise(doc("flood"), { strategy: "all" })).toBe(doc("clean"));
  });

  it("flip: strategy all restores the contract exactly", () => {
    expect(canonicalise(doc("flip"), { strategy: "all" })).toBe(doc("clean"));
  });

  it("flood: the default leaves only words whose one change is a letter in modern use", () => {
    const before = nonAscii(doc("flood")).length;
    const left = nonAscii(canonicalise(doc("flood")));
    expect(left.length).toBeLessThan(before / 100);
    // What's left is Sámi t with stroke in "to" and "at", words with no other sign of tampering
    expect(new Set(left)).toEqual(new Set(["ŧ"]));
  });

  it("flip: the default leaves only all-Cyrillic words", () => {
    const left = canonicalise(doc("flip")).split(/[^\p{L}]+/u).filter((w) => nonAscii(w).length);
    expect(new Set(left)).toEqual(new Set(["поп"]));
  });
});
