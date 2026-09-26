import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createProfanityValidator } from "../src/index";
import {
  PROFANITY_ALLOWLIST_EN,
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

  it("ships an allowlist of names, places and words that contain a listed word", async () => {
    expect(PROFANITY_ALLOWLIST_EN).toContain("scunthorpe");
    expect(PROFANITY_ALLOWLIST_EN).toContain("dickson");
    const listed = new Set(PROFANITY_WORDS_EN);
    expect(PROFANITY_ALLOWLIST_EN.filter((w) => listed.has(w))).toEqual([]);
    // Every allowed word is one the list would refuse without it.
    const plain = createProfanityValidator(PROFANITY_WORDS_EN);
    for (const word of PROFANITY_ALLOWLIST_EN) expect(await plain(word), word).not.toBeNull();
  });

  it("keeps words that look like slurs off the allowlist", () => {
    // The slur screen in scripts/measure-profanity.mjs, and the reviewed exceptions to it.
    const stems = ["nigg", "nigr", "negro", "coon", "golliwog", "chink", "gook", "kike", "wog", "paki", "spic", "fag",
      "tranny", "retard", "raghead", "towelhead", "wetback", "darkie", "gyppo", "pikey", "dago", "sambo", "squaw"];
    const exceptions = new Set(["montenegro", "negroponte", "rionegro", "gobbledygook", "squawk", "denigrate",
      "denigration", "winegrower", "winegrowing", "pinegrove", "dagostino", "dagostini", "panigrahi", "negroni", "schinkel"]);
    const slurs = PROFANITY_ALLOWLIST_EN.filter((w) => !exceptions.has(w) && stems.some((stem) => w.includes(stem)));
    expect(slurs).toEqual([]);
  });

  it("adds an allowlist you pass to its own", async () => {
    const validator = createEnglishProfanityValidator({ allowlist: ["nipissing", "shitterton"] });
    expect(await validator("nipissing")).toBeNull();
    expect(await validator("shitterton")).toBeNull();
    expect(await validator("scunthorpe")).toBeNull();
    expect(await validator("xshitx")).not.toBeNull();
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

describe("the English list with default settings", () => {
  const validator = createEnglishProfanityValidator();
  const refuses = async (name: string) => (await validator(name)) !== null;

  // name, refused before 0.23.0's fix, refused now. Before, "sh!+" and "shi+" were looked for with their symbols
  // dropped ("sh" and "shi"), spaced entries counted their spaces towards minSubstringLength ("a s s", "h e l l"),
  // and entries common inside English words were looked for anywhere ("anal", "rape", "arse").
  const table: [string, boolean, boolean][] = [
    // ordinary words and names
    ["hello", true, false],
    ["michelle", true, false],
    ["class", true, false],
    ["grape", true, false],
    ["analyst", true, false],
    ["arsenal", true, false],
    ["assistant", true, false],
    ["therapist", true, false],
    ["california", true, false],
    ["massage", true, false],
    ["cushion", true, false],
    ["cocktail", true, false],
    ["title", true, false],
    ["shell", true, false],
    ["fish", true, false],
    ["she", true, false],
    ["a", true, false],
    ["hello-kitty", true, false],
    ["thomas", true, false],
    ["joshua", true, false],
    ["ashley", true, false],
    ["sharon", true, false],
    ["washington", true, false],
    ["morgan", true, false],
    ["simpson", true, false],
    ["thompson", true, false],
    ["marshall", true, false],
    ["mitchell", true, false],
    ["shannon", true, false],
    ["sheila", true, false],
    ["natasha", true, false],
    ["hancock", true, false],
    ["bishop", true, false],
    ["fisher", true, false],
    ["english", true, false],
    ["abbott", true, false],
    // Names and places: entries that are names were taken off the list (wang, lynch, sanchez), and names and places
    // that contain a listed word are on PROFANITY_ALLOWLIST_EN (scunthorpe, dickson).
    ["scunthorpe", true, false],
    ["scunthorpe-fc", true, false],
    ["penistone", true, false],
    ["visit-penistone", true, false],
    ["cockermouth", true, false],
    ["clitheroe", true, false],
    ["essex", false, false],
    ["sussex", false, false],
    ["middlesex", false, false],
    ["wang", true, false],
    ["lynch", true, false],
    ["sanchez", true, false],
    ["jerry", true, false],
    ["dickson", true, false],

    ["kirkland", true, false],
    ["strickland", true, false],
    ["twatt", true, false],
    ["shitterton", true, false],
    ["cummings", true, false],
    ["cummins", true, false],
    ["negroni", true, false],
    ["shizuka", true, false],
    ["dikembe", true, false],
    ["k\u00f6nigslutter", true, false],
    // A place written "X-cum-Y" passes only exactly so; "cum" elsewhere still counts.
    ["chorlton-cum-hardy", false, false],
    ["stow-cum-quy", false, false],
    ["chorlton-cum-hardy-fc", false, true],
    ["cum-hardy", false, true],
    ["chorlton-c-u-m-hardy", false, true],
    ["c-u-m", true, true],
    // Still refused. "dick" and "cumming" are names the list keeps, as the vulgar sense is the likelier reading of a
    // handle. Names, places and words that look like a slur or read crude are kept off the allowlist (niggli, negron,
    // snigger, nipissing). A listed word across a separator counts: push-it reads as pushit.
    ["dick", true, true],
    ["cumming", true, true],
    ["niggli", true, true],
    ["negron", true, true],
    ["snigger", true, true],
    ["niggling", true, true],
    ["nipissing", true, true],
    ["push-it", true, true],
    // disguises
    ["shitposter", true, true],
    ["xshitx", true, true],
    ["5h1t", true, true],
    ["sh1t", true, true],
    ["ѕhit", true, true], // Cyrillic ѕ
    ["s-h-i-t", true, true],
    ["s.h.i.t", true, true],
    ["sh!t", true, true],
    ["$h!t", true, true],
    ["shiiit", true, true],
    ["fuuuck", false, true],
    ["xfuckx", true, true],
    ["gofuckyourself", true, true],
    ["my-ass", true, true],
    ["ass-hat", true, true],
    ["ass4life", true, true],
    ["a55", true, true],
    ["@$$", true, true],
  ];

  it.each(table)("%s: refused before %s, now %s", async (name, _before, now) => {
    expect(await refuses(name)).toBe(now);
  });

  // The evasion set: each entry's letters and common disguises of them, generated from the list.
  const LETTER_FOR: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "+": "t", "!": "i", "|": "i" };
  const DIGIT_FOR: Record<string, string> = { a: "4", e: "3", i: "1", o: "0", s: "5", t: "7" };
  const SYMBOL_FOR: Record<string, string> = { a: "@", s: "$", i: "!", t: "+" };
  const LOOKALIKE_FOR: Record<string, string> = {
    a: "а", c: "с", e: "е", o: "о", p: "р", x: "х", y: "у", i: "і", s: "ѕ", j: "ј",
  };
  const entryLetters = (entry: string): string | null => {
    let out = "";
    for (const ch of entry.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()) {
      if (/[a-z]/.test(ch)) out += ch;
      else if (LETTER_FOR[ch]) out += LETTER_FOR[ch];
      else if (/[0-9]/.test(ch)) return null; // a digit that stands for no letter
    }
    return /^[a-z]{2,}$/.test(out) ? out : null;
  };
  const swapFirst = (w: string, table: Record<string, string>) => {
    const i = [...w].findIndex((c) => table[c]);
    return i < 0 ? null : w.slice(0, i) + table[w[i]] + w.slice(i + 1);
  };
  const swapAll = (w: string, table: Record<string, string>) =>
    [...w].some((c) => table[c]) ? [...w].map((c) => table[c] ?? c).join("") : null;
  const disguises = (w: string): [string, string][] => {
    const half = Math.floor(w.length / 2);
    const vowel = Math.max(0, w.search(/[aeiou]/));
    const leet = swapAll(w, DIGIT_FOR);
    // A word with a letter already three times in a row can't be told from a repeat of it.
    const tripled = /(.)\1\1/.test(w);
    const rows: [string, string | null][] = [
      ["letters", w],
      ["leet, every letter", leet],
      ["leet, one letter", swapFirst(w, DIGIT_FOR)],
      ["leet, one symbol", swapFirst(w, SYMBOL_FOR)],
      ["lookalike, one letter", swapFirst(w, LOOKALIKE_FOR)],
      ["lookalike, every letter", swapAll(w, LOOKALIKE_FOR)],
      ["separators", [...w].join("-")],
      ["separators", [...w].join(".")],
      ["separators", [...w].join("_")],
      ["separators", `${w.slice(0, half)}-${w.slice(half)}`],
      ["repeated letter", tripled ? null : w.slice(0, vowel) + w[vowel].repeat(3) + w.slice(vowel + 1)],
      ["repeated letter", tripled ? null : w.slice(0, vowel) + w[vowel].repeat(5) + w.slice(vowel + 1)],
      ["embedded at a boundary", `my-${w}`],
      ["embedded at a boundary", `${w}_x`],
      ["embedded at a boundary", `${w}123`],
      ["embedded at a boundary", `x.${w}.x`],
      ["embedded at a boundary", `${leet ?? w}-poster`],
      ["embedded in letters", `x${w}x`],
      ["embedded in letters", `${w}poster`],
      ["embedded in letters", `the${w}`],
    ];
    return rows.filter((row): row is [string, string] => row[1] !== null);
  };

  it("refuses the list's words and their disguises", async () => {
    const words = [...new Set(PROFANITY_WORDS_EN.map(entryLetters).filter((w): w is string => w !== null))];
    const cases: [string, string][] = [
      ...PROFANITY_WORDS_EN.map((entry): [string, string] => ["entry as written", entry.toLowerCase()]),
      ...words.flatMap(disguises),
    ];
    const caught: Record<string, [number, number]> = {};
    for (const [kind, value] of cases) {
      caught[kind] ??= [0, 0];
      caught[kind][0]++;
      if (await refuses(value)) caught[kind][1]++;
    }
    // [cases, refused]. Before 0.23.0's fix: leet every letter 2,224, repeated letter 1,367, embedded at a boundary
    // 11,437 and embedded in letters 6,893; the rest as now.
    expect(caught).toEqual({
      "entry as written": [2624, 2624],
      letters: [2335, 2335],
      "leet, every letter": [2278, 2278],
      "leet, one letter": [2278, 2278],
      "leet, one symbol": [2013, 2013],
      "lookalike, one letter": [2319, 2319],
      "lookalike, every letter": [2319, 2319],
      separators: [9340, 9340],
      "repeated letter": [4634, 4634],
      "embedded at a boundary": [11675, 11675],
      // The 660 missed are entries matched only as whole words (shorter than 4 letters, written as several words, or
      // common inside English words: "xanalx" reads like "canal"), and a few that run into an allowed name.
      "embedded in letters": [7005, 6345],
    });
  });

  it.skipIf(!existsSync("/usr/share/dict/words"))("refuses few dictionary words", async () => {
    const words = [...new Set(readFileSync("/usr/share/dict/words", "utf8").split("\n").map((w) => w.trim().toLowerCase()).filter(Boolean))];
    let refused = 0;
    for (const word of words) if (await refuses(word)) refused++;
    // macOS's list (234,456 words once lowercased): 18,974 refused before 0.23.0's fix, 1,774 now.
    expect(refused / words.length).toBeLessThan(0.01);
  });
});
