/** A database table or model to check for slug/handle collisions. */
export type NamespaceSource = {
  /** Table/model name (must match the adapter's lookup key) */
  name: string;
  /** Column that holds the slug/handle */
  column: string;
  /** Column name for the primary key (default: "id", or "_id" for Mongoose) */
  idColumn?: string;
  /** Scope key for ownership checks — allows users to update their own slug without a false collision */
  scopeKey?: string;
};

/** Built-in suggestion strategy names. */
export type SuggestStrategyName =
  | "sequential"
  | "random-digits"
  | "suffix-words"
  | "short-random"
  | "scramble"
  | "similar";

/** Configuration for a namespace guard instance. */
export type NamespaceConfig = {
  /** Reserved names — flat list, Set, or categorized record */
  reserved?: Set<string> | string[] | Record<string, string[]>;
  /** Data sources to check for collisions */
  sources: NamespaceSource[];
  /** Regex pattern for valid identifiers (default: lowercase alphanumeric + hyphens, 2-30 chars) */
  pattern?: RegExp;
  /** Use case-insensitive matching in database queries (default: false) */
  caseInsensitive?: boolean;
  /** Apply NFKC Unicode normalization during normalize() (default: true).
   *  Collapses full-width characters, ligatures, and compatibility forms to their canonical equivalents. */
  normalizeUnicode?: boolean;
  /** Allow purely numeric identifiers like "123" or "12-34" (default: true).
   *  Set to false to reject them, matching Twitter/X handle rules. */
  allowPurelyNumeric?: boolean;
  /** Custom error messages */
  messages?: {
    invalid?: string;
    reserved?: string | Record<string, string>;
    taken?: (sourceName: string) => string;
    /** Message shown when a purely numeric identifier is rejected (default: "Identifiers cannot be purely numeric.") */
    purelyNumeric?: string;
  };
  /** Async validation hooks — run after format/reserved checks, before DB */
  validators?: Array<(value: string) => Promise<{ available: false; message: string } | null>>;
  /** Enable conflict resolution suggestions when a slug is taken */
  suggest?: {
    /** Named strategy, array of strategies to compose, or custom generator function (default: `["sequential", "random-digits"]`) */
    strategy?: SuggestStrategyName | SuggestStrategyName[] | ((identifier: string) => string[]);
    /** Max suggestions to return (default: 3) */
    max?: number;
    /** @deprecated Use `strategy` instead. Custom generator function. */
    generate?: (identifier: string) => string[];
  };
  /** Enable in-memory caching of adapter lookups */
  cache?: {
    /** Time-to-live in milliseconds (default: 5000) */
    ttl?: number;
    /** Maximum number of cached entries before LRU eviction (default: 1000) */
    maxSize?: number;
  };
};

/** Options passed to adapter `findOne` calls. */
export type FindOneOptions = {
  /** Use case-insensitive matching */
  caseInsensitive?: boolean;
};

/** Database adapter interface — implement this for your ORM or query builder. */
export type NamespaceAdapter = {
  findOne: (
    source: NamespaceSource,
    value: string,
    options?: FindOneOptions
  ) => Promise<Record<string, unknown> | null>;
};

/** Key-value pairs identifying the current user's records, used to skip self-collisions. */
export type OwnershipScope = Record<string, string | null | undefined>;

/**
 * Result of a namespace availability check.
 * Either `{ available: true }` or an object with `reason`, `message`, and optional context.
 */
export type CheckResult =
  | { available: true }
  | {
      available: false;
      reason: "invalid" | "reserved" | "taken";
      message: string;
      source?: string;
      category?: string;
      suggestions?: string[];
    };

const DEFAULT_PATTERN = /^[a-z0-9][a-z0-9-]{1,29}$/;

const DEFAULT_MESSAGES = {
  invalid: "Use 2-30 lowercase letters, numbers, or hyphens.",
  reserved: "That name is reserved. Try another one.",
  taken: (source: string) => `That name is already in use.`,
};

/**
 * Determine the maximum string length accepted by a regex pattern.
 * Tests strings of decreasing length against the pattern using several character types.
 */
function extractMaxLength(pattern: RegExp): number {
  const testStrings = ["a", "1", "a1", "a-1"];
  let lo = 1;
  let hi = 100;
  let best = 30; // default fallback

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    let anyMatch = false;
    for (const chars of testStrings) {
      const s = chars.repeat(Math.ceil(mid / chars.length)).slice(0, mid);
      if (pattern.test(s)) {
        anyMatch = true;
        break;
      }
    }
    if (anyMatch) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/**
 * Create a default suggestion generator that's aware of the max identifier length.
 * Generates interleaved hyphenated and compact variants, plus truncated variants
 * for identifiers near the max length.
 */
function createDefaultSuggest(pattern: RegExp): (identifier: string) => string[] {
  const maxLen = extractMaxLength(pattern);

  return (identifier: string): string[] => {
    const seen = new Set<string>();
    const candidates: string[] = [];

    for (let i = 1; i <= 9; i++) {
      const hyphenated = `${identifier}-${i}`;
      if (hyphenated.length <= maxLen) {
        seen.add(hyphenated);
        candidates.push(hyphenated);
      }

      const compact = `${identifier}${i}`;
      if (compact.length <= maxLen) {
        seen.add(compact);
        candidates.push(compact);
      }
    }

    // Truncated variants for identifiers near max length
    if (identifier.length >= maxLen - 1) {
      for (let i = 1; i <= 9; i++) {
        const suffix = String(i);
        const truncated = identifier.slice(0, maxLen - suffix.length) + suffix;
        if (truncated !== identifier && !seen.has(truncated)) {
          seen.add(truncated);
          candidates.push(truncated);
        }
      }
    }

    return candidates;
  };
}

const SUFFIX_WORDS = ["dev", "io", "app", "hq", "pro", "team", "labs", "hub", "go", "one"];

/**
 * Create a strategy that generates random 3-4 digit suffixed candidates.
 */
function createRandomDigitsStrategy(pattern: RegExp): (identifier: string) => string[] {
  const maxLen = extractMaxLength(pattern);
  return (identifier: string): string[] => {
    const seen = new Set<string>();
    const candidates: string[] = [];
    for (let i = 0; i < 15; i++) {
      const digits = String(Math.floor(100 + Math.random() * 9900)); // 3-4 digit number
      const candidate = `${identifier}-${digits}`;
      if (candidate.length <= maxLen && !seen.has(candidate)) {
        seen.add(candidate);
        candidates.push(candidate);
      }
    }
    return candidates;
  };
}

/**
 * Create a strategy that appends word suffixes (e.g., sarah-dev, sarah-hq).
 */
function createSuffixWordsStrategy(pattern: RegExp): (identifier: string) => string[] {
  const maxLen = extractMaxLength(pattern);
  return (identifier: string): string[] => {
    const candidates: string[] = [];
    for (const word of SUFFIX_WORDS) {
      const candidate = `${identifier}-${word}`;
      if (candidate.length <= maxLen) {
        candidates.push(candidate);
      }
    }
    return candidates;
  };
}

/**
 * Create a strategy that generates short random alphanumeric suffixes (e.g., sarah-x7k).
 */
function createShortRandomStrategy(pattern: RegExp): (identifier: string) => string[] {
  const maxLen = extractMaxLength(pattern);
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return (identifier: string): string[] => {
    const seen = new Set<string>();
    const candidates: string[] = [];
    for (let i = 0; i < 10; i++) {
      let suffix = "";
      for (let j = 0; j < 3; j++) {
        suffix += chars[Math.floor(Math.random() * chars.length)];
      }
      const candidate = `${identifier}-${suffix}`;
      if (candidate.length <= maxLen && !seen.has(candidate)) {
        seen.add(candidate);
        candidates.push(candidate);
      }
    }
    return candidates;
  };
}

/**
 * Create a strategy that generates adjacent character swaps (e.g., sarha, sahra).
 */
function createScrambleStrategy(_pattern: RegExp): (identifier: string) => string[] {
  return (identifier: string): string[] => {
    const seen = new Set<string>();
    const candidates: string[] = [];
    const chars = identifier.split("");
    for (let i = 0; i < chars.length - 1; i++) {
      const swapped = [...chars];
      [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
      const candidate = swapped.join("");
      if (candidate !== identifier && !seen.has(candidate)) {
        seen.add(candidate);
        candidates.push(candidate);
      }
    }
    return candidates;
  };
}

/**
 * Create a strategy that generates cognitively similar names using
 * edit-distance-1 mutations: single-char deletions, keyboard-adjacent
 * substitutions (QWERTY layout), and common prefix/suffix additions.
 */
function createSimilarStrategy(pattern: RegExp): (identifier: string) => string[] {
  const maxLen = extractMaxLength(pattern);

  /* prettier-ignore */
  const nearby: Record<string, string> = {
    a: "sqwz", b: "vngh", c: "xdfv", d: "sfce", e: "wrd", f: "dgcv",
    g: "fhtb", h: "gjyn", i: "uko", j: "hknm", k: "jli", l: "kop",
    m: "njk", n: "bmhj", o: "ipl", p: "ol", q: "wa", r: "eft",
    s: "adwz", t: "rgy", u: "yij", v: "cfgb", w: "qase", x: "zsdc",
    y: "tuh", z: "xas",
    "0": "19", "1": "02", "2": "13", "3": "24", "4": "35",
    "5": "46", "6": "57", "7": "68", "8": "79", "9": "80",
  };

  const prefixes = ["the", "my", "x", "i"];
  const suffixes = ["x", "o", "i", "z"];

  return (identifier: string): string[] => {
    const seen = new Set<string>();
    const candidates: string[] = [];

    function add(c: string): void {
      if (
        c.length >= 2 &&
        c.length <= maxLen &&
        c !== identifier &&
        pattern.test(c) &&
        !seen.has(c)
      ) {
        seen.add(c);
        candidates.push(c);
      }
    }

    // Single-character deletions (edit distance 1)
    for (let i = 0; i < identifier.length; i++) {
      add(identifier.slice(0, i) + identifier.slice(i + 1));
    }

    // Single-character substitutions with keyboard-adjacent chars
    for (let i = 0; i < identifier.length; i++) {
      const ch = identifier[i];
      const neighbours = nearby[ch] ?? "";
      for (const n of neighbours) {
        add(identifier.slice(0, i) + n + identifier.slice(i + 1));
      }
    }

    // Common prefix additions
    for (const p of prefixes) {
      add(p + identifier);
    }

    // Common suffix additions
    for (const s of suffixes) {
      add(identifier + s);
    }

    return candidates;
  };
}

/**
 * Create a generator for a named strategy.
 */
function createStrategy(name: SuggestStrategyName, pattern: RegExp): (identifier: string) => string[] {
  switch (name) {
    case "sequential":
      return createDefaultSuggest(pattern);
    case "random-digits":
      return createRandomDigitsStrategy(pattern);
    case "suffix-words":
      return createSuffixWordsStrategy(pattern);
    case "short-random":
      return createShortRandomStrategy(pattern);
    case "scramble":
      return createScrambleStrategy(pattern);
    case "similar":
      return createSimilarStrategy(pattern);
  }
}

/**
 * Resolve a generator function from the suggest config.
 * Legacy `generate` callback takes priority for backwards compatibility.
 */
function resolveGenerator(
  suggest: NamespaceConfig["suggest"],
  pattern: RegExp
): (identifier: string) => string[] {
  // Legacy: generate callback takes priority for backwards compat
  if (suggest?.generate) return suggest.generate;

  const strategyInput = suggest?.strategy ?? ["sequential", "random-digits"];

  // Custom function
  if (typeof strategyInput === "function") return strategyInput;

  // Single or array of named strategies
  const names = Array.isArray(strategyInput) ? strategyInput : [strategyInput];
  const generators = names.map((name) => createStrategy(name, pattern));

  if (generators.length === 1) return generators[0];

  // Compose: round-robin interleave candidates
  return (identifier: string): string[] => {
    const lists = generators.map((g) => g(identifier));
    const seen = new Set<string>();
    const result: string[] = [];
    const maxListLen = Math.max(...lists.map((l) => l.length));
    for (let i = 0; i < maxListLen; i++) {
      for (const list of lists) {
        if (i < list.length && !seen.has(list[i])) {
          seen.add(list[i]);
          result.push(list[i]);
        }
      }
    }
    return result;
  };
}

/**
 * Normalize a raw identifier: trims whitespace, applies NFKC Unicode normalization,
 * lowercases, and strips leading `@` symbols.
 *
 * NFKC normalization collapses full-width characters, ligatures, superscripts,
 * and other compatibility forms to their canonical equivalents. This is a no-op
 * for ASCII-only input.
 *
 * @param raw - The raw user input
 * @param options - Optional settings
 * @param options.unicode - Apply NFKC Unicode normalization (default: true)
 * @returns The normalized identifier
 *
 * @example
 * ```ts
 * normalize("  @Sarah  "); // "sarah"
 * normalize("ACME-Corp");  // "acme-corp"
 * normalize("\uff48\uff45\uff4c\uff4c\uff4f"); // "hello" (full-width → ASCII)
 * ```
 */
export function normalize(raw: string, options?: { unicode?: boolean }): string {
  const trimmed = raw.trim();
  const nfkc = (options?.unicode ?? true) ? trimmed.normalize("NFKC") : trimmed;
  return nfkc.toLowerCase().replace(/^@+/, "");
}

/**
 * Create a validator that rejects identifiers containing profanity or offensive words.
 *
 * Supply your own word list — no words are bundled with the library.
 * The returned function is compatible with `config.validators`.
 *
 * @param words - Array of words to block
 * @param options - Optional settings
 * @param options.message - Custom rejection message (default: "That name is not allowed.")
 * @param options.checkSubstrings - Check if identifier contains a blocked word as a substring (default: true)
 * @returns An async validator function for use in `config.validators`
 *
 * @example
 * ```ts
 * const guard = createNamespaceGuard({
 *   reserved: ["admin"],
 *   sources: [{ name: "user", column: "handle" }],
 *   validators: [
 *     createProfanityValidator(["badword", "offensive"], {
 *       message: "Please choose an appropriate name.",
 *     }),
 *   ],
 * }, adapter);
 * ```
 */
export function createProfanityValidator(
  words: string[],
  options?: { message?: string; checkSubstrings?: boolean }
): (value: string) => Promise<{ available: false; message: string } | null> {
  const message = options?.message ?? "That name is not allowed.";
  const checkSubstrings = options?.checkSubstrings ?? true;
  const wordSet = new Set(words.map((w) => w.toLowerCase()));

  // Pre-compile regex for O(len) substring matching instead of O(words × len)
  const substringRegex =
    checkSubstrings && wordSet.size > 0
      ? new RegExp(
          Array.from(wordSet)
            .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join("|")
        )
      : null;

  return async (value: string) => {
    const normalized = value.toLowerCase();

    if (wordSet.has(normalized)) {
      return { available: false, message };
    }

    if (substringRegex && substringRegex.test(normalized)) {
      return { available: false, message };
    }

    return null;
  };
}

/**
 * Mapping of visually confusable Unicode characters to their Latin/digit equivalents.
 * Generated from Unicode TR39 confusables.txt + supplemental Latin small capitals.
 * Covers every single-character mapping to a lowercase Latin letter or digit,
 * excluding characters already handled by NFKC normalization (either collapsed
 * to the same target, or mapped to a different valid Latin char/digit).
 * Regenerate: `npx tsx scripts/generate-confusables.ts`
 */
/* prettier-ignore */
export const CONFUSABLE_MAP: Record<string, string> = {
  // Latin-1 Supplement (2)
  "\u00d7": "x", "\u00fe": "p",
  // Latin Extended-A (1)
  "\u0131": "i",
  // Latin Extended-B (14)
  "\u0184": "b", "\u018d": "g", "\u0192": "f", "\u0196": "l",
  "\u01a6": "r", "\u01a7": "2", "\u01b7": "3", "\u01bc": "5",
  "\u01bd": "s", "\u01bf": "p", "\u01c0": "l", "\u021c": "3",
  "\u0222": "8", "\u0223": "8",
  // IPA Extensions (8)
  "\u0251": "a", "\u0261": "g", "\u0263": "y", "\u0269": "i",
  "\u026a": "i", "\u026f": "w", "\u028b": "u", "\u028f": "y",
  // Spacing Modifier Letters (1)
  "\u02db": "i",
  // Greek and Coptic (35)
  "\u037a": "i", "\u037f": "j", "\u0391": "a", "\u0392": "b",
  "\u0395": "e", "\u0396": "z", "\u0397": "h", "\u0399": "l",
  "\u039a": "k", "\u039c": "m", "\u039d": "n", "\u039f": "o",
  "\u03a1": "p", "\u03a4": "t", "\u03a5": "y", "\u03a7": "x",
  "\u03b1": "a", "\u03b3": "y", "\u03b9": "i", "\u03bd": "v",
  "\u03bf": "o", "\u03c1": "p", "\u03c3": "o", "\u03c5": "u",
  "\u03d2": "y", "\u03dc": "f", "\u03e8": "2", "\u03ec": "6",
  "\u03ed": "o", "\u03f1": "p", "\u03f2": "c", "\u03f3": "j",
  "\u03f8": "p", "\u03f9": "c", "\u03fa": "m",
  // Cyrillic (40)
  "\u0405": "s", "\u0406": "l", "\u0408": "j", "\u0410": "a",
  "\u0412": "b", "\u0415": "e", "\u0417": "3", "\u041a": "k",
  "\u041c": "m", "\u041d": "h", "\u041e": "o", "\u0420": "p",
  "\u0421": "c", "\u0422": "t", "\u0423": "y", "\u0425": "x",
  "\u042c": "b", "\u0430": "a", "\u0431": "6", "\u0433": "r",
  "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c",
  "\u0443": "y", "\u0445": "x", "\u0448": "w", "\u0455": "s",
  "\u0456": "i", "\u0458": "j", "\u0461": "w", "\u0474": "v",
  "\u0475": "v", "\u04ae": "y", "\u04af": "y", "\u04bb": "h",
  "\u04bd": "e", "\u04c0": "l", "\u04cf": "l", "\u04e0": "3",
  // Cyrillic Supplement (5)
  "\u0501": "d", "\u050c": "g", "\u051b": "q", "\u051c": "w",
  "\u051d": "w",
  // Armenian (14)
  "\u054d": "u", "\u054f": "s", "\u0555": "o", "\u0561": "w",
  "\u0563": "q", "\u0566": "q", "\u0570": "h", "\u0578": "n",
  "\u057c": "n", "\u057d": "u", "\u0581": "g", "\u0582": "i",
  "\u0584": "f", "\u0585": "o",
  // Hebrew (5)
  "\u05c0": "l", "\u05d5": "l", "\u05d8": "v", "\u05df": "l", "\u05e1": "o",
  // Arabic (13)
  "\u0627": "l", "\u0647": "o", "\u0661": "l", "\u0665": "o",
  "\u0667": "v", "\u06be": "o", "\u06c1": "o", "\u06d5": "o",
  "\u06f1": "l", "\u06f5": "o", "\u06f7": "v",
  "\u07c0": "o", "\u07ca": "l",
  // Indic (20)
  "\u0966": "o", "\u0969": "3", "\u09e6": "o", "\u09ea": "8",
  "\u09ed": "9", "\u0a66": "o", "\u0a67": "9", "\u0a6a": "8",
  "\u0ae6": "o", "\u0ae9": "3", "\u0b03": "8", "\u0b20": "o",
  "\u0b66": "o", "\u0b68": "9", "\u0be6": "o", "\u0c02": "o",
  "\u0c66": "o", "\u0c82": "o", "\u0ce6": "o", "\u0d02": "o",
  // Malayalam / Sinhala (5)
  "\u0d1f": "s", "\u0d20": "o", "\u0d66": "o", "\u0d6d": "9", "\u0d82": "o",
  // Thai / Lao (2)
  "\u0e50": "o", "\u0ed0": "o",
  // Myanmar (4)
  "\u1004": "c", "\u101d": "o", "\u1040": "o", "\u105a": "c",
  // Georgian (2)
  "\u10e7": "y", "\u10ff": "o",
  // Ethiopic (2)
  "\u1200": "u", "\u12d0": "o",
  // Cherokee (30)
  "\u13a0": "d", "\u13a1": "r", "\u13a2": "t", "\u13a5": "i",
  "\u13a9": "y", "\u13aa": "a", "\u13ab": "j", "\u13ac": "e",
  "\u13b3": "w", "\u13b7": "m", "\u13bb": "h", "\u13bd": "y",
  "\u13c0": "g", "\u13c2": "h", "\u13c3": "z", "\u13ce": "4",
  "\u13cf": "b", "\u13d2": "r", "\u13d4": "w", "\u13d5": "s",
  "\u13d9": "v", "\u13da": "s", "\u13de": "l", "\u13df": "c",
  "\u13e2": "p", "\u13e6": "k", "\u13e7": "d", "\u13ee": "6",
  "\u13f3": "g", "\u13f4": "b",
  // Canadian Aboriginal Syllabics (21)
  "\u142f": "v", "\u144c": "u", "\u146d": "p", "\u146f": "d",
  "\u1472": "b", "\u148d": "j", "\u14aa": "l", "\u14bf": "2",
  "\u1541": "x", "\u157c": "h", "\u157d": "x", "\u1587": "r",
  "\u15af": "b", "\u15b4": "f", "\u15c5": "a", "\u15de": "d",
  "\u15ea": "d", "\u15f0": "m", "\u15f7": "b", "\u166d": "x",
  "\u166e": "x",
  // Runic (4)
  "\u16b7": "x", "\u16c1": "l", "\u16d5": "k", "\u16d6": "m",
  // Khmer (1)
  "\u17e0": "o",
  // Phonetic Extensions / Latin Small Capitals (16)
  "\u1d00": "a", "\u1d04": "c", "\u1d05": "d", "\u1d07": "e",
  "\u1d0a": "j", "\u1d0b": "k", "\u1d0d": "m", "\u1d0f": "o",
  "\u1d11": "o", "\u1d18": "p", "\u1d1b": "t", "\u1d1c": "u",
  "\u1d20": "v", "\u1d21": "w", "\u1d22": "z", "\u1d26": "r",
  // Phonetic Extensions Supplement (2)
  "\u1d83": "g", "\u1d8c": "y",
  // Latin Extended Additional (2)
  "\u1e9d": "f", "\u1eff": "y",
  // Greek Extended (1)
  "\u1fbe": "i",
  // Letterlike Symbols (2)
  "\u212e": "e", "\u213d": "y",
  // Mathematical Operators (7)
  "\u2223": "l", "\u2228": "v", "\u222a": "u", "\u22a4": "t",
  "\u22c1": "v", "\u22c3": "u", "\u22ff": "e",
  // Miscellaneous Technical (4)
  "\u2373": "i", "\u2374": "p", "\u237a": "a", "\u23fd": "l",
  // Box Drawing (1)
  "\u2573": "x",
  // Miscellaneous Mathematical Symbols (3)
  "\u27d9": "t", "\u292b": "x", "\u292c": "x",
  // Supplemental Mathematical Operators (1)
  "\u2a2f": "x",
  // Coptic (28)
  "\u2c82": "b", "\u2c85": "r", "\u2c8e": "h", "\u2c92": "l",
  "\u2c93": "i", "\u2c94": "k", "\u2c98": "m", "\u2c9a": "n",
  "\u2c9c": "3", "\u2c9e": "o", "\u2c9f": "o", "\u2ca2": "p",
  "\u2ca3": "p", "\u2ca4": "c", "\u2ca5": "c", "\u2ca6": "t",
  "\u2ca8": "y", "\u2ca9": "y", "\u2cac": "x", "\u2cbd": "w",
  "\u2cc4": "3", "\u2cca": "9", "\u2ccb": "9", "\u2ccc": "3",
  "\u2cce": "p", "\u2ccf": "p", "\u2cd0": "l", "\u2cd2": "6",
  // Coptic Supplement (2)
  "\u2cd3": "6", "\u2cdc": "6",
  // Tifinagh (6)
  "\u2d38": "v", "\u2d39": "e", "\u2d4f": "l", "\u2d54": "o",
  "\u2d55": "q", "\u2d5d": "x",
  // CJK Symbols (1)
  "\u3007": "o",
  // Lisu (25)
  "\ua4d0": "b", "\ua4d1": "p", "\ua4d2": "d", "\ua4d3": "d",
  "\ua4d4": "t", "\ua4d6": "g", "\ua4d7": "k", "\ua4d9": "j",
  "\ua4da": "c", "\ua4dc": "z", "\ua4dd": "f", "\ua4df": "m",
  "\ua4e0": "n", "\ua4e1": "l", "\ua4e2": "s", "\ua4e3": "r",
  "\ua4e6": "v", "\ua4e7": "h", "\ua4ea": "w", "\ua4eb": "x",
  "\ua4ec": "y", "\ua4ee": "a", "\ua4f0": "e", "\ua4f2": "l",
  "\ua4f3": "o", "\ua4f4": "u",
  // Cyrillic Extended-B (2)
  "\ua644": "2", "\ua647": "i",
  // Bamum (2)
  "\ua6df": "v", "\ua6ef": "2",
  // Latin Extended-D (11)
  "\ua731": "s", "\ua75a": "2", "\ua76a": "3", "\ua76e": "9",
  "\ua798": "f", "\ua799": "f", "\ua79f": "u", "\ua7ab": "3",
  "\ua7b2": "j", "\ua7b3": "x", "\ua7b4": "b",
  // Latin Extended-E (8)
  "\uab32": "e", "\uab35": "f", "\uab3d": "o", "\uab47": "r",
  "\uab48": "r", "\uab4e": "u", "\uab52": "u", "\uab5a": "y",
  // Cherokee Supplement (7)
  "\uab75": "i", "\uab81": "r", "\uab83": "w", "\uab93": "z",
  "\uaba9": "v", "\uabaa": "s", "\uabaf": "c",
  // Arabic Presentation Forms (14)
  "\ufba6": "o", "\ufba7": "o", "\ufba8": "o", "\ufba9": "o",
  "\ufbaa": "o", "\ufbab": "o", "\ufbac": "o", "\ufbad": "o",
  "\ufe8d": "l", "\ufe8e": "l", "\ufee9": "o", "\ufeea": "o",
  "\ufeeb": "o", "\ufeec": "o",
  // Halfwidth and Fullwidth Forms (1)
  "\uffe8": "l",
  // Lycian (9)
  "\u{10282}": "b", "\u{10286}": "e", "\u{10287}": "f", "\u{1028a}": "l",
  "\u{10290}": "x", "\u{10292}": "o", "\u{10295}": "p", "\u{10296}": "s",
  "\u{10297}": "t",
  // Carian (11)
  "\u{102a0}": "a", "\u{102a1}": "b", "\u{102a2}": "c", "\u{102a5}": "f",
  "\u{102ab}": "o", "\u{102b0}": "m", "\u{102b1}": "t", "\u{102b2}": "y",
  "\u{102b4}": "x", "\u{102cf}": "h", "\u{102f5}": "z",
  // Old Italic (10)
  "\u{10301}": "b", "\u{10302}": "c", "\u{10309}": "l", "\u{10311}": "m",
  "\u{10315}": "t", "\u{10317}": "x", "\u{1031a}": "8", "\u{10320}": "l",
  "\u{10322}": "x",
  // Deseret (7)
  "\u{10404}": "o", "\u{10415}": "c", "\u{1041b}": "l", "\u{10420}": "s",
  "\u{1042c}": "o", "\u{1043d}": "c", "\u{10448}": "s",
  // Osage (6)
  "\u{104b4}": "r", "\u{104c2}": "o", "\u{104ce}": "u", "\u{104d2}": "7",
  "\u{104ea}": "o", "\u{104f6}": "u",
  // Elbasan (8)
  "\u{10513}": "n", "\u{10516}": "o", "\u{10518}": "k", "\u{1051c}": "c",
  "\u{1051d}": "v", "\u{10525}": "f", "\u{10526}": "l", "\u{10527}": "x",
  // Tirhuta (1)
  "\u{114d0}": "o",
  // Ahom (4)
  "\u{11706}": "v", "\u{1170a}": "w", "\u{1170e}": "w", "\u{1170f}": "w",
  // Warang Citi (35)
  "\u{118a0}": "v", "\u{118a2}": "f", "\u{118a3}": "l", "\u{118a4}": "y",
  "\u{118a6}": "e", "\u{118a9}": "z", "\u{118ac}": "9", "\u{118ae}": "e",
  "\u{118af}": "4", "\u{118b2}": "l", "\u{118b5}": "o", "\u{118b8}": "u",
  "\u{118bb}": "5", "\u{118bc}": "t", "\u{118c0}": "v", "\u{118c1}": "s",
  "\u{118c2}": "f", "\u{118c3}": "i", "\u{118c4}": "z", "\u{118c6}": "7",
  "\u{118c8}": "o", "\u{118ca}": "3", "\u{118cc}": "9", "\u{118d5}": "6",
  "\u{118d6}": "9", "\u{118d7}": "o", "\u{118d8}": "u", "\u{118dc}": "y",
  "\u{118e0}": "o", "\u{118e5}": "z", "\u{118e6}": "w", "\u{118e9}": "c",
  "\u{118ec}": "x", "\u{118ef}": "w", "\u{118f2}": "c",
  // Masaram Gondi (3)
  "\u{11dda}": "l", "\u{11de0}": "o", "\u{11de1}": "l",
  // Medefaidrin (2)
  "\u{16eaa}": "l", "\u{16eb6}": "b",
  // Miao (12)
  "\u{16f08}": "v", "\u{16f0a}": "t", "\u{16f16}": "l", "\u{16f28}": "l",
  "\u{16f35}": "r", "\u{16f3a}": "s", "\u{16f3b}": "3", "\u{16f40}": "a",
  "\u{16f42}": "u", "\u{16f43}": "y",
  // Greek Musical Notation (6)
  "\u{1d206}": "3", "\u{1d20d}": "v", "\u{1d212}": "7", "\u{1d213}": "f",
  "\u{1d216}": "r", "\u{1d22a}": "l",
  // Mathematical Alphanumeric Symbols (117)
  "\u{1d6a4}": "i", "\u{1d6a8}": "a", "\u{1d6a9}": "b", "\u{1d6ac}": "e",
  "\u{1d6ad}": "z", "\u{1d6ae}": "h", "\u{1d6b0}": "l", "\u{1d6b1}": "k",
  "\u{1d6b3}": "m", "\u{1d6b4}": "n", "\u{1d6b6}": "o", "\u{1d6b8}": "p",
  "\u{1d6bb}": "t", "\u{1d6bc}": "y", "\u{1d6be}": "x", "\u{1d6c2}": "a",
  "\u{1d6c4}": "y", "\u{1d6ca}": "i", "\u{1d6ce}": "v", "\u{1d6d0}": "o",
  "\u{1d6d2}": "p", "\u{1d6d4}": "o", "\u{1d6d6}": "u", "\u{1d6e0}": "p",
  "\u{1d6e2}": "a", "\u{1d6e3}": "b", "\u{1d6e6}": "e", "\u{1d6e7}": "z",
  "\u{1d6e8}": "h", "\u{1d6ea}": "l", "\u{1d6eb}": "k", "\u{1d6ed}": "m",
  "\u{1d6ee}": "n", "\u{1d6f0}": "o", "\u{1d6f2}": "p", "\u{1d6f5}": "t",
  "\u{1d6f6}": "y", "\u{1d6f8}": "x", "\u{1d6fc}": "a", "\u{1d6fe}": "y",
  "\u{1d704}": "i", "\u{1d708}": "v", "\u{1d70a}": "o", "\u{1d70c}": "p",
  "\u{1d70e}": "o", "\u{1d710}": "u", "\u{1d71a}": "p", "\u{1d71c}": "a",
  "\u{1d71d}": "b", "\u{1d720}": "e", "\u{1d721}": "z", "\u{1d722}": "h",
  "\u{1d724}": "l", "\u{1d725}": "k", "\u{1d727}": "m", "\u{1d728}": "n",
  "\u{1d72a}": "o", "\u{1d72c}": "p", "\u{1d72f}": "t", "\u{1d730}": "y",
  "\u{1d732}": "x", "\u{1d736}": "a", "\u{1d738}": "y", "\u{1d73e}": "i",
  "\u{1d742}": "v", "\u{1d744}": "o", "\u{1d746}": "p", "\u{1d748}": "o",
  "\u{1d74a}": "u", "\u{1d754}": "p", "\u{1d756}": "a", "\u{1d757}": "b",
  "\u{1d75a}": "e", "\u{1d75b}": "z", "\u{1d75c}": "h", "\u{1d75e}": "l",
  "\u{1d75f}": "k", "\u{1d761}": "m", "\u{1d762}": "n", "\u{1d764}": "o",
  "\u{1d766}": "p", "\u{1d769}": "t", "\u{1d76a}": "y", "\u{1d76c}": "x",
  "\u{1d770}": "a", "\u{1d772}": "y", "\u{1d778}": "i", "\u{1d77c}": "v",
  "\u{1d77e}": "o", "\u{1d780}": "p", "\u{1d782}": "o", "\u{1d784}": "u",
  "\u{1d78e}": "p", "\u{1d790}": "a", "\u{1d791}": "b", "\u{1d794}": "e",
  "\u{1d795}": "z", "\u{1d796}": "h", "\u{1d798}": "l", "\u{1d799}": "k",
  "\u{1d79b}": "m", "\u{1d79c}": "n", "\u{1d79e}": "o", "\u{1d7a0}": "p",
  "\u{1d7a3}": "t", "\u{1d7a4}": "y", "\u{1d7a6}": "x", "\u{1d7aa}": "a",
  "\u{1d7ac}": "y", "\u{1d7b2}": "i", "\u{1d7b6}": "v", "\u{1d7b8}": "o",
  "\u{1d7ba}": "p", "\u{1d7bc}": "o", "\u{1d7be}": "u", "\u{1d7c8}": "p",
  "\u{1d7ca}": "f",
  // Mende Kikakui (2)
  "\u{1e8c7}": "l", "\u{1e8cb}": "8",
  // Arabic Mathematical Alphabetic Symbols (5)
  "\u{1ee00}": "l", "\u{1ee24}": "o", "\u{1ee64}": "o", "\u{1ee80}": "l", "\u{1ee84}": "o",
  // Miscellaneous Symbols and Pictographs (2)
  "\u{1f74c}": "c", "\u{1f768}": "t",
};

/**
 * Create a validator that rejects identifiers containing homoglyph/confusable characters.
 *
 * Catches spoofing attacks where characters from other scripts are substituted for
 * visually identical Latin characters (e.g., Cyrillic "а" for Latin "a" in "admin").
 * Uses a comprehensive mapping of 613 character pairs generated from Unicode TR39
 * confusables.txt, covering Cyrillic, Greek, Armenian, Cherokee, IPA, Latin small
 * capitals, Canadian Syllabics, Georgian, Lisu, Coptic, and many other scripts.
 *
 * @param options - Optional settings
 * @param options.message - Custom rejection message (default: "That name contains characters that could be confused with other letters.")
 * @param options.additionalMappings - Extra confusable pairs to merge with the built-in map
 * @param options.rejectMixedScript - Also reject identifiers that mix Latin with non-Latin characters from any covered script (Cyrillic, Greek, Armenian, Hebrew, Arabic, Georgian, Cherokee, Canadian Syllabics, Ethiopic, Coptic, Lisu, and more) (default: false)
 * @returns An async validator function for use in `config.validators`
 *
 * @example
 * ```ts
 * const guard = createNamespaceGuard({
 *   sources: [{ name: "user", column: "handle" }],
 *   validators: [
 *     createHomoglyphValidator(),
 *   ],
 * }, adapter);
 * ```
 */
export function createHomoglyphValidator(options?: {
  message?: string;
  additionalMappings?: Record<string, string>;
  rejectMixedScript?: boolean;
}): (value: string) => Promise<{ available: false; message: string } | null> {
  const message =
    options?.message ??
    "That name contains characters that could be confused with other letters.";
  const rejectMixedScript = options?.rejectMixedScript ?? false;

  // Merge built-in + user-supplied mappings
  const map: Record<string, string> = { ...CONFUSABLE_MAP };
  if (options?.additionalMappings) {
    Object.assign(map, options.additionalMappings);
  }

  // Pre-build a regex character class from all confusable keys for O(1) detection.
  // Escape chars that are special inside [...]: \ ] ^ -
  const confusableChars = Object.keys(map);
  const confusableRegex =
    confusableChars.length > 0
      ? new RegExp(
          "[" +
            confusableChars
              .map((c) => c.replace(/[\\\]^-]/g, "\\$&"))
              .join("") +
            "]"
        )
      : null;

  // Script detection for mixed-script analysis
  // Covers all non-Latin scripts present in CONFUSABLE_MAP:
  // Greek, Cyrillic, Armenian, Hebrew, Arabic (+Thaana), Indic (Devanagari–Sinhala),
  // Thai/Lao, Myanmar, Georgian, Ethiopic, Cherokee, Canadian Syllabics,
  // Runic, Khmer, Coptic, Tifinagh, Lisu, Bamum, Cherokee Supplement
  const nonLatinRegex = /[\u0370-\u03FF\u0400-\u04FF\u0500-\u052F\u0530-\u058F\u0590-\u05FF\u0600-\u074F\u0900-\u0DFF\u0E00-\u0EFF\u1000-\u109F\u10A0-\u10FF\u1200-\u137F\u13A0-\u13FF\u1400-\u167F\u16A0-\u16FF\u1780-\u17FF\u2C80-\u2CFF\u2D30-\u2D7F\uA4D0-\uA4FF\uA6A0-\uA6FF\uAB70-\uABBF]/;
  const latinRegex = /[a-zA-Z]/;

  return async (value: string) => {
    // Check 1: Any confusable character present → reject
    if (confusableRegex && confusableRegex.test(value)) {
      return { available: false, message };
    }

    // Check 2: Mixed-script detection (optional)
    if (rejectMixedScript) {
      const hasLatin = latinRegex.test(value);
      const hasNonLatin = nonLatinRegex.test(value);
      if (hasLatin && hasNonLatin) {
        return { available: false, message };
      }
    }

    return null;
  };
}

/**
 * Build the reserved name map from config
 */
function buildReservedMap(
  reserved: NamespaceConfig["reserved"]
): Map<string, string> {
  const map = new Map<string, string>();

  if (!reserved) return map;

  if (reserved instanceof Set) {
    for (const name of reserved) map.set(name, "default");
  } else if (Array.isArray(reserved)) {
    for (const name of reserved) map.set(name, "default");
  } else {
    for (const [category, names] of Object.entries(reserved)) {
      for (const name of names) map.set(name, category);
    }
  }

  return map;
}

/**
 * Create a namespace guard instance for checking slug/handle uniqueness
 * across multiple database tables with reserved name protection.
 *
 * @param config - Reserved names, data sources, validation pattern, and optional features
 * @param adapter - Database adapter implementing the `findOne` lookup (use a built-in adapter or write your own)
 * @returns A guard with `check`, `checkMany`, `assertAvailable`, `validateFormat`, `clearCache`, and `cacheStats` methods
 *
 * @example
 * ```ts
 * import { createNamespaceGuard } from "namespace-guard";
 * import { createPrismaAdapter } from "namespace-guard/adapters/prisma";
 *
 * const guard = createNamespaceGuard(
 *   {
 *     reserved: ["admin", "api", "settings"],
 *     sources: [
 *       { name: "user", column: "handle", scopeKey: "id" },
 *       { name: "organization", column: "slug", scopeKey: "id" },
 *     ],
 *   },
 *   createPrismaAdapter(prisma)
 * );
 *
 * const result = await guard.check("my-slug");
 * if (result.available) {
 *   // safe to use
 * }
 * ```
 */
export function createNamespaceGuard(config: NamespaceConfig, adapter: NamespaceAdapter) {
  const reservedMap = buildReservedMap(config.reserved);

  const pattern = config.pattern ?? DEFAULT_PATTERN;
  const configMessages = config.messages ?? {};
  const defaultReservedMsg = DEFAULT_MESSAGES.reserved;
  const invalidMsg = (configMessages.invalid as string) ?? DEFAULT_MESSAGES.invalid;
  const takenMsg = (configMessages.taken as ((s: string) => string)) ?? DEFAULT_MESSAGES.taken;

  const validators = config.validators ?? [];
  const normalizeOpts = { unicode: config.normalizeUnicode ?? true };
  const allowPurelyNumeric = config.allowPurelyNumeric ?? true;
  const purelyNumericMsg =
    (configMessages as Record<string, unknown>).purelyNumeric as string ??
    "Identifiers cannot be purely numeric.";

  // In-memory cache for adapter lookups
  const cacheEnabled = !!config.cache;
  const cacheTtl = config.cache?.ttl ?? 5000;
  const cacheMaxSize = config.cache?.maxSize ?? 1000;
  const cacheMap = new Map<string, { promise: Promise<Record<string, unknown> | null>; expires: number }>();
  let cacheHits = 0;
  let cacheMisses = 0;

  function cachedFindOne(
    source: NamespaceSource,
    value: string,
    options?: FindOneOptions
  ): Promise<Record<string, unknown> | null> {
    if (!cacheEnabled) return adapter.findOne(source, value, options);

    const key = `${source.name}:${value}:${options?.caseInsensitive ? "i" : "s"}`;
    const now = Date.now();
    const cached = cacheMap.get(key);

    if (cached && cached.expires > now) {
      cacheHits++;
      // LRU: move to end of Map (most recently used)
      cacheMap.delete(key);
      cacheMap.set(key, cached);
      return cached.promise;
    }

    cacheMisses++;

    // Evict oldest entries when cache exceeds max size
    if (cacheMap.size >= cacheMaxSize) {
      const firstKey = cacheMap.keys().next().value as string;
      cacheMap.delete(firstKey);
    }

    const promise = adapter.findOne(source, value, options);
    cacheMap.set(key, { promise, expires: now + cacheTtl });
    return promise;
  }

  function getReservedMessage(category: string): string {
    const rm = configMessages.reserved;
    if (typeof rm === "string") return rm;
    if (rm && typeof rm === "object") return rm[category] ?? defaultReservedMsg;
    return defaultReservedMsg;
  }

  /**
   * Validate an identifier's format and reserved status without querying the database.
   *
   * @param identifier - The raw identifier to validate
   * @returns An error message string if invalid/reserved, or `null` if the format is OK
   */
  function validateFormat(identifier: string): string | null {
    const normalized = normalize(identifier, normalizeOpts);

    if (!pattern.test(normalized)) {
      return invalidMsg;
    }

    if (!allowPurelyNumeric && /^\d+(-\d+)*$/.test(normalized)) {
      return purelyNumericMsg;
    }

    if (reservedMap.has(normalized)) {
      return getReservedMessage(reservedMap.get(normalized)!);
    }

    return null;
  }

  /** Returns true if the caller owns this record (not a collision). */
  function isOwnedByScope(
    existing: Record<string, unknown>,
    source: NamespaceSource,
    scope: OwnershipScope
  ): boolean {
    if (!source.scopeKey) return false;
    const scopeValue = scope[source.scopeKey];
    const idColumn = source.idColumn ?? "id";
    const existingId = existing[idColumn];
    return !!(scopeValue && existingId && scopeValue === String(existingId));
  }

  /**
   * Check if a value is available in the database only (no format/reserved/validator checks).
   * Used by the suggestion pipeline to avoid redundant cheap checks.
   */
  async function checkDbOnly(value: string, scope: OwnershipScope): Promise<boolean> {
    const findOptions: FindOneOptions | undefined = config.caseInsensitive
      ? { caseInsensitive: true }
      : undefined;

    const checks = config.sources.map(async (source) => {
      const existing = await cachedFindOne(source, value, findOptions);
      if (!existing) return null;
      if (isOwnedByScope(existing, source, scope)) return null;
      return source.name;
    });

    const results = await Promise.all(checks);
    return !results.some((r) => r !== null);
  }

  /**
   * Check if an identifier is available across all configured sources.
   * Runs format validation, reserved check, async validators, and database lookups.
   *
   * @param identifier - The raw identifier to check (will be normalized)
   * @param scope - Ownership scope to exclude the caller's own records from collision detection
   * @param options - Internal options (e.g., `skipSuggestions` to prevent recursion)
   * @returns `{ available: true }` or `{ available: false, reason, message, ... }`
   */
  async function check(
    identifier: string,
    scope: OwnershipScope = {},
    options?: { skipSuggestions?: boolean }
  ): Promise<CheckResult> {
    const normalized = normalize(identifier, normalizeOpts);

    // Format validation
    if (!pattern.test(normalized)) {
      return { available: false, reason: "invalid", message: invalidMsg };
    }

    // Purely numeric check
    if (!allowPurelyNumeric && /^\d+(-\d+)*$/.test(normalized)) {
      return { available: false, reason: "invalid", message: purelyNumericMsg };
    }

    // Reserved check
    const reservedCategory = reservedMap.get(normalized);
    if (reservedCategory) {
      return {
        available: false,
        reason: "reserved",
        message: getReservedMessage(reservedCategory),
        category: reservedCategory,
      };
    }

    // Async validators
    for (const validator of validators) {
      try {
        const rejection = await validator(normalized);
        if (rejection) {
          return { available: false, reason: "invalid", message: rejection.message };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Validation failed.";
        return { available: false, reason: "invalid", message };
      }
    }

    // Check each source for collisions
    const findOptions: FindOneOptions | undefined = config.caseInsensitive
      ? { caseInsensitive: true }
      : undefined;

    const checks = config.sources.map(async (source) => {
      const existing = await cachedFindOne(source, normalized, findOptions);
      if (!existing) return null;
      if (isOwnedByScope(existing, source, scope)) return null;
      return source.name;
    });

    const results = await Promise.all(checks);
    const collision = results.find((r) => r !== null);

    if (collision) {
      const result: CheckResult = {
        available: false,
        reason: "taken",
        message: takenMsg(collision),
        source: collision,
      };

      // Generate suggestions using progressive batched pipeline
      if (config.suggest && !options?.skipSuggestions) {
        const generate = resolveGenerator(config.suggest, pattern);
        const max = config.suggest.max ?? 3;
        const candidates = generate(normalized);
        const suggestions: string[] = [];

        // Phase 1: Cheap sync filter — format + reserved + purely-numeric
        const passedSync = candidates.filter(
          (c) =>
            pattern.test(c) &&
            !reservedMap.has(c) &&
            (allowPurelyNumeric || !/^\d+(-\d+)*$/.test(c))
        );

        // Phase 2+3: Progressive batches — validate + DB-check in batches of `max`
        for (
          let i = 0;
          i < passedSync.length && suggestions.length < max;
          i += max
        ) {
          const batch = passedSync.slice(i, i + max);

          // Validate batch (parallel, only if validators exist)
          let validated = batch;
          if (validators.length > 0) {
            const validationResults = await Promise.all(
              batch.map(async (c) => {
                for (const validator of validators) {
                  try {
                    const rejection = await validator(c);
                    if (rejection) return null;
                  } catch {
                    return null;
                  }
                }
                return c;
              })
            );
            validated = validationResults.filter(
              (c): c is string => c !== null
            );
          }

          // DB check survivors (parallel within batch)
          if (validated.length > 0) {
            const dbResults = await Promise.all(
              validated.map(async (c) => ({
                candidate: c,
                available: await checkDbOnly(c, scope),
              }))
            );
            for (const { candidate, available } of dbResults) {
              if (suggestions.length >= max) break;
              if (available) suggestions.push(candidate);
            }
          }
        }

        if (suggestions.length > 0) {
          result.suggestions = suggestions;
        }
      }

      return result;
    }

    return { available: true };
  }

  /**
   * Assert that an identifier is available. Throws an `Error` with the rejection message if not.
   *
   * @param identifier - The raw identifier to check
   * @param scope - Ownership scope to exclude the caller's own records
   * @throws {Error} If the identifier is invalid, reserved, or taken
   */
  async function assertAvailable(
    identifier: string,
    scope: OwnershipScope = {}
  ): Promise<void> {
    const result = await check(identifier, scope);
    if (!result.available) {
      throw new Error(result.message);
    }
  }

  /**
   * Check multiple identifiers in parallel. Suggestions are not generated for batch checks.
   *
   * @param identifiers - Array of raw identifiers to check
   * @param scope - Ownership scope applied to all checks
   * @returns A record mapping each identifier to its `CheckResult`
   */
  async function checkMany(
    identifiers: string[],
    scope: OwnershipScope = {}
  ): Promise<Record<string, CheckResult>> {
    const entries = await Promise.all(
      identifiers.map(async (id) => {
        const result = await check(id, scope, { skipSuggestions: true });
        return [id, result] as const;
      })
    );
    return Object.fromEntries(entries);
  }

  /**
   * Clear the in-memory cache and reset hit/miss counters.
   * No-op if caching is not enabled.
   */
  function clearCache(): void {
    cacheMap.clear();
    cacheHits = 0;
    cacheMisses = 0;
  }

  /**
   * Get cache performance statistics.
   * Returns zeros when caching is not enabled.
   */
  function cacheStats(): { size: number; hits: number; misses: number } {
    return { size: cacheMap.size, hits: cacheHits, misses: cacheMisses };
  }

  return {
    normalize,
    validateFormat,
    check,
    assertAvailable,
    checkMany,
    clearCache,
    cacheStats,
  };
}

/** The guard instance returned by `createNamespaceGuard`. */
export type NamespaceGuard = ReturnType<typeof createNamespaceGuard>;
