/*! namespace-guard, MIT License, copyright (c) 2026 Paul Wood FRSA (@paultendo).
 * Includes data from Unicode confusables.txt, copyright 1991-Present Unicode, Inc.,
 * under the Unicode License v3 (https://www.unicode.org/license.txt), and from confusable-vision measurements by
 * Paul Wood FRSA (@paultendo), CC BY 4.0 (https://github.com/paultendo/confusable-vision). */
import {
  CONFUSABLE_MAP,
  CONFUSABLE_MAP_FULL,
  CONFUSABLE_MAP_CASED,
  CONFUSABLES_DATE,
  MEASURED_CONFUSABLES,
  type MeasuredConfusable,
} from "./confusable-maps";
import {
  LLM_CONFUSABLE_MAP,
  LLM_CONFUSABLE_MAP_CHAR_COUNT,
  LLM_CONFUSABLE_MAP_PAIR_COUNT,
  LLM_CONFUSABLE_MAP_SOURCE_COUNTS,
  type LlmConfusableMapEntry,
} from "./llm-confusable-map";
import { LATIN_FOLD, LATIN_NOT_IN_MODERN_USE } from "./latin-fold";

/** A database table or model to check for slug/handle collisions. */
export type NamespaceSource = {
  /** Table/model name (must match the adapter's lookup key) */
  name: string;
  /** Column that holds the slug/handle */
  column: string;
  /** Column name for the primary key (default: "id", or "_id" for Mongoose) */
  idColumn?: string;
  /** Scope key for ownership checks - allows users to update their own slug without a false collision */
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

/** Result type returned by async validators. */
export type NamespaceValidatorResult = { available: false; message: string } | null;

/** Async validator hook type used by `NamespaceConfig.validators`. Receives the normalized value, and the identifier
 *  as typed (before lowercasing), since whether a character looks like a letter can depend on its case. */
export type NamespaceValidator = (
  value: string,
  context?: { identifier: string }
) => Promise<NamespaceValidatorResult>;

/** Configuration for a namespace guard instance. */
export type NamespaceConfig = {
  /** Reserved names - flat list, Set, or categorized record */
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
  /** Async validation hooks - run after format/reserved checks, before DB */
  validators?: NamespaceValidator[];
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
  /** Default risk policy for `checkRisk()` / `enforceRisk()` */
  risk?: {
    /** Include reserved names as protected targets by default (default: true). A reserved name that is not in
     *  `protect` is matched by lookalikes only. */
    includeReserved?: boolean;
    /** Default protected targets when none are passed to `checkRisk`/`enforceRisk` (default: none). */
    protect?: string[];
    /** Count leetspeak swaps (4 for a, 1 for i, 5 for s) as lookalikes (default: false) */
    leetspeak?: boolean;
    /** Number of top matches returned by default (default: 3) */
    maxMatches?: number;
    /** Default warn threshold for score/action mapping (default: 45) */
    warnThreshold?: number;
    /** Default block threshold for score/action mapping (default: 70) */
    blockThreshold?: number;
  };
};

/** Options passed to adapter `findOne` calls. */
export type FindOneOptions = {
  /** Use case-insensitive matching */
  caseInsensitive?: boolean;
};

/** Database adapter interface - implement this for your ORM or query builder. */
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

/** Options for `checkMany()`. */
export type CheckManyOptions = {
  /** Skip suggestion generation for taken identifiers (default: `true`). */
  skipSuggestions?: boolean;
};

/** Evasion handling mode for `createProfanityValidator()`. */
export type ProfanityValidationMode = "basic" | "evasion";

/** Substitute-folding strictness for `createProfanityValidator()`. */
export type ProfanityVariantProfile = "balanced" | "aggressive";

/** Options for `createProfanityValidator()`. */
export type ProfanityValidatorOptions = {
  /** Custom rejection message (default: "That name is not allowed."). */
  message?: string;
  /** Also refuse names that contain a listed word, not only names that are one (default: `true`). Short entries,
   *  entries of several words and entries common inside English words are matched there only as whole words. */
  checkSubstrings?: boolean;
  /** `basic`: lowercase matching only. `evasion`: Unicode+substitute folding (default: `evasion`). */
  mode?: ProfanityValidationMode;
  /** Variant strictness for evasion mode (default: `balanced`). */
  variantProfile?: ProfanityVariantProfile;
  /** Fewest letters (digits count, spaces and symbols don't) an entry needs to be looked for inside longer words
   *  (default: `4`). Shorter entries are matched as whole words: the whole name, or a part between separators or digits. */
  minSubstringLength?: number;
  /** Confusable map used for evasion folding (default: `CONFUSABLE_MAP_FULL`). */
  map?: Record<string, string>;
  /** Max folded candidates generated per value in evasion mode (default: `64`). */
  maxFoldVariants?: number;
  /** Words that contain a listed word but are fine, such as names and places: `["scunthorpe", "dickson"]`. A listed
   *  word found only inside one of these doesn't count, wherever the allowed word appears in the name
   *  ("scunthorpe-fc"), while a listed word outside it still does. Case and lookalike letters are folded as for the
   *  list, but a digit in the name is not read as an allowed word's letter ("scunth0rpe" is refused). An allowed word
   *  that is itself a listed word lets that word through. An entry written with separators ("chorlton-cum-hardy")
   *  is exact: it lets through only a name that is exactly it, separators included. (default: none) */
  allowlist?: readonly string[];
};

/** Options for `createInvisibleCharacterValidator()`. */
export type InvisibleCharacterValidatorOptions = {
  /** Custom rejection message. */
  message?: string;
  /** Reject Unicode Default_Ignorable_Code_Point characters (default: `true`). */
  rejectDefaultIgnorables?: boolean;
  /** Reject bidi direction/control characters (default: `true`). */
  rejectBidiControls?: boolean;
  /** Reject combining marks (Unicode category `M*`) often used for visual obfuscation (default: `false`). */
  rejectCombiningMarks?: boolean;
};

/**
 * Options for `canonicalise()` LLM preprocessing.
 *
 * A word is rewritten when it shows a sign of tampering: it mixes Latin with another script, it has a letter not in
 * modern use that is built on a Latin letter (ɦ, ꞡ, ɏ; a fullwidth or mathematical letter), or it has Latin letters
 * and a listed lookalike scoring at least `threshold`. In such a word every lookalike is replaced: listed lookalikes
 * whatever their score, and any letter built on a Latin letter (ŧ, İ) by its base letter, in the case of the word
 * around it. A word with no such sign is left as it is, so Turkish İstanbul or Russian Москва pass through.
 */
export type CanonicaliseOptions = {
  /**
   * The visual score at which a listed lookalike on its own marks a word as tampered (default: `0.7`). When you set it,
   * it is also a floor: lookalikes scoring below it are never replaced.
   */
  threshold?: number;
  /** Include confusable-vision novel discoveries in addition to TR39 mappings (default: `true`). */
  includeNovel?: boolean;
  /** Restrict replacement to specific source scripts (case-insensitive, e.g. `["Cyrillic", "Greek"]`). */
  scripts?: string[];
  /**
   * Canonicalisation strategy (default: `"mixed"`).
   *
   * - `"mixed"` -- only rewrite words that show a sign of tampering (see above).
   *   Standalone non-Latin words (e.g. "Москва") and ordinary accented words
   *   (e.g. "İstanbul") are preserved.  Safe for multilingual text.
   *
   * - `"all"` -- replace every confusable character regardless of surrounding
   *   context, and fold every letter built on a Latin letter (ŧ, İ, ö) to it.
   *   Use this when the document is known to be Latin-script (e.g. an English
   *   contract) and you want to catch attackers who substitute every character
   *   in a word.
   */
  strategy?: "mixed" | "all";
  /**
   * Maximum allowed width or height ratio between source and target at natural
   * rendering size (default: `3.0`). Pairs where the source character is more
   * than this many times wider or taller than the Latin target are skipped,
   * because the size difference would be visible in running text even if the
   * shapes match after normalisation.
   *
   * Set to `Infinity` to disable size-ratio filtering. Set to `2.0` for
   * stricter filtering. Only applies to novel (non-TR39) pairs that have
   * measured size ratios.
   */
  maxSizeRatio?: number;
};

/** Options for `scan()` and `isClean()`. */
export type ScanOptions = CanonicaliseOptions & {
  /** Optional list of high-value terms used to raise `riskLevel` when targeted (default: built-in legal/financial list). */
  riskTerms?: string[];
};

/** Single confusable finding returned by `scan()`. */
export type ScanFinding = {
  /** The confusable character found in the input. */
  char: string;
  /** Codepoint label in `U+XXXX` format. */
  codepoint: string;
  /** Script name of the source character. */
  script: string;
  /** Canonical Latin equivalent selected by the lookup table. */
  latinEquivalent: string;
  /** Visual similarity score for this mapping (0–1, from RaySpace measurement; 0 for a `fold`). */
  visualScore: number;
  /**
   * Mapping source: `tr39` baseline, `novel` discovery, or `fold`, a letter built on a Latin letter (ŧ, ɦ, İ) folded
   * to it in a word that shows tampering.
   */
  source: "tr39" | "novel" | "fold";
  /** UTF-16 code-unit offset in the input string. */
  index: number;
  /** Token/word containing this character. */
  word: string;
  /** Whether the token mixes Latin and non-Latin letters. */
  mixedScript: boolean;
};

/** Structured confusable scan result for LLM preprocessing pipelines. */
export type ScanResult = {
  /** Whether any confusable mapping candidates were detected. */
  hasConfusables: boolean;
  /** Number of findings in `findings`. */
  count: number;
  /** Detailed findings with script/source/position metadata. */
  findings: ScanFinding[];
  /** Aggregate scan summary for policy and logging. */
  summary: {
    /** Number of distinct confusable characters found. */
    distinctChars: number;
    /** Number of distinct words/tokens affected. */
    wordsAffected: number;
    /** Distinct scripts detected among findings. */
    scriptsDetected: string[];
    /** Heuristic risk level from confusable density + targeting. */
    riskLevel: "none" | "low" | "medium" | "high";
  };
};

/** Static confusable lookup map used by LLM preprocessing helpers. */
export { LLM_CONFUSABLE_MAP, LLM_CONFUSABLE_MAP_CHAR_COUNT, LLM_CONFUSABLE_MAP_PAIR_COUNT };

/** Pair counts by source (`tr39` vs `novel`) for the LLM confusable lookup map. */
export { LLM_CONFUSABLE_MAP_SOURCE_COUNTS };
/** One entry of `LLM_CONFUSABLE_MAP`: the Latin letter, its visual score, source and script. */
export type { LlmConfusableMapEntry };

/**
 * Character maps from Unicode confusables.txt (`CONFUSABLES_DATE`) and confusable-vision's measurements
 * (`MEASURED_CONFUSABLES`, with the fonts and sizes where each holds). Regenerate with
 * `npx tsx scripts/generate-confusables.ts`. `CONFUSABLE_MAP_CASED` holds the ASCII capitals Unicode maps to another
 * letter (capital I as l), used where case is kept.
 */
export { CONFUSABLE_MAP, CONFUSABLE_MAP_FULL, CONFUSABLE_MAP_CASED, CONFUSABLES_DATE, MEASURED_CONFUSABLES };
export type { MeasuredConfusable };

/** A character's lowercase prototype: as mapped (looked up as typed, so a capital and its lowercase form can differ:
 *  Greek Η is h, η is n), else itself lowercased. With `cased`, ASCII capitals Unicode maps to another letter too. */
function prototypeOf(ch: string, map: Record<string, string>, cased: boolean): string {
  return map[ch] ?? (cased ? CONFUSABLE_MAP_CASED[ch] : undefined) ?? ch.toLowerCase();
}

const splitListedCache = new WeakMap<Record<string, string>, Array<[string, string]>>();

/** The map's characters that a normalization splits into several (NFD: í into i and an acute, וֹ into vav and holam;
 *  with `compatibility`, NFKD too: ŀ into l and a middle dot), as [split form, character], longest first. */
function splitListedCharacters(map: Record<string, string>, compatibility: boolean): Array<[string, string]> {
  let all = splitListedCache.get(map);
  if (!all) {
    const found = new Map<string, string>();
    for (const form of ["NFD", "NFKD"] as const) {
      for (const ch of Object.keys(map)) {
        const split = ch.normalize(form);
        // Only splits with a non-ASCII character, so plain ASCII text is never read as something else
        if (split === ch || Array.from(split).length < 2 || /^[\x00-\x7f]*$/.test(split) || found.has(split)) continue;
        found.set(split, ch);
      }
    }
    all = [...found].sort((a, b) => b[0].length - a[0].length);
    splitListedCache.set(map, all);
  }
  return compatibility ? all : all.filter(([split, ch]) => ch.normalize("NFD") === split);
}

/** Puts each listed character that a normalization split back together, so the map's entry for it applies: NFD
 *  runs before lookup, and would otherwise leave í as i plus an accent that counts as a difference. */
function rejoinSplitListed(value: string, map: Record<string, string>, compatibility = false): string {
  if (/^[\x00-\x7f]*$/.test(value)) return value;
  for (const [split, ch] of splitListedCharacters(map, compatibility)) {
    if (value.includes(split)) value = value.split(split).join(ch);
  }
  return value;
}

/** Single-letter folds for profanity matching: the non-ASCII entries, with m kept as m (not rn). */
const LETTER_FOLD_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(CONFUSABLE_MAP_FULL).flatMap(([ch, target]) => {
    if (ch.codePointAt(0)! < 0x80) return [];
    const letter = target === "rn" ? "m" : target;
    return letter.length === 1 ? [[ch, letter]] : [];
  })
);

/** Options for the `skeleton()` and `areConfusable()` functions. */
export type SkeletonOptions = {
  /** Confusable character map to use.
   *  Default: `CONFUSABLE_MAP_FULL` (complete TR39 map, no NFKC filtering).
   *  Pass `CONFUSABLE_MAP` if your pipeline runs NFKC before calling skeleton(). */
  map?: Record<string, string>;
  /** Treat the input as shown with its case, so ASCII capitals Unicode maps to another letter count as that letter
   *  (capital I as l: "paypaI" has the skeleton of "paypal"). For names displayed as typed. Default `false`: names
   *  compare without case ("ADMIN" is "admin"). `areConfusable()` checks both. */
  preserveCase?: boolean;
  /** Also remove diacritics (the combining marks of the Combining Diacritical Marks blocks, such as a dot below,
   *  an accent or a hook), so `ạ` matches `a` and `ẹ` matches `e`. TR39 keeps them, but a small mark is easy to
   *  miss, and Chromium removes Latin diacritics when it checks a domain against top domains. Marks that scripts
   *  use as vowel signs are outside these blocks and are kept. Default: `false`. */
  ignoreDiacritics?: boolean;
};

/** Options for `areConfusable()` with optional weight-based matching. */
export type AreConfusableOptions = SkeletonOptions & {
  /** Optional measured visual weights for weight-based confusable matching.
   *  When provided, a measured pair at the same position also counts as alike. */
  weights?: ConfusableWeights;
  /** Filter weights by deployment context.
   *  - `'identifier'`: only apply pairs whose two characters are both XID_Continue
   *  - `'domain'`: only apply pairs whose two characters are both IDNA PVALID
   *  - `'all'` (default): apply all weights regardless of properties */
  context?: "identifier" | "domain" | "all";
};

/** Measured visual weight for a single confusable pair. */
export type ConfusableWeight = {
  /** How widely the pair looks alike. In the bundled weights (confusable-vision release 2): the share of text fonts,
   *  or of font combinations, where the two characters are alike at the same size and baseline. */
  danger: number;
  /** The same share in the bundled weights (kept separate for weights from other sources). */
  stableDanger: number;
  /** 1 - stableDanger, clamped [0, 1]. Lower cost = more dangerous. */
  cost: number;
  /** True if font cmap reveals intentional glyph reuse. */
  glyphReuse?: boolean;
  /** Source char is valid in UAX #31 identifiers (XID_Continue). */
  xidContinue?: boolean;
  /** Source char is PVALID in IDNA 2008 (relevant for domain spoofing). */
  idnaPvalid?: boolean;
  /** Source char is TR39 Identifier_Status=Allowed. */
  tr39Allowed?: boolean;
};

/** Lookup table of measured visual weights, keyed by source char then target char. */
export type ConfusableWeights = Record<string, Record<string, ConfusableWeight>>;

/** Options for `confusableDistance()`. */
export type ConfusableDistanceOptions = {
  /** Confusable character map to use (default: `CONFUSABLE_MAP_FULL`). */
  map?: Record<string, string>;
  /** Optional measured visual weights from confusable-vision scoring.
   *  When provided, TR39 pairs use measured cost instead of hardcoded 0.35,
   *  and novel pairs (not in TR39 map) use their visual-weight cost. */
  weights?: ConfusableWeights;
  /** Filter weights by deployment context.
   *  - `'identifier'`: only apply pairs whose two characters are both XID_Continue
   *  - `'domain'`: only apply pairs whose two characters are both IDNA PVALID
   *  - `'all'` (default): apply all weights regardless of properties */
  context?: "identifier" | "domain" | "all";
};

/** Step-by-step edit operation in a confusable distance path. */
export type ConfusableDistanceStep = {
  /** Operation type for this path step. */
  op: "match" | "substitution" | "confusable-substitution" | "insertion" | "deletion";
  /** Source character (for substitution/deletion). */
  from?: string;
  /** Target character (for substitution/insertion). */
  to?: string;
  /** Zero-based index in the source string for this operation. */
  fromIndex: number;
  /** Zero-based index in the target string for this operation. */
  toIndex: number;
  /** Weighted operation cost. */
  cost: number;
  /** Shared prototype when op is `confusable-substitution`. */
  prototype?: string;
  /** True when substitution crosses Unicode scripts (e.g. Latin to Cyrillic). */
  crossScript?: boolean;
  /** True when substitution uses a known NFKC/TR39 divergent mapping. */
  divergence?: boolean;
  /** Human-readable signal for high-risk operations. */
  reason?: "default-ignorable" | "cross-script" | "nfkc-divergence" | "nfkc-equivalent" | "visual-weight";
};

/** Result of weighted confusable distance analysis between two strings. */
export type ConfusableDistanceResult = {
  /** Weighted edit distance (lower means more confusable). */
  distance: number;
  /** Maximum baseline distance used for similarity scaling. */
  maxDistance: number;
  /** Similarity score in [0, 1], where 1 is most similar. */
  similarity: number;
  /** Whether TR39 skeletons are equal. */
  skeletonEqual: boolean;
  /** Whether NFKC + lowercase forms are equal. */
  normalizedEqual: boolean;
  /** Number of non-trivial path operations (attack chain depth proxy). */
  chainDepth: number;
  /** Number of cross-script confusable substitutions in the path. */
  crossScriptCount: number;
  /** Number of default-ignorable insertions/deletions in the path. */
  ignorableCount: number;
  /** Number of substitutions involving NFKC/TR39 divergent mappings. */
  divergenceCount: number;
  /** Weighted shortest edit path used to compute the distance. */
  steps: ConfusableDistanceStep[];
};

/** A character-level mapping where TR39 and NFKC disagree on ASCII prototype. */
export type NfkcTr39DivergenceVector = {
  /** Source character from confusables data. */
  char: string;
  /** Unicode scalar value formatted as `U+XXXX`. */
  codePoint: string;
  /** TR39 confusable target from the selected map. */
  tr39: string;
  /** NFKC lowercase result for the source character. */
  nfkc: string;
};

/** Canonical composability regression vector (alias of `NfkcTr39DivergenceVector`). */
export type ComposabilityVector = NfkcTr39DivergenceVector;

/** Risk reason code returned by `checkRisk()`. */
export type RiskReasonCode =
  | "confusable-target"
  | "skeleton-collision"
  | "mixed-script"
  | "invisible-character"
  | "confusable-character"
  | "divergent-mapping"
  | "deep-chain";

/** Structured reason contributing to a risk score. */
export type RiskReason = {
  code: RiskReasonCode;
  message: string;
  weight: number;
};

/** Risk levels returned by `checkRisk()`. */
export type RiskLevel = "low" | "medium" | "high";

/** Policy action derived from the configured thresholds. */
export type RiskAction = "allow" | "warn" | "block";

/**
 * How a name matched a protected target:
 * - `exact`: it is the target.
 * - `lookalike`: it differs only by lookalikes and invisible characters, or its skeleton collides. Can block.
 * - `lookalike-extension`: it spells the whole target with a lookalike and adds letters. Warns at most.
 * - `typo`: one letter changed, added, dropped or swapped, not a lookalike, from a name in `protect`. Warns at most.
 */
export type RiskMatchEvidence = "exact" | "lookalike" | "lookalike-extension" | "typo";

/** A nearest protected target returned by risk scoring. */
export type RiskMatch = {
  target: string;
  score: number;
  distance: number;
  chainDepth: number;
  skeletonEqual: boolean;
  /** How the name matched the target. */
  evidence: RiskMatchEvidence;
  reasons: string[];
};

/** Options for `guard.checkRisk()`. */
export type CheckRiskOptions = {
  /** Additional high-value identifiers to protect against confusable variants. */
  protect?: string[];
  /** Include configured reserved names in the protected target set (default: true). A reserved name that is not in
   *  `protect` is matched by lookalikes only, not by a one-letter typo. */
  includeReserved?: boolean;
  /** Count leetspeak swaps (4 for a, 1 for i, 5 for s, $ for s) as lookalikes, so p4ypal or adm1n can block
   *  (default: false). The table is the profanity matcher's aggressive one. */
  leetspeak?: boolean;
  /** Confusable map used for skeletoning and distance scoring (default: `CONFUSABLE_MAP_FULL`). */
  map?: Record<string, string>;
  /** Number of highest-risk matches to return (default: 3). */
  maxMatches?: number;
  /** Score threshold where action transitions from `allow` to `warn` (default: 45). */
  warnThreshold?: number;
  /** Score threshold where action transitions from `warn` to `block` (default: 70). */
  blockThreshold?: number;
};

/** Output of `guard.checkRisk()`. */
export type RiskCheckResult = {
  identifier: string;
  normalized: string;
  score: number;
  level: RiskLevel;
  action: RiskAction;
  /** False when the name shows nothing visual: no lookalike or exact match of a protected target, and no lookalike,
   *  invisible or mixed-script characters. Its score is then held below the block threshold, whatever it is. */
  canBlock: boolean;
  reasons: RiskReason[];
  matches: RiskMatch[];
};

/** Options for `guard.enforceRisk()`. */
export type EnforceRiskOptions = CheckRiskOptions & {
  /** Deny mode. "block" denies only block-level risk; "warn" denies warn+block. */
  failOn?: "block" | "warn";
  /** Custom messages for denied outcomes. */
  messages?: {
    warn?: string;
    block?: string;
  };
};

/** Options for `guard.assertClaimable()`. */
export type AssertClaimableOptions = EnforceRiskOptions;

/** Result of `guard.enforceRisk()`. */
export type EnforceRiskResult = {
  allowed: boolean;
  action: RiskAction;
  message?: string;
  risk: RiskCheckResult;
};

/** Predicate for detecting duplicate-key / unique-constraint errors from write operations. */
export type UniqueViolationDetector = (error: unknown) => boolean;

/** Options for `guard.claim()`. */
export type ClaimOptions = AssertClaimableOptions & {
  /** Ownership scope passed to availability checks. */
  scope?: OwnershipScope;
  /** Optional custom detector for duplicate-key/unique-constraint write errors. */
  isUniqueViolation?: UniqueViolationDetector;
  /** Message used when write fails due to a unique violation (default: "That name is already in use."). */
  takenMessage?: string;
};

/** Result of `guard.claim()`. */
export type ClaimResult<T> =
  | {
      claimed: true;
      normalized: string;
      value: T;
    }
  | {
      claimed: false;
      normalized: string;
      reason: "unavailable";
      message: string;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

/**
 * Best-effort detection of duplicate-key / unique-constraint errors across
 * common data layers (Postgres, MySQL, SQLite, Prisma, MongoDB).
 */
export function isLikelyUniqueViolationError(error: unknown): boolean {
  const queue: unknown[] = [error];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    const obj = asRecord(current);
    if (!obj) continue;

    const code = typeof obj.code === "string" ? obj.code : null;
    const numericCode = typeof obj.code === "number" ? obj.code : null;
    const errno = typeof obj.errno === "number" ? obj.errno : null;
    const message = typeof obj.message === "string" ? obj.message.toLowerCase() : "";

    if (
      code === "23505" || // Postgres unique_violation
      code === "P2002" || // Prisma unique constraint failed
      code === "ER_DUP_ENTRY" || // MySQL duplicate entry
      code === "SQLITE_CONSTRAINT_UNIQUE" ||
      code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
      // SQLite's plain SQLITE_CONSTRAINT also covers NOT NULL, CHECK and foreign keys: only a unique one counts
      (code === "SQLITE_CONSTRAINT" && message.includes("unique")) ||
      code === "11000" || // some Mongo drivers surface as string
      numericCode === 11000 || // Mongo duplicate key
      errno === 1062 || // MySQL duplicate entry
      errno === 11000 // Mongo duplicate key
    ) {
      return true;
    }

    if (
      message.includes("duplicate key") ||
      message.includes("unique constraint") ||
      message.includes("unique violation") ||
      message.includes("already exists") ||
      message.includes("e11000")
    ) {
      return true;
    }

    if (obj.cause) queue.push(obj.cause);
    if (obj.parent) queue.push(obj.parent);
    if (obj.original) queue.push(obj.original);
    if (obj.meta) queue.push(obj.meta);
  }

  return false;
}

/** Built-in profile names for practical defaults. */
export type NamespaceProfileName = "consumer-handle" | "org-slug" | "developer-id";

/** Profile preset definition. */
export type NamespaceProfilePreset = {
  description: string;
  pattern: RegExp;
  /** The message for a name that doesn't match `pattern`, used unless you set `messages.invalid` or your own pattern */
  invalidMessage?: string;
  normalizeUnicode: boolean;
  allowPurelyNumeric: boolean;
  risk: Required<NonNullable<NamespaceConfig["risk"]>>;
};

/** Default high-value targets used when enforcing risk without explicit protect targets. */
export const DEFAULT_PROTECTED_TOKENS = [
  "admin",
  "administrator",
  "support",
  "help",
  "security",
  "billing",
  "payments",
  "staff",
  "moderator",
  "root",
  "system",
  "api",
  "www",
  "mail",
  "login",
];

/** Practical preset profiles for common namespace types. */
export const NAMESPACE_PROFILES: Record<NamespaceProfileName, NamespaceProfilePreset> = {
  "consumer-handle": {
    description: "User-facing handles with strict anti-impersonation defaults.",
    pattern: /^[a-z0-9][a-z0-9-]{1,29}$/,
    invalidMessage: "Use 2-30 lowercase letters, numbers, or hyphens.",
    normalizeUnicode: true,
    allowPurelyNumeric: false,
    risk: {
      includeReserved: true,
      protect: [],
      leetspeak: false,
      maxMatches: 3,
      warnThreshold: 45,
      blockThreshold: 70,
    },
  },
  "org-slug": {
    description: "Organization/workspace slugs with conservative collision policy.",
    pattern: /^[a-z0-9][a-z0-9-]{1,39}$/,
    invalidMessage: "Use 2-40 lowercase letters, numbers, or hyphens.",
    normalizeUnicode: true,
    allowPurelyNumeric: false,
    risk: {
      includeReserved: true,
      protect: [],
      leetspeak: false,
      maxMatches: 5,
      warnThreshold: 40,
      blockThreshold: 65,
    },
  },
  "developer-id": {
    description: "Developer/package style identifiers with stricter warn thresholds.",
    pattern: /^[a-z0-9][a-z0-9-]{1,49}$/,
    invalidMessage: "Use 2-50 lowercase letters, numbers, or hyphens.",
    normalizeUnicode: true,
    allowPurelyNumeric: true,
    risk: {
      includeReserved: true,
      protect: [],
      leetspeak: false,
      maxMatches: 5,
      warnThreshold: 35,
      blockThreshold: 60,
    },
  },
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

/** Options for `createPredicateValidator()`. */
export type PredicateValidatorOptions = {
  /** Custom rejection message (default: "That name is not allowed."). */
  message?: string;
  /** Optional transform applied before passing input to the predicate. */
  transform?: (value: string) => string;
};

/**
 * Wrap a sync/async boolean predicate as a namespace validator.
 *
 * Useful for integrating third-party moderation/profanity libraries without
 * adding dependencies to namespace-guard itself.
 *
 * @param predicate - Returns `true` when the value should be blocked
 * @param options - Optional rejection message and value transform
 * @returns A validator compatible with `config.validators`
 */
export function createPredicateValidator(
  predicate: (value: string) => boolean | Promise<boolean>,
  options?: PredicateValidatorOptions
): NamespaceValidator {
  const message = options?.message ?? "That name is not allowed.";
  const transform = options?.transform ?? ((value: string) => value);

  return async (value: string) => {
    const blocked = await predicate(transform(value));
    if (blocked) {
      return { available: false, message };
    }
    return null;
  };
}

const PROFANITY_SUBSTITUTE_MAP_BALANCED: Record<string, string[]> = {
  "0": ["o"],
  "1": ["i"],
  "3": ["e"],
  "4": ["a"],
  "5": ["s"],
  "7": ["t"],
  "@": ["a"],
  $: ["s"],
  "+": ["t"],
  "!": ["i"],
  "|": ["i"],
};
const PROFANITY_SUBSTITUTE_MAP_AGGRESSIVE: Record<string, string[]> = {
  ...PROFANITY_SUBSTITUTE_MAP_BALANCED,
  "1": ["i", "l"],
  "2": ["z"],
  "6": ["g"],
  "8": ["b"],
  "9": ["g"],
  "!": ["i", "l"],
  "|": ["i", "l"],
};
const ASCII_ALNUM_RE = /^[a-z0-9]$/;
const MARK_RE = /^\p{M}$/u;
/** Stands for a run of separators (spaces, hyphens, dots, underscores, other symbols) in a profanity reading. */
const PROFANITY_SEPARATOR = "-";

/**
 * Letter sequences common inside ordinary English words. A list entry whose letters are one of these is matched only
 * as a whole word, so `anal` refuses "anal" and "anal-talk" but not "analyst". They are the letters of the English
 * list's entries (`namespace-guard/profanity-en`, both variant profiles) that occur inside common English words which
 * together appear at least once per million words (Zipf 3). Common words are those in both /usr/share/dict/words
 * (with propernames) and wordfreq 3.1's 100,000 most frequent English words, less words the list itself has;
 * frequencies are wordfreq's. `shit`, found inside no common word, is matched anywhere, so "shitposter" is refused.
 * `node scripts/measure-profanity.mjs` re-derives the set and says whether this one is current.
 */
const PROFANITY_COMMON_INSIDE_WORDS: ReadonlySet<string> = new Set([
  "abbo", "abuse", "anal", "anus", "armo", "arse", "ass", "asses", "asshopper", "azz", "blacks", "breast", "bung",
  "bunga", "cipa", "cock", "cok", "condom", "cooter", "crap", "crappy", "cuck", "cum", "cums", "cunn", "cushi", "dago",
  "damn", "dick", "duche", "eatme", "ediat", "erotic", "feg", "fitt", "floo", "forni", "geni", "genital", "gey", "gub",
  "gyp", "heroin", "hom", "homo", "hooter", "hore", "hori", "humpin", "humping", "ikey", "indon", "injun", "jap",
  "jugg", "kink", "licker", "limy", "moky", "mong", "muff", "necro", "nig", "nob", "nog", "orga", "paki", "pakis",
  "payo", "pedo", "perse", "perv", "pimp", "pis", "poof", "poon",
  "porn", "porno", "pric", "prick", "prig", "pron", "pube", "pudd", "puta", "rape", "raped", "raper", "raping",
  "rapist", "rere", "retard", "rimming", "rse", "sadis", "sadist", "scat", "schizo", "semen", "sex", "shat", "shav",
  "simp", "sm", "sob", "spac", "spank", "spic", "spik", "stfu", "taff", "tard", "terd", "teste", "tit", "tity",
  "tortur", "torture", "vag", "vagina", "wab", "yid",
]);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseProfanityMode(value: ProfanityValidationMode | undefined): ProfanityValidationMode {
  return value ?? "evasion";
}

function parseProfanityVariantProfile(
  value: ProfanityVariantProfile | undefined
): ProfanityVariantProfile {
  return value === "aggressive" ? "aggressive" : "balanced";
}

function getProfanitySubstituteMap(
  profile: ProfanityVariantProfile
): Record<string, string[]> {
  return profile === "aggressive"
    ? PROFANITY_SUBSTITUTE_MAP_AGGRESSIVE
    : PROFANITY_SUBSTITUTE_MAP_BALANCED;
}

/**
 * The readings of a name or list entry for profanity matching: lowercase letters and digits, with "-" for each run of
 * separators. Lookalike letters become Latin ones and marks are dropped (ó reads as o). A digit or symbol that can
 * stand for a letter gives readings with the letter, tried first so the all-letters reading survives `maxVariants`.
 * In a name a digit can also be itself and a symbol a separator; in an entry a symbol is only its letter (sh!+ is
 * shit). A name also keeps its reading as typed, digits as digits.
 */
function profanityReadings(
  value: string,
  map: Record<string, string>,
  substituteMap: Record<string, string[]>,
  maxVariants: number,
  isEntry: boolean
): string[] {
  const skeletonized = skeleton(value.normalize("NFKC"), { map });
  const append = (prefix: string, option: string) =>
    option === PROFANITY_SEPARATOR && (prefix === "" || prefix.endsWith(PROFANITY_SEPARATOR))
      ? prefix
      : prefix + option;
  let readings = [""];
  let asTyped = "";

  for (const ch of skeletonized) {
    const substitutes = substituteMap[ch] ?? [];
    let options: string[];
    if (ASCII_ALNUM_RE.test(ch)) options = [...substitutes, ch];
    else if (MARK_RE.test(ch)) options = [""];
    else if (substitutes.length > 0 && isEntry) options = substitutes;
    else options = [...substitutes, PROFANITY_SEPARATOR];
    asTyped = append(asTyped, MARK_RE.test(ch) ? "" : ASCII_ALNUM_RE.test(ch) ? ch : PROFANITY_SEPARATOR);

    const next: string[] = [];
    const seen = new Set<string>();
    for (const prefix of readings) {
      for (const option of options) {
        const reading = append(prefix, option);
        if (seen.has(reading)) continue;
        seen.add(reading);
        next.push(reading);
        if (next.length >= maxVariants) break;
      }
      if (next.length >= maxVariants) break;
    }
    readings = next;
  }
  if (!isEntry) readings.push(asTyped);

  const out = new Set<string>();
  for (const reading of readings) {
    const trimmed = reading.endsWith(PROFANITY_SEPARATOR) ? reading.slice(0, -1) : reading;
    if (trimmed !== "") out.add(trimmed);
  }
  return Array.from(out);
}

/** A letter written three or more times in a row also reads as once, twice or three times: shiiit as shit. */
function withRepeatsCollapsed(readings: string[]): string[] {
  const out = new Set(readings);
  for (const reading of readings) {
    if (!/([a-z])\1\1/.test(reading)) continue;
    for (const run of ["$1", "$1$1", "$1$1$1"]) out.add(reading.replace(/([a-z])\1{2,}/g, run));
  }
  return Array.from(out);
}

/**
 * Every run of whole words in a reading, joined without separators, with where it starts and ends among the
 * reading's letters. A word is a run of letters or of digits, so the words of "my-a-s-s" include "ass" and those of
 * "ass4life" include "ass", while "class" has only "class".
 */
function profanityWordRuns(reading: string, maxLength: number): Array<[string, number, number]> {
  const words = reading.match(/[a-z]+|[0-9]+/g) ?? [];
  const runs: Array<[string, number, number]> = [];
  let start = 0;
  for (let i = 0; i < words.length; i++) {
    let run = "";
    for (let j = i; j < words.length; j++) {
      run += words[j];
      if (run.length > maxLength) break;
      runs.push([run, start, start + run.length]);
    }
    start += words[i].length;
  }
  return runs;
}

/** Letter positions an allowed word covers; `cuts`, for one written across separators, are where they fall. */
type TextSpan = readonly [start: number, end: number, cuts?: readonly number[]];

/**
 * Where the allowlist's words occur in a text. With `separator`, the text is a reading: an allowed word must lie
 * between separators (so "groe-poster" doesn't hold "groep"), and positions count letters only, separators removed.
 */
function allowedSpans(
  text: string,
  allowed: ReadonlySet<string>,
  lengths: readonly number[],
  separator?: string
): TextSpan[] {
  const spans: TextSpan[] = [];
  const parts = separator === undefined ? [text] : text.split(separator);
  const starts: number[] = [];
  let offset = 0;
  for (const part of parts) {
    starts.push(offset);
    for (let i = 0; i < part.length; i++) {
      for (const length of lengths) {
        if (i + length <= part.length && allowed.has(part.slice(i, i + length))) {
          spans.push([offset + i, offset + i + length]);
        }
      }
    }
    offset += part.length;
  }
  // An allowed word written across whole parts (d-agostino, scun-thorpe). It covers only listed words that cross one
  // of its separators, so a split that stands a listed word on its own (shit-terton) is still refused.
  const longest = Math.max(0, ...lengths);
  for (let i = 0; i < parts.length - 1; i++) {
    let joined = parts[i];
    for (let j = i + 1; j < parts.length && joined.length < longest; j++) {
      joined += parts[j];
      if (allowed.has(joined)) spans.push([starts[i], starts[j] + parts[j].length, starts.slice(i + 1, j + 1)]);
    }
  }
  return spans;
}

function isCovered(spans: readonly TextSpan[], start: number, end: number): boolean {
  return spans.some(([s, e, cuts]) => s <= start && end <= e && (!cuts || cuts.some((c) => start < c && c < end)));
}

/** Whether `regex` (global, capturing each match in a lookahead) matches somewhere no allowed word covers. */
function hasUncoveredMatch(regex: RegExp, text: string, spans: readonly TextSpan[]): boolean {
  regex.lastIndex = 0;
  for (let m = regex.exec(text); m !== null; m = regex.exec(text)) {
    if (!isCovered(spans, m.index, m.index + m[1].length)) return true;
    regex.lastIndex = m.index + 1;
  }
  return false;
}

/** The regex alternatives for a set of words, longest first, so a match at a position is the longest there. */
function longestFirst(words: Iterable<string>): string {
  return Array.from(words)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join("|");
}

/**
 * Create a validator that rejects identifiers containing profanity or offensive words.
 *
 * Supply your own word list, or the English list from `namespace-guard/profanity-en`.
 * The returned function is compatible with `config.validators`.
 *
 * An entry of one word with at least `minSubstringLength` letters is looked for anywhere in a name ("shitposter").
 * Other entries are matched as whole words: the whole name, or a part of it between separators, digits or its ends,
 * with or without separators between its letters. These are shorter entries ("ass" refuses "my-ass", not "class"),
 * entries written as several words ("h e l l", "blow job"), and entries whose letters are common inside ordinary
 * English words (122 sequences measured from the English list, such as anal, rape and cock). Words on `allowlist`
 * shield the listed words inside them: with `allowlist: ["scunthorpe"]`, "scunthorpe-fc" and "scun-thorpe" pass, and
 * "xcuntx" and "s-cunt-horpe" don't, since a part of a name that is a listed word on its own still counts.
 *
 * @param words - Array of words to block
 * @param options - Optional settings
 * @param options.message - Custom rejection message (default: "That name is not allowed.")
 * @param options.checkSubstrings - Also refuse names that contain a listed word, not only names that are one (default: true)
 * @param options.mode - `basic` (lowercase only) or `evasion` (Unicode/substitute folding) (default: `evasion`)
 * @param options.variantProfile - `balanced` (precision-first) or `aggressive` (broader substitutes) (default: `balanced`)
 * @param options.minSubstringLength - Fewest letters an entry needs to be looked for inside longer words (default: `4`)
 * @param options.map - Confusable map used by `mode: "evasion"` (default: `CONFUSABLE_MAP_FULL`)
 * @param options.maxFoldVariants - Max folded candidates considered in evasion mode (default: 64)
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
  words: readonly string[],
  options?: ProfanityValidatorOptions
): NamespaceValidator {
  const message = options?.message ?? "That name is not allowed.";
  const checkSubstrings = options?.checkSubstrings ?? true;
  const mode = parseProfanityMode(options?.mode);
  const variantProfile = parseProfanityVariantProfile(options?.variantProfile);
  const substituteMap = getProfanitySubstituteMap(variantProfile);
  const foldMap = options?.map ?? LETTER_FOLD_MAP;
  const minSubstringLength = Math.max(
    1,
    Math.floor(options?.minSubstringLength ?? 4)
  );
  const maxFoldVariants = Math.max(
    1,
    Math.floor(options?.maxFoldVariants ?? 64)
  );
  const rawWords = words
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
  const wordSet = new Set(rawWords);
  const allowEntries = (options?.allowlist ?? []).map((w) => w.trim().toLowerCase()).filter(Boolean);
  // An entry written with separators ("chorlton-cum-hardy") lets through only a name that is exactly it.
  const exactAllowed = new Set(allowEntries.filter((w) => /[^\p{L}\p{N}]/u.test(w)));
  const rawAllowed = new Set(allowEntries.filter((w) => !exactAllowed.has(w)));
  const refused = { available: false as const, message };
  const letterLengths = (set: ReadonlySet<string>) => Array.from(new Set(Array.from(set, (w) => w.length)));
  const NO_SPANS: TextSpan[] = [];

  // Whether an entry, from its readings, is matched only as a whole word. Length counts letters and digits, not spaces.
  const isWholeWord = (readings: string[]) =>
    readings.some((reading) => {
      const letters = reading.split(PROFANITY_SEPARATOR).join("");
      return (
        reading.includes(PROFANITY_SEPARATOR) ||
        letters.length < minSubstringLength ||
        PROFANITY_COMMON_INSIDE_WORDS.has(letters)
      );
    });

  if (mode === "basic") {
    // The name as it is: substring entries anywhere in it, other entries between non-letters.
    const substringWords: string[] = [];
    const wholeWords: string[] = [];
    if (checkSubstrings) {
      for (const word of wordSet) {
        const reading = word.replace(/[^\p{L}\p{N}]+/gu, PROFANITY_SEPARATOR).replace(/^-|-$/g, "");
        (isWholeWord([reading]) ? wholeWords : substringWords).push(word);
      }
    }
    const substringAlternatives = longestFirst(substringWords);
    const wholeWordAlternatives = longestFirst(wholeWords);
    const substringRegex = substringWords.length > 0 ? new RegExp(substringAlternatives) : null;
    const wholeWordRegex =
      wholeWords.length > 0 ? new RegExp(`(?<!\\p{L})(?:${wholeWordAlternatives})(?!\\p{L})`, "u") : null;
    // With an allowlist, every match is found (a lookahead lets them overlap) and checked against the allowed words.
    const substringMatches = new RegExp(`(?=(${substringAlternatives}))`, "g");
    const wholeWordMatches = new RegExp(`(?<!\\p{L})(?=(${wholeWordAlternatives})(?!\\p{L}))`, "gu");
    const allowedLengths = letterLengths(rawAllowed);
    return async (value: string) => {
      const normalized = value.toLowerCase();
      if (exactAllowed.has(normalized)) return null;
      const spans = rawAllowed.size > 0 ? allowedSpans(normalized, rawAllowed, allowedLengths) : NO_SPANS;
      if (
        (wordSet.has(normalized) && !isCovered(spans, 0, normalized.length)) ||
        (substringRegex?.test(normalized) &&
          (spans.length === 0 || hasUncoveredMatch(substringMatches, normalized, spans))) ||
        (wholeWordRegex?.test(normalized) &&
          (spans.length === 0 || hasUncoveredMatch(wholeWordMatches, normalized, spans)))
      ) {
        return refused;
      }
      return null;
    };
  }

  // Letters of each entry's readings, separators removed.
  const substringLetters = new Set<string>();
  const wholeWordLetters = new Set<string>();
  for (const word of wordSet) {
    const readings = profanityReadings(word, foldMap, substituteMap, Math.min(16, maxFoldVariants), true);
    const target = !checkSubstrings || isWholeWord(readings) ? wholeWordLetters : substringLetters;
    for (const reading of readings) target.add(reading.split(PROFANITY_SEPARATOR).join(""));
  }
  const allLetters = new Set([...substringLetters, ...wholeWordLetters]);
  // One regex for O(len) substring matching instead of O(words × len)
  const substringAlternatives = longestFirst(substringLetters);
  const substringRegex = substringLetters.size > 0 ? new RegExp(substringAlternatives) : null;
  const substringMatches = new RegExp(`(?=(${substringAlternatives}))`, "g");
  let maxWholeWordLength = 0;
  for (const letters of wholeWordLetters) maxWholeWordLength = Math.max(maxWholeWordLength, letters.length);
  // Allowed words, read the way entries are.
  const allowedLetters = new Set<string>();
  for (const word of rawAllowed) {
    for (const reading of profanityReadings(word, foldMap, substituteMap, Math.min(16, maxFoldVariants), true)) {
      allowedLetters.add(reading.split(PROFANITY_SEPARATOR).join(""));
    }
  }
  const allowedLengths = letterLengths(allowedLetters);

  return async (value: string) => {
    const normalized = value.toLowerCase();
    if (exactAllowed.has(normalized)) return null;
    if (wordSet.has(normalized) && !rawAllowed.has(normalized)) return refused;

    const readings = withRepeatsCollapsed(
      profanityReadings(normalized, foldMap, substituteMap, maxFoldVariants, false)
    );
    for (const reading of readings) {
      const letters = reading.split(PROFANITY_SEPARATOR).join("");
      // A listed word inside an allowed word (scunthorpe, dickson) doesn't count.
      const spans =
        allowedLetters.size > 0
          ? allowedSpans(reading, allowedLetters, allowedLengths, PROFANITY_SEPARATOR)
          : NO_SPANS;
      if (allLetters.has(letters) && !isCovered(spans, 0, letters.length)) return refused;
      if (!checkSubstrings) continue;
      // Separators are dropped for substring entries, so s-h-i-t and sh.it read as shit.
      if (
        substringRegex?.test(letters) &&
        (spans.length === 0 || hasUncoveredMatch(substringMatches, letters, spans))
      ) {
        return refused;
      }
      for (const [run, start, end] of profanityWordRuns(reading, maxWholeWordLength)) {
        if (wholeWordLetters.has(run) && !isCovered(spans, start, end)) return refused;
      }
    }
    return null;
  };
}

function formatCodePoint(ch: string): string {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return "U+0000";
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

/**
 * Derive the set of characters where TR39 prototype mapping and NFKC lowercase
 * mapping disagree on single ASCII letter/digit outcomes.
 */
export function deriveNfkcTr39DivergenceVectors(
  map: Record<string, string> = CONFUSABLE_MAP_FULL
): NfkcTr39DivergenceVector[] {
  const rows: Array<NfkcTr39DivergenceVector & { cp: number }> = [];

  for (const [char, tr39] of Object.entries(map)) {
    const cp = char.codePointAt(0);
    if (cp === undefined || cp < 0x80 || tr39.length !== 1) continue;
    const nfkc = char.normalize("NFKC").toLowerCase();
    if (!/^[a-z0-9]$/.test(nfkc)) continue;
    if (nfkc === tr39) continue;

    rows.push({
      char,
      codePoint: formatCodePoint(char),
      tr39,
      nfkc,
      cp,
    });
  }

  rows.sort((a, b) => {
    if (a.cp !== b.cp) return a.cp - b.cp;
    if (a.tr39 !== b.tr39) return a.tr39.localeCompare(b.tr39);
    return a.nfkc.localeCompare(b.nfkc);
  });

  return rows.map(({ cp: _cp, ...row }) => row);
}

/**
 * Built-in composability regression corpus:
 * characters where TR39 confusables and NFKC disagree on ASCII targets.
 */
export const NFKC_TR39_DIVERGENCE_VECTORS: NfkcTr39DivergenceVector[] =
  deriveNfkcTr39DivergenceVectors(CONFUSABLE_MAP_FULL);

/** Named composability regression suite (TR39-full vs NFKC lowercase). */
export const COMPOSABILITY_VECTOR_SUITE = "nfkc-tr39-divergence-v2";

/** Named alias for `NFKC_TR39_DIVERGENCE_VECTORS` for cross-library regression tests. */
export const COMPOSABILITY_VECTORS: readonly ComposabilityVector[] =
  NFKC_TR39_DIVERGENCE_VECTORS;

/** Number of vectors in the composability regression suite. */
export const COMPOSABILITY_VECTORS_COUNT = COMPOSABILITY_VECTORS.length;


/**
 * Create a validator that rejects identifiers containing homoglyph/confusable characters.
 *
 * Catches spoofing attacks where characters from other scripts are substituted for
 * visually identical Latin characters (e.g., Cyrillic "а" for Latin "a" in "admin").
 * Uses `CONFUSABLE_MAP` (1,018 characters): Unicode's confusables.txt with NFKC's own
 * mappings left out, plus the lookalikes confusable-vision found alike in place. It
 * refuses any name containing one of these characters, including names written wholly
 * in another script (москва) and Latin letters listed as lookalikes (í, ı).
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
}): NamespaceValidator {
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

  return async (value: string, context?: { identifier: string }) => {
    // Check 1: Any confusable character present → reject. The identifier as typed too: lowercasing can turn a
    // lookalike capital into a letter that is not one (Cherokee Ꭱ into ꭱ)
    const typed = context?.identifier?.normalize("NFKC");
    if (confusableRegex && (confusableRegex.test(value) || (typed !== undefined && confusableRegex.test(typed)))) {
      return { available: false, message };
    }

    // Check 2: Mixed-script detection (optional)
    if (rejectMixedScript) {
      if (hasMixedScripts(value)) {
        return { available: false, message };
      }
    }

    return null;
  };
}

/** Matches Unicode Default_Ignorable_Code_Point characters (TR39 skeleton step 2). */
const DEFAULT_IGNORABLE_RE =
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFF8\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0000}-\u{E0FFF}]/gu;
const DEFAULT_IGNORABLE_SINGLE_RE = new RegExp(DEFAULT_IGNORABLE_RE.source, "u");
const BIDI_CONTROL_RE = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;
const COMBINING_MARK_RE = /\p{M}/u;
/** Combining Diacritical Marks, its Extended and Supplement blocks, marks for symbols, and half marks. */
const DIACRITIC_RE = /[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/gu;
const LETTER_RE = /\p{L}/u;
const LATIN_SCRIPT_RE = /\p{Script=Latin}/u;
const SCRIPT_DETECTORS: Array<[string, RegExp]> = [
  ["latin", /\p{Script=Latin}/u],
  ["cyrillic", /\p{Script=Cyrillic}/u],
  ["greek", /\p{Script=Greek}/u],
  ["armenian", /\p{Script=Armenian}/u],
  ["hebrew", /\p{Script=Hebrew}/u],
  ["arabic", /\p{Script=Arabic}/u],
  ["devanagari", /\p{Script=Devanagari}/u],
  ["han", /\p{Script=Han}/u],
  ["hiragana", /\p{Script=Hiragana}/u],
  ["katakana", /\p{Script=Katakana}/u],
  ["hangul", /\p{Script=Hangul}/u],
  ["georgian", /\p{Script=Georgian}/u],
  ["thai", /\p{Script=Thai}/u],
];
const WORD_TOKEN_CHAR_RE = /[\p{L}\p{N}\p{M}_]/u;
const DEFAULT_SCAN_RISK_TERMS = Object.freeze([
  "liability",
  "indemnity",
  "penalty",
  "damages",
  "termination",
  "breach",
  "warranty",
  "payment",
  "invoice",
  "governing",
  "jurisdiction",
  "arbitration",
  "confidentiality",
]);

type NormalizedScanOptions = {
  threshold: number;
  /** Whether the caller set `threshold`, making it a floor as well as the tamper signal */
  thresholdIsFloor: boolean;
  includeNovel: boolean;
  scripts: Set<string> | null;
  riskTerms: string[];
  strategy: "mixed" | "all";
  maxSizeRatio: number;
};

type TokenChar = {
  ch: string;
  index: number;
};

/** Cached default options (frozen, safe to share across calls). */
const DEFAULT_NORMALIZED_SCAN_OPTIONS: NormalizedScanOptions = Object.freeze({
  threshold: 0.7,
  thresholdIsFloor: false,
  includeNovel: true,
  scripts: null,
  riskTerms: DEFAULT_SCAN_RISK_TERMS as unknown as string[],
  strategy: "mixed" as const,
  maxSizeRatio: 3.0,
});

function normalizeScanOptions(options?: ScanOptions): NormalizedScanOptions {
  if (!options) return DEFAULT_NORMALIZED_SCAN_OPTIONS;

  const threshold = clamp(options.threshold ?? 0.7, 0, 1);
  const includeNovel = options.includeNovel ?? true;
  const strategy = options.strategy === "all" ? "all" as const : "mixed" as const;
  const scripts =
    options.scripts && options.scripts.length > 0
      ? new Set(
          options.scripts
            .map((value) => value.trim().toLowerCase())
            .filter((value) => value.length > 0)
        )
      : null;
  const riskTerms =
    options.riskTerms && options.riskTerms.length > 0
      ? options.riskTerms.map((value) => value.toLowerCase())
      : [...DEFAULT_SCAN_RISK_TERMS];

  const maxSizeRatio = options.maxSizeRatio ?? 3.0;
  const thresholdIsFloor = options.threshold !== undefined;

  return { threshold, thresholdIsFloor, includeNovel, scripts, riskTerms, strategy, maxSizeRatio };
}

/** Fast ASCII check via code-unit scan. No confusable char exists below U+00D7. */
function isAllAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

/** Precomputed codepoint set for O(1) confusable-char membership testing. */
const CONFUSABLE_CODEPOINT_SET: Set<number> = new Set(
  Object.keys(LLM_CONFUSABLE_MAP).map(ch => ch.codePointAt(0)!)
);

const ASCII_LETTER_RE = /^[A-Za-z]$/;

const NFKC_LETTER_CACHE = new Map<string, string | undefined>();

/** A letter NFKC maps to one ASCII letter (fullwidth, mathematical, most modifier letters), or undefined */
function nfkcLetter(ch: string): string | undefined {
  if (NFKC_LETTER_CACHE.has(ch)) return NFKC_LETTER_CACHE.get(ch);
  const n = ch.normalize("NFKC");
  const letter = n !== ch && ASCII_LETTER_RE.test(n) ? n : undefined;
  if (NFKC_LETTER_CACHE.size < 4096) NFKC_LETTER_CACHE.set(ch, letter);
  return letter;
}

/** Check if any character is one canonicalise() could rewrite: a key in the LLM confusable map, or a letter built on
 * a Latin letter. */
function hasAnyConfusableChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const cp = s.codePointAt(i)!;
    if (cp > 0x7f) {
      if (CONFUSABLE_CODEPOINT_SET.has(cp)) return true;
      const ch = String.fromCodePoint(cp);
      if (LATIN_FOLD[ch] || nfkcLetter(ch)) return true;
    }
    if (cp > 0xffff) i++; // skip low surrogate
  }
  return false;
}

/** A Latin letter not in modern use (ɦ, ꞡ, ꝱ), or a letter NFKC maps to an ASCII letter (fullwidth, mathematical): a
 * sign the word around it was tampered with. Letters in modern use (ŧ, İ, ö) aren't. */
function isRareLatinLetter(ch: string): boolean {
  return LATIN_NOT_IN_MODERN_USE.has(ch) || nfkcLetter(ch) !== undefined;
}

function isWordTokenChar(ch: string): boolean {
  return WORD_TOKEN_CHAR_RE.test(ch);
}

function hasMixedScriptsInToken(token: TokenChar[]): { hasLatin: boolean; mixedScript: boolean } {
  let hasLatin = false;
  let hasNonLatin = false;

  for (const { ch } of token) {
    if (!LETTER_RE.test(ch)) continue;
    if (LATIN_SCRIPT_RE.test(ch)) hasLatin = true;
    else hasNonLatin = true;
    if (hasLatin && hasNonLatin) break;
  }

  return { hasLatin, mixedScript: hasLatin && hasNonLatin };
}

function pickConfusableEntry(
  ch: string,
  options: NormalizedScanOptions,
  threshold = options.threshold
): LlmConfusableMapEntry | null {
  const candidates = LLM_CONFUSABLE_MAP[ch];
  if (!candidates || candidates.length === 0) return null;

  for (const candidate of candidates) {
    if (candidate.visualScore < threshold) continue;
    if (!options.includeNovel && candidate.source === "novel") continue;
    if (options.scripts && !options.scripts.has(candidate.script.toLowerCase())) continue;
    // Size-ratio filter: skip novel pairs with extreme size differences.
    // TR39 pairs and pairs without measured ratios are always allowed.
    if (
      candidate.source === "novel" &&
      Number.isFinite(options.maxSizeRatio) &&
      (
        (candidate.widthRatio != null && candidate.widthRatio > options.maxSizeRatio) ||
        (candidate.heightRatio != null && candidate.heightRatio > options.maxSizeRatio)
      )
    ) continue;
    return candidate;
  }

  return null;
}

function forEachToken(
  input: string,
  onToken: (token: TokenChar[]) => boolean | void,
  onSeparator?: (separator: string) => void
): boolean {
  let token: TokenChar[] = [];
  let index = 0;

  const flush = () => {
    if (token.length === 0) return true;
    const keepGoing = onToken(token);
    token = [];
    return keepGoing !== false;
  };

  for (const ch of input) {
    if (isWordTokenChar(ch)) {
      token.push({ ch, index });
    } else {
      if (!flush()) return false;
      if (onSeparator) onSeparator(ch);
    }
    index += ch.length;
  }

  if (!flush()) return false;
  return true;
}

/** One character canonicalise() rewrites, and what replaces it */
type TokenFold = {
  item: TokenChar;
  latin: string;
  /** The map entry used, or null for a letter folded to the Latin letter it's built on */
  entry: LlmConfusableMapEntry | null;
};

/** A non-ASCII capital inside an otherwise lowercase word, such as İ in ŧİme */
function hasSwappedCapital(token: TokenChar[]): boolean {
  const letters = token.filter((t) => letterCase(t.ch) !== "none");
  const capitals = letters.slice(1).filter((t) => letterCase(t.ch) === "upper");
  return capitals.length === 1 && capitals[0].ch.charCodeAt(0) > 0x7f && letters.length > 2;
}

/** Whether a word shows a sign of tampering (see `CanonicaliseOptions`); with strategy "all", every word does */
function isTamperedToken(token: TokenChar[], options: NormalizedScanOptions): boolean {
  // An ASCII word has nothing to rewrite
  if (token.every((t) => t.ch.charCodeAt(0) <= 0x7f)) return false;
  if (options.strategy === "all") return true;
  const { hasLatin, mixedScript } = hasMixedScriptsInToken(token);
  if (mixedScript) return true;
  for (const { ch } of token) if (ch.charCodeAt(0) > 0x7f && isRareLatinLetter(ch)) return true;
  if (!hasLatin) return false;
  if (hasSwappedCapital(token)) return true;
  for (const { ch } of token) if (ch.charCodeAt(0) > 0x7f && pickConfusableEntry(ch, options)) return true;
  return false;
}

/** What replaces one character of a tampered word. The map decides for the characters it lists, under the caller's
 * filters; in a tampered word a listed lookalike needs no minimum score unless the caller set one. Other letters built
 * on a Latin letter fold to it. */
function foldChar(ch: string, options: NormalizedScanOptions): Omit<TokenFold, "item"> | null {
  if (ch.charCodeAt(0) <= 0x7f) return null;
  if (LLM_CONFUSABLE_MAP[ch]) {
    const entry = pickConfusableEntry(ch, options, options.thresholdIsFloor ? options.threshold : 0);
    return entry ? { latin: entry.latin, entry } : null;
  }
  if (options.scripts && !options.scripts.has("latin")) return null;
  const latin = LATIN_FOLD[ch] ?? nfkcLetter(ch);
  return latin ? { latin, entry: null } : null;
}

function letterCase(s: string): "upper" | "lower" | "none" {
  return s !== s.toLowerCase() ? "upper" : s !== s.toUpperCase() ? "lower" : "none";
}

/**
 * The rewrites for one tampered word, in the case of the word around them. The word's case comes from the letters
 * an attacker didn't swap in as capitals: its ASCII letters and its lowercase lookalikes, after the first letter.
 *
 * - In a word in capitals (ꟾİABILIŦY), every rewrite is a capital.
 * - In a lowercase word (Tɦİs, wrİŧİꞡ), every rewrite after the first letter is lowercase, and a first letter is a
 *   capital only if its lookalike was one and the word starts a sentence or line (İs mid-sentence reads "is").
 *   A word with no such letters to go by (İᵴ) is taken as lowercase.
 * - In a word of mixed case (McDonald), each lookalike keeps its own case, and one without case (ᵂ) is lowercase.
 */
function foldToken(token: TokenChar[], options: NormalizedScanOptions, startsSentence = true): TokenFold[] {
  const folds: TokenFold[] = [];
  for (const item of token) {
    const fold = foldChar(item.ch, options);
    if (fold) folds.push({ item, ...fold });
  }
  if (folds.length === 0) return folds;

  const own = new Map(folds.map((f) => [f.item, letterCase(f.item.ch)]));
  const firstLetter = token.find((t) => LETTER_RE.test(t.ch));
  let upper = 0, lower = 0;
  for (const t of token) {
    if (t === firstLetter) continue;
    const c = own.has(t) ? (own.get(t) === "lower" ? "lower" : "none") : letterCase(t.ch);
    if (c === "upper") upper++;
    else if (c === "lower") lower++;
  }
  const body = upper && !lower ? "upper" : upper && lower ? "mixed" : "lower";

  return folds.map((f) => {
    const c = own.get(f.item)!;
    let up: boolean;
    if (body === "upper") up = true;
    else if (body === "mixed") up = c === "upper";
    else up = f.item === firstLetter && c === "upper" && startsSentence;
    return { ...f, latin: up ? f.latin.toUpperCase() : f.latin.toLowerCase() };
  });
}

/**
 * Calls onToken for each word with whether it starts a sentence or a paragraph: the text's first word, or the first
 * after `.`, `!`, `?`, `:` or a blank line. A single line break doesn't count, since text is often wrapped mid-sentence.
 */
function forEachTokenInSentence(input: string, onToken: (token: TokenChar[], startsSentence: boolean) => boolean | void): void {
  let starts = true;
  let lineBreaks = 0;
  forEachToken(
    input,
    (token) => {
      const keepGoing = onToken(token, starts);
      starts = false;
      lineBreaks = 0;
      return keepGoing;
    },
    (separator) => {
      if (separator === "\n" && ++lineBreaks >= 2) starts = true;
      else if (separator === "." || separator === "!" || separator === "?" || separator === ":") starts = true;
    }
  );
}

function riskLevelFromFindings(
  findingCount: number,
  tamperedFindingCount: number,
  tamperedWords: Set<string>,
  targetedWords: Set<string>
): "none" | "low" | "medium" | "high" {
  if (findingCount === 0) return "none";
  if (tamperedFindingCount === 0) return "low";

  if (
    tamperedWords.size >= 3 ||
    tamperedFindingCount >= 6 ||
    targetedWords.size >= 2 ||
    (targetedWords.size >= 1 && tamperedFindingCount >= 3)
  ) {
    return "high";
  }

  return "medium";
}

/**
 * Create a validator that rejects invisible/control Unicode characters often used
 * for evasion and text-direction spoofing (Trojan Source style).
 *
 * @param options - Optional settings
 * @param options.message - Custom rejection message
 * @param options.rejectDefaultIgnorables - Reject Unicode Default_Ignorable_Code_Point characters (default: true)
 * @param options.rejectBidiControls - Reject bidi direction/control characters (default: true)
 * @param options.rejectCombiningMarks - Reject combining marks (default: false)
 * @returns An async validator function for use in `config.validators`
 */
export function createInvisibleCharacterValidator(
  options?: InvisibleCharacterValidatorOptions
): NamespaceValidator {
  const message =
    options?.message ??
    "That name contains invisible or direction-control characters.";
  const rejectDefaultIgnorables = options?.rejectDefaultIgnorables ?? true;
  const rejectBidiControls = options?.rejectBidiControls ?? true;
  const rejectCombiningMarks = options?.rejectCombiningMarks ?? false;

  return async (value: string) => {
    if (rejectBidiControls && BIDI_CONTROL_RE.test(value)) {
      return { available: false, message };
    }

    if (rejectDefaultIgnorables && DEFAULT_IGNORABLE_SINGLE_RE.test(value)) {
      return { available: false, message };
    }

    if (rejectCombiningMarks && COMBINING_MARK_RE.test(value)) {
      return { available: false, message };
    }

    return null;
  };
}

/**
 * Canonicalise confusable characters in text for LLM preprocessing.
 *
 * With the default `strategy: "mixed"`, only rewrites characters inside tokens
 * that already contain Latin letters.  Standalone non-Latin words are preserved
 * to reduce false positives in multilingual text.
 *
 * With `strategy: "all"`, rewrites every confusable character regardless of
 * context.  Use this when the document is known to be Latin-script.
 */
export function canonicalise(text: string, options?: CanonicaliseOptions): string {
  if (text.length === 0) return "";
  // Fast path: pure ASCII or no confusable chars means nothing to rewrite
  if (isAllAscii(text) || !hasAnyConfusableChar(text)) return text;

  const normalized = normalizeScanOptions(options);

  // Collect sparse replacements: [index, charLength, replacement]
  const replacements: Array<[number, number, string]> = [];

  forEachTokenInSentence(text, (token, startsSentence) => {
    if (!isTamperedToken(token, normalized)) return;
    for (const fold of foldToken(token, normalized, startsSentence)) {
      replacements.push([fold.item.index, fold.item.ch.length, fold.latin]);
    }
  });

  if (replacements.length === 0) return text;

  // Rebuild from original text slices + replacements (avoids per-char push+join)
  let result = "";
  let pos = 0;
  for (const [idx, len, replacement] of replacements) {
    result += text.slice(pos, idx) + replacement;
    pos = idx + len;
  }
  result += text.slice(pos);
  return result;
}

/**
 * Scan text for confusable characters and return structured findings + risk summary.
 */
export function scan(text: string, options?: ScanOptions): ScanResult {
  // Fast path: empty, pure ASCII, or no confusable chars
  if (text.length === 0 || isAllAscii(text) || !hasAnyConfusableChar(text)) {
    return {
      hasConfusables: false,
      count: 0,
      findings: [],
      summary: {
        distinctChars: 0,
        wordsAffected: 0,
        scriptsDetected: [],
        riskLevel: "none",
      },
    };
  }

  const normalized = normalizeScanOptions(options);
  const findings: ScanFinding[] = [];
  const distinctChars = new Set<string>();
  const wordsAffected = new Set<string>();
  const scriptsDetected = new Set<string>();
  const tamperedWords = new Set<string>();
  const targetedWords = new Set<string>();
  let tamperedFindings = 0;

  const report = (item: TokenChar, word: string, mixedScript: boolean, latin: string, entry: LlmConfusableMapEntry | null) => {
    const script = entry?.script ?? (LATIN_SCRIPT_RE.test(item.ch) ? "Latin" : "Common");
    findings.push({
      char: item.ch,
      codepoint: entry?.codepoint || formatCodePoint(item.ch),
      script,
      latinEquivalent: latin,
      visualScore: entry?.visualScore ?? 0,
      source: entry?.source ?? "fold",
      index: item.index,
      word,
      mixedScript,
    });
    distinctChars.add(item.ch);
    wordsAffected.add(word.toLowerCase());
    scriptsDetected.add(script);
  };

  forEachToken(text, (token) => {
    if (token.length === 0) return;

    const word = token.map((item) => item.ch).join("");
    const lowerWord = word.toLowerCase();
    const { mixedScript } = hasMixedScriptsInToken(token);

    // A tampered word: everything canonicalise() rewrites
    if (isTamperedToken(token, normalized)) {
      const folds = foldToken(token, normalized);
      if (folds.length === 0) return;
      for (const fold of folds) {
        const base = fold.entry?.latin ?? LATIN_FOLD[fold.item.ch] ?? nfkcLetter(fold.item.ch) ?? fold.latin;
        report(fold.item, word, mixedScript, base, fold.entry);
      }
      tamperedWords.add(lowerWord);
      tamperedFindings += folds.length;
      const byIndex = new Map(folds.map((f) => [f.item.index, f.latin]));
      const canonicalWord = token.map((item) => byIndex.get(item.index) ?? item.ch).join("").toLowerCase();
      if (normalized.riskTerms.some((term) => canonicalWord.includes(term))) targetedWords.add(lowerWord);
      return;
    }

    // Any other word: listed lookalikes, such as a Russian word's letters, reported at low risk and left as they are
    for (const item of token) {
      const entry = pickConfusableEntry(item.ch, normalized);
      if (entry) report(item, word, mixedScript, entry.latin, entry);
    }
  });

  const riskLevel = riskLevelFromFindings(findings.length, tamperedFindings, tamperedWords, targetedWords);
  return {
    hasConfusables: findings.length > 0,
    count: findings.length,
    findings,
    summary: {
      distinctChars: distinctChars.size,
      wordsAffected: wordsAffected.size,
      scriptsDetected: [...scriptsDetected].sort((a, b) => a.localeCompare(b)),
      riskLevel,
    },
  };
}

/**
 * Fast gate for LLM pipelines: `true` exactly when `canonicalise()` with the
 * same options would leave the text unchanged.
 *
 * With the default `strategy: "mixed"`, returns `false` as soon as a word
 * that shows a sign of tampering has a character to rewrite (see
 * `CanonicaliseOptions`).  Standalone non-Latin words and ordinary accented
 * words do not fail this gate.
 *
 * With `strategy: "all"`, returns `false` if any confusable character or
 * letter built on a Latin letter is found, regardless of surrounding context.
 */
export function isClean(text: string, options?: ScanOptions): boolean {
  if (text.length === 0) return true;
  // Fast path: pure ASCII text has nothing to rewrite
  if (isAllAscii(text)) return true;
  // Fast path: no character canonicalise() could rewrite, so skip tokenization
  if (!hasAnyConfusableChar(text)) return true;

  const normalized = normalizeScanOptions(options);

  let clean = true;
  forEachToken(text, (token) => {
    if (!isTamperedToken(token, normalized)) return;
    for (const item of token) {
      if (foldChar(item.ch, normalized)) {
        clean = false;
        return false;
      }
    }
  });

  return clean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function toCodePoints(value: string): string[] {
  return Array.from(value);
}

function getScriptTag(ch: string): string {
  for (const [tag, re] of SCRIPT_DETECTORS) {
    if (re.test(ch)) return tag;
  }
  if (LETTER_RE.test(ch)) return "other-letter";
  return "non-letter";
}

function isDefaultIgnorableChar(ch: string): boolean {
  return DEFAULT_IGNORABLE_SINGLE_RE.test(ch);
}

function hasMixedScripts(value: string): boolean {
  let hasLatin = false;
  let hasNonLatin = false;

  for (const ch of value) {
    if (!LETTER_RE.test(ch)) continue;
    if (LATIN_SCRIPT_RE.test(ch)) {
      hasLatin = true;
    } else {
      hasNonLatin = true;
    }
    if (hasLatin && hasNonLatin) return true;
  }

  return false;
}

function countDefaultIgnorables(value: string): number {
  let count = 0;
  for (const ch of value) {
    if (isDefaultIgnorableChar(ch)) count++;
  }
  return count;
}

function isNfkcDivergentMapping(ch: string, mapped: string): boolean {
  // Only non-ASCII characters mapped to one letter: ASCII entries (1 -> l) and multi-letter prototypes (m -> rn) are
  // Unicode's own prototypes, not NFKC disagreeing with TR39
  if (ch.codePointAt(0)! < 0x80 || mapped.length !== 1) return false;
  const nfkc = ch.normalize("NFKC").toLowerCase();
  return /^[a-z0-9]$/.test(nfkc) && nfkc !== mapped;
}

/** Whether a character may appear in identifiers (XID_Continue) or in domain names (IDNA 2008 PVALID). A weight's flags
 *  describe its first character, so a character the table lists first is read from its own entries. Any other is
 *  worked out: XID_Continue exactly; PVALID as lowercase ASCII letters, digits and the hyphen, or a letter, mark or
 *  number that NFKC and case folding leave as it is (on the bundled weights, this agrees with Unicode's IDNA table for
 *  every character). */
function allowedInContext(ch: string, weights: ConfusableWeights, context: "identifier" | "domain"): boolean {
  const own = weights[ch];
  for (const target in own) {
    return context === "identifier" ? own[target].xidContinue === true : own[target].idnaPvalid === true;
  }
  if (context === "identifier") return /^\p{XID_Continue}$/u.test(ch);
  if (ch.codePointAt(0)! < 0x80) return /^[a-z0-9-]$/.test(ch);
  if (!/^[\p{L}\p{M}\p{N}]$/u.test(ch) || /\p{Default_Ignorable_Code_Point}/u.test(ch) || ch.normalize("NFKC") !== ch) {
    return false;
  }
  // Case folding: Cherokee folds to its capitals, dotless ı to itself, other letters to lowercase
  if (/\p{Script=Cherokee}/u.test(ch)) return ch.toLowerCase().toUpperCase() === ch;
  const upper = ch.toUpperCase();
  return ch === "ı" || (ch.toLowerCase() === ch && (Array.from(upper).length > 1 || upper.toLowerCase() === ch));
}

function lookupWeight(
  from: string,
  to: string,
  weights: ConfusableWeights | undefined,
  context: "identifier" | "domain" | "all"
): ConfusableWeight | undefined {
  if (!weights) return undefined;
  // Two characters that look alike do so either way round, so the pair may be listed under either one
  const forward = weights[from]?.[to];
  const w = forward ?? weights[to]?.[from];
  if (!w || context === "all") return w;
  // In a context, both characters must be allowed there. The entry's flags describe its first character only, so the
  // other is checked on its own: Han 丨 may appear in a domain name, Hangul ㅣ may not, so the pair doesn't count there
  const flag = context === "identifier" ? w.xidContinue : w.idnaPvalid;
  return flag && allowedInContext(forward ? to : from, weights, context) ? w : undefined;
}

function buildSubstitutionStep(
  from: string,
  to: string,
  fromIndex: number,
  toIndex: number,
  map: Record<string, string>,
  weights?: ConfusableWeights,
  context?: "identifier" | "domain" | "all"
): ConfusableDistanceStep {
  if (from === to || from.toLowerCase() === to.toLowerCase()) {
    return { op: "match", from, to, fromIndex, toIndex, cost: 0 };
  }

  const weight = lookupWeight(from, to, weights, context ?? "all");
  const fromPrototype = prototypeOf(from, map, true);
  const toPrototype = prototypeOf(to, map, true);

  if (fromPrototype === toPrototype) {
    const fromScript = getScriptTag(from);
    const toScript = getScriptTag(to);
    const crossScript =
      fromScript !== "non-letter" &&
      toScript !== "non-letter" &&
      fromScript !== toScript;
    const divergence =
      isNfkcDivergentMapping(from, fromPrototype) ||
      isNfkcDivergentMapping(to, toPrototype);

    // Use measured cost when weights are available; fall back to hardcoded 0.35
    let cost = weight?.glyphReuse ? 0 : (weight?.cost ?? 0.35);
    let reason: ConfusableDistanceStep["reason"];
    if (crossScript) {
      cost += 0.2;
      reason = "cross-script";
    }
    if (divergence) {
      cost += 0.1;
      if (!reason) reason = "nfkc-divergence";
    }

    return {
      op: "confusable-substitution",
      from,
      to,
      fromIndex,
      toIndex,
      cost,
      prototype: fromPrototype,
      crossScript,
      divergence,
      reason,
    };
  }

  const fromNfkc = from.normalize("NFKC").toLowerCase();
  const toNfkc = to.normalize("NFKC").toLowerCase();
  if (fromNfkc === toNfkc) {
    return {
      op: "substitution",
      from,
      to,
      fromIndex,
      toIndex,
      cost: 0.45,
      reason: "nfkc-equivalent",
    };
  }

  // Novel pairs: not in TR39 map or NFKC, but present in weight graph
  if (weight) {
    return {
      op: "substitution",
      from,
      to,
      fromIndex,
      toIndex,
      cost: weight.cost,
      reason: "visual-weight",
    };
  }

  return { op: "substitution", from, to, fromIndex, toIndex, cost: 1 };
}

function buildDeletionStep(ch: string, fromIndex: number, toIndex: number): ConfusableDistanceStep {
  if (isDefaultIgnorableChar(ch)) {
    return {
      op: "deletion",
      from: ch,
      fromIndex,
      toIndex,
      cost: 0.05,
      reason: "default-ignorable",
    };
  }
  return { op: "deletion", from: ch, fromIndex, toIndex, cost: 1 };
}

function buildInsertionStep(ch: string, fromIndex: number, toIndex: number): ConfusableDistanceStep {
  if (isDefaultIgnorableChar(ch)) {
    return {
      op: "insertion",
      to: ch,
      fromIndex,
      toIndex,
      cost: 0.05,
      reason: "default-ignorable",
    };
  }
  return { op: "insertion", to: ch, fromIndex, toIndex, cost: 1 };
}

/**
 * Compute the TR39 Section 4 skeleton of a string for confusable comparison.
 *
 * Implements `internalSkeleton`:
 * 1. NFD normalize
 * 2. Remove Default_Ignorable_Code_Point characters
 * 3. Replace each character via the confusable map
 * 4. Reapply NFD
 * 5. Lowercase
 *
 * The default map is `CONFUSABLE_MAP_FULL` (the complete TR39 mapping without
 * NFKC filtering), which matches the NFD-based pipeline used by ICU, Chromium,
 * and the TR39 spec itself. Pass `{ map: CONFUSABLE_MAP }` if your pipeline
 * runs NFKC normalization before calling skeleton().
 *
 * @param input - The string to skeletonize
 * @param options - Optional settings (custom confusable map)
 * @returns The skeleton string for comparison
 *
 * @example
 * ```ts
 * skeleton("paypal") === skeleton("\u0440\u0430ypal") // true (Cyrillic р/а)
 * skeleton("pay\u200Bpal") === skeleton("paypal")     // true (zero-width stripped)
 * ```
 */
export function skeleton(input: string, options?: SkeletonOptions): string {
  const map = options?.map ?? CONFUSABLE_MAP_FULL;
  const dropMarks = (v: string) => (options?.ignoreDiacritics ? v.replace(DIACRITIC_RE, "") : v);
  // Step 1: NFD normalize, keeping whole the characters the map lists that NFD splits (í, ḋ, Ά), so they map
  let s = dropMarks(rejoinSplitListed(input.normalize("NFD"), map));
  // Step 2: Remove Default_Ignorable_Code_Point characters
  s = s.replace(DEFAULT_IGNORABLE_RE, "");
  // Step 3: Replace each character via confusable map (for...of iterates by code point)
  let result = "";
  const cased = options?.preserveCase ?? false;
  for (const ch of s) {
    result += map[ch] ?? (cased ? CONFUSABLE_MAP_CASED[ch] : undefined) ?? ch;
  }
  // Step 4: Reapply NFD
  result = dropMarks(result.normalize("NFD"));
  // Step 5: Lowercase
  return result.toLowerCase();
}

/**
 * Compute a weighted confusable distance between two strings.
 *
 * Uses a shortest-path edit model where substitutions between characters that share
 * a TR39 prototype are low cost, default-ignorable insertions/deletions are very low
 * cost, and cross-script confusable substitutions increase risk and chain depth.
 *
 * This keeps TR39 skeleton equality as the baseline while exposing a graded score.
 */
export function confusableDistance(
  a: string,
  b: string,
  options?: ConfusableDistanceOptions
): ConfusableDistanceResult {
  const map = options?.map ?? CONFUSABLE_MAP_FULL;
  const weights = options?.weights;
  const context = options?.context ?? "all";
  // Case is kept so each character is looked up as typed (Greek Η is h, η is n); letters equal but for case match.
  // Characters the map lists that NFD splits (í, ḋ, Ά) stay whole, so they compare as the lookalikes they are.
  const left = toCodePoints(rejoinSplitListed(a.normalize("NFD"), map));
  const right = toCodePoints(rejoinSplitListed(b.normalize("NFD"), map));
  const proto = (ch: string) => prototypeOf(ch, map, true);
  const m = left.length;
  const n = right.length;

  const distance = Array.from({ length: m + 1 }, () =>
    Array<number>(n + 1).fill(Number.POSITIVE_INFINITY)
  );
  const back = Array.from({ length: m + 1 }, () =>
    Array<{ prevI: number; prevJ: number; step: ConfusableDistanceStep } | null>(n + 1).fill(null)
  );

  distance[0][0] = 0;

  for (let i = 1; i <= m; i++) {
    const step = buildDeletionStep(left[i - 1], i - 1, 0);
    distance[i][0] = distance[i - 1][0] + step.cost;
    back[i][0] = { prevI: i - 1, prevJ: 0, step };
  }

  for (let j = 1; j <= n; j++) {
    const step = buildInsertionStep(right[j - 1], 0, j - 1);
    distance[0][j] = distance[0][j - 1] + step.cost;
    back[0][j] = { prevI: 0, prevJ: j - 1, step };
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const substitution = buildSubstitutionStep(left[i - 1], right[j - 1], i - 1, j - 1, map, weights, context);
      const deletion = buildDeletionStep(left[i - 1], i - 1, j);
      const insertion = buildInsertionStep(right[j - 1], i, j - 1);
      const candidates: Array<{ total: number; prevI: number; prevJ: number; step: ConfusableDistanceStep; priority: number }> = [
        {
          total: distance[i - 1][j - 1] + substitution.cost,
          prevI: i - 1,
          prevJ: j - 1,
          step: substitution,
          priority: 0,
        },
        {
          total: distance[i - 1][j] + deletion.cost,
          prevI: i - 1,
          prevJ: j,
          step: deletion,
          priority: 1,
        },
        {
          total: distance[i][j - 1] + insertion.cost,
          prevI: i,
          prevJ: j - 1,
          step: insertion,
          priority: 2,
        },
      ];

      // One character standing for two (m for rn, ǁ for ll), either way round
      if (j >= 2 && proto(left[i - 1]).length === 2 && proto(left[i - 1]) === proto(right[j - 2]) + proto(right[j - 1])) {
        candidates.push({
          total: distance[i - 1][j - 2] + 0.35,
          prevI: i - 1,
          prevJ: j - 2,
          step: { op: "confusable-substitution", from: left[i - 1], to: right[j - 2] + right[j - 1], fromIndex: i - 1, toIndex: j - 2, cost: 0.35, prototype: proto(left[i - 1]), crossScript: false, divergence: false },
          priority: 0,
        });
      }
      if (i >= 2 && proto(right[j - 1]).length === 2 && proto(right[j - 1]) === proto(left[i - 2]) + proto(left[i - 1])) {
        candidates.push({
          total: distance[i - 2][j - 1] + 0.35,
          prevI: i - 2,
          prevJ: j - 1,
          step: { op: "confusable-substitution", from: left[i - 2] + left[i - 1], to: right[j - 1], fromIndex: i - 2, toIndex: j - 1, cost: 0.35, prototype: proto(right[j - 1]), crossScript: false, divergence: false },
          priority: 0,
        });
      }

      let best = candidates[0];
      for (let k = 1; k < candidates.length; k++) {
        const candidate = candidates[k];
        if (candidate.total < best.total) {
          best = candidate;
          continue;
        }
        if (candidate.total === best.total && candidate.priority < best.priority) {
          best = candidate;
        }
      }

      distance[i][j] = best.total;
      back[i][j] = { prevI: best.prevI, prevJ: best.prevJ, step: best.step };
    }
  }

  const steps: ConfusableDistanceStep[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    const cell = back[i][j];
    if (!cell) break;
    steps.push(cell.step);
    i = cell.prevI;
    j = cell.prevJ;
  }
  steps.reverse();

  let chainDepth = 0;
  let crossScriptCount = 0;
  let ignorableCount = 0;
  let divergenceCount = 0;

  for (const step of steps) {
    if (step.op !== "match") chainDepth++;
    if (step.crossScript) crossScriptCount++;
    if (step.reason === "default-ignorable") ignorableCount++;
    if (step.divergence) divergenceCount++;
  }

  const maxDistance = Math.max(m, n, 1);
  const rawDistance = distance[m][n];
  const similarity = 1 - clamp(rawDistance / maxDistance, 0, 1);

  const aNfkc = a.normalize("NFKC").toLowerCase();
  const bNfkc = b.normalize("NFKC").toLowerCase();

  return {
    distance: round3(rawDistance),
    maxDistance,
    similarity: round3(similarity),
    skeletonEqual: skeleton(a, { map }) === skeleton(b, { map }),
    normalizedEqual: aNfkc === bNfkc,
    chainDepth,
    crossScriptCount,
    ignorableCount,
    divergenceCount,
    steps,
  };
}

/**
 * Check whether two strings are visually confusable.
 *
 * Without `weights`, compares TR39 skeletons only (backward compatible).
 * With `weights`, also lines the two strings up character by character: they are confusable when each position's
 * characters share a skeleton or are a measured pair (in `context`), in order, with one character allowed to stand
 * for several (m for rn). This finds pairs no standard lists, such as two non-Latin scripts.
 *
 * @param a - First string
 * @param b - Second string
 * @param options - Optional settings (custom confusable map, weights, context)
 * @returns `true` if the strings are considered confusable
 *
 * @example
 * ```ts
 * areConfusable("paypal", "\u0440\u0430ypal")           // true (skeleton match)
 * areConfusable("hello", "world")                        // false
 * areConfusable("\u3163", "\u4E28", { weights })         // true: Hangul \u3163 and Han \u4E28, a measured pair
 * areConfusable("\u3163", "\u4E28")                      // false (no weights = skeleton only)
 * ```
 */
export function areConfusable(
  a: string,
  b: string,
  options?: AreConfusableOptions
): boolean {
  if (skeleton(a, options) === skeleton(b, options)) return true;
  // As shown with its case (a name displayed as typed): "paypaI" reads as "paypal"
  if (!options?.preserveCase) {
    const cased = { ...options, preserveCase: true };
    if (skeleton(a, cased) === skeleton(b, cased)) return true;
  }
  if (!options?.weights) return false;
  const ctx = options.context ?? "all";
  const w = options.weights;
  // A measured pair needs a character the table lists first, in one string or the other
  const listed = (s: string) => Array.from(s + s.normalize("NFC")).some((ch) => w[ch] !== undefined);
  if (!listed(a) && !listed(b)) return false;

  // Line the two names up, character by character (each with its combining marks), leaving out what the skeleton
  // drops, such as zero-width characters. At each position the two must share a skeleton or be a measured pair, and
  // one character may stand for several, as m does for rn: "Iowa" and "lima" are not alike, though I and l are.
  const split = (s: string) => (s.match(/\P{M}\p{M}*|\p{M}+/gu) ?? []).filter((unit) => skeleton(unit, options) !== "");
  const forms = (unit: string) => (unit.normalize("NFC") === unit ? [unit] : [unit, unit.normalize("NFC")]);
  const left = split(a);
  const right = split(b);
  const leftForms = left.map(forms);
  const rightForms = right.map(forms);
  const measured = (i: number, j: number) =>
    leftForms[i].some((x) => rightForms[j].some((y) => x !== y && lookupWeight(x, y, w, ctx) !== undefined));

  // Without case, then (unless preserveCase is set) with it, as the skeletons above; the same reading throughout
  for (const mode of options.preserveCase ? [options] : [options, { ...options, preserveCase: true }]) {
    const l = left.map((unit) => skeleton(unit, mode));
    const r = right.map((unit) => skeleton(unit, mode));
    // reach[i][j]: the first i characters of a line up with the first j of b
    const reach = Array.from({ length: left.length + 1 }, () => new Array<boolean>(right.length + 1).fill(false));
    reach[0][0] = true;
    for (let i = 0; i <= left.length; i++) {
      for (let j = 0; j <= right.length; j++) {
        if (!reach[i][j]) continue;
        if (i < left.length && j < right.length && (l[i] === r[j] || measured(i, j))) reach[i + 1][j + 1] = true;
        // One character of a standing for several of b, and the other way round
        let joined = "";
        for (let k = j; i < left.length && k < right.length && joined.length < l[i].length; k++) {
          joined += r[k];
          if (k > j && joined === l[i]) reach[i + 1][k + 1] = true;
        }
        joined = "";
        for (let k = i; j < right.length && k < left.length && joined.length < r[j].length; k++) {
          joined += l[k];
          if (k > i && joined === r[j]) reach[k + 1][j + 1] = true;
        }
      }
    }
    if (reach[left.length][right.length]) return true;
  }
  return false;
}

/** Result of cross-script risk analysis on an identifier. */
export type CrossScriptRiskResult = {
  /** Distinct Unicode scripts detected in the identifier. */
  scripts: string[];
  /** Character pairs from different scripts that are visually confusable. */
  crossScriptPairs: Array<{
    a: { char: string; script: string };
    b: { char: string; script: string };
    visualScore: number;
  }>;
  /** Overall risk level: "none" (single script), "low" (matches below 0.8), "high" (visualScore >= 0.8 or 3+ matches). */
  riskLevel: "none" | "low" | "high";
};

/**
 * Detect cross-script confusable risk in an identifier.
 *
 * Analyzes an identifier for characters from multiple Unicode scripts and
 * checks whether any cross-script character pairs are visually confusable
 * according to measured weights.
 *
 * @param identifier - The identifier to analyze
 * @param options - Optional settings (weights for cross-script lookup)
 * @returns Cross-script risk analysis result
 *
 * @example
 * ```ts
 * detectCrossScriptRisk("hello")                          // riskLevel: "none"
 * detectCrossScriptRisk("\u3163\u4E28", { weights })      // riskLevel: "high", scripts: ["han", "hangul"]
 * ```
 */
export function detectCrossScriptRisk(
  identifier: string,
  options?: { weights?: ConfusableWeights }
): CrossScriptRiskResult {
  // Collect characters with their scripts
  const charScripts: Array<{ char: string; script: string }> = [];
  const scriptSet = new Set<string>();
  for (const ch of identifier) {
    const tag = getScriptTag(ch);
    if (tag === "non-letter" || tag === "other-letter") continue;
    charScripts.push({ char: ch, script: tag });
    scriptSet.add(tag);
  }

  const scripts = [...scriptSet].sort();
  if (scripts.length <= 1) {
    return { scripts, crossScriptPairs: [], riskLevel: "none" };
  }

  const crossScriptPairs: CrossScriptRiskResult["crossScriptPairs"] = [];
  const weights = options?.weights;

  if (weights) {
    for (let i = 0; i < charScripts.length; i++) {
      for (let j = i + 1; j < charScripts.length; j++) {
        const ci = charScripts[i];
        const cj = charScripts[j];
        if (ci.script === cj.script) continue;
        const w = lookupWeight(ci.char, cj.char, weights, "all");
        if (w) {
          crossScriptPairs.push({
            a: { char: ci.char, script: ci.script },
            b: { char: cj.char, script: cj.script },
            visualScore: Math.round((1 - w.cost) * 10000) / 10000,
          });
        }
      }
    }
  }

  let riskLevel: CrossScriptRiskResult["riskLevel"];
  if (crossScriptPairs.length === 0) {
    riskLevel = "none";
  } else if (crossScriptPairs.some(p => p.visualScore >= 0.8) || crossScriptPairs.length >= 3) {
    riskLevel = "high";
  } else {
    riskLevel = "low";
  }

  return { scripts, crossScriptPairs, riskLevel };
}

// ---------------------------------------------------------------------------
// isDomainSpoof — realistic domain spoofing guard
// ---------------------------------------------------------------------------

/** A single character-level substitution in a domain spoof. */
export type DomainSpoofSubstitution = {
  /** Position in the label. */
  index: number;
  /** The target's character at this position. */
  from: string;
  /** The label's character (the confusable replacement). */
  to: string;
  /** Visual similarity between the two characters (0–1). */
  similarity: number;
};

/** Result of {@link isDomainSpoof}. */
export type DomainSpoofResult = {
  /** Opinionated verdict: `true` when `danger >= minDanger` and the label is
   *  a single-script confusable of the target. */
  spoof: boolean;
  /** Script of the spoofing label (set whenever a full-script match is found,
   *  even if `danger` is below the threshold). */
  script?: string;
  /** Average visual similarity across substitutions (0–1).
   *  Always set when a script match is found, regardless of `spoof`.
   *  Callers who want finer control can ignore `spoof` and threshold on
   *  `danger` directly. */
  danger?: number;
  /** Per-character substitution details. */
  substitutions?: DomainSpoofSubstitution[];
};

/** Options for {@link isDomainSpoof}. */
export type DomainSpoofOptions = {
  /** Confusable character map (default: `CONFUSABLE_MAP_FULL`). */
  map?: Record<string, string>;
  /** Measured visual weights for similarity scoring. */
  weights?: ConfusableWeights;
  /** Minimum average danger for `spoof` to be `true` (default `0.5`).
   *  Set higher (e.g. `0.7`) for fewer false positives.
   *  The `danger` score is always returned regardless — callers can apply
   *  their own threshold. */
  minDanger?: number;
  /** Known-legitimate non-Latin labels to skip (e.g. `["банк", "москва"]`).
   *  Checked after NFKC + lowercase normalisation. */
  allowlist?: string[];
};

/** Collect the set of known script tags from an array of characters, ignoring non-letter and other-letter. */
function collectScripts(chars: string[]): Set<string> {
  const scripts = new Set<string>();
  for (const ch of chars) {
    const tag = getScriptTag(ch);
    if (tag !== "non-letter" && tag !== "other-letter") {
      scripts.add(tag);
    }
  }
  return scripts;
}

/**
 * Check whether a domain label is a realistic spoof of a target label.
 *
 * ICANN registrars enforce single-script labels under IDN rules, so a
 * mixed-script domain like `pаypal.com` (Cyrillic а + Latin) cannot actually
 * be registered.  This function only flags threats that could produce
 * registrable domain names:
 *
 * - The label must be **single-script** (or single-script + Common characters
 *   like digits and hyphens).
 * - Every non-Common character must be a **confusable** of the corresponding
 *   character in the target, verified against the confusable map and optional
 *   measured weights.
 *
 * Mixed-script substitutions are left out because most registries refuse them
 * (some registered ones exist; d0ma1n finds those).
 *
 * @param label  - The suspicious domain label to check (e.g. Cyrillic "раураl")
 * @param target - The legitimate domain label (e.g. "paypal")
 * @param options - Map, weights, threshold, and allowlist settings
 * @returns Spoof analysis with opinionated verdict and detailed scores
 *
 * @example
 * ```ts
 * import { isDomainSpoof } from "namespace-guard";
 * import { CONFUSABLE_WEIGHTS } from "namespace-guard/confusable-weights";
 *
 * // Full-Cyrillic lookalike — realistic, registrable spoof
 * isDomainSpoof("\u0440\u0430\u0443\u0440\u0430\u04cf", "paypal",
 *   { weights: CONFUSABLE_WEIGHTS });
 * // { spoof: true, script: "cyrillic", danger: 0.781, substitutions: [...] }
 *
 * // Mixed-script — most registries refuse it, so it isn't checked
 * isDomainSpoof("\u0440aypal", "paypal",
 *   { weights: CONFUSABLE_WEIGHTS });
 * // { spoof: false }
 * ```
 */
export function isDomainSpoof(
  label: string,
  target: string,
  options?: DomainSpoofOptions,
): DomainSpoofResult {
  const map = options?.map ?? CONFUSABLE_MAP_FULL;
  const weights = options?.weights;
  const minDanger = options?.minDanger ?? 0.5;

  // Normalise: NFKC + lowercase + strip default-ignorable characters.
  const normLabel = label.normalize("NFKC").toLowerCase().replace(DEFAULT_IGNORABLE_RE, "");
  const normTarget = target.normalize("NFKC").toLowerCase().replace(DEFAULT_IGNORABLE_RE, "");

  // Early exits.
  if (normLabel.length === 0 || normTarget.length === 0) return { spoof: false };
  if (normLabel === normTarget) return { spoof: false };

  const labelChars = Array.from(normLabel);
  const targetChars = Array.from(normTarget);
  if (labelChars.length !== targetChars.length) return { spoof: false };

  // Allowlist check (after normalisation).
  if (options?.allowlist) {
    const allowed = new Set(
      options.allowlist.map(a => a.normalize("NFKC").toLowerCase().replace(DEFAULT_IGNORABLE_RE, "")),
    );
    if (allowed.has(normLabel)) return { spoof: false };
  }

  // Determine the label's script (must be single non-Common script).
  const labelScripts = collectScripts(labelChars);
  if (labelScripts.size === 0) return { spoof: false };  // all digits/hyphens
  if (labelScripts.size > 1) return { spoof: false };    // mixed-script
  const labelScript = [...labelScripts][0];

  // Determine the target's script.
  const targetScripts = collectScripts(targetChars);
  if (targetScripts.size === 1 && targetScripts.has(labelScript)) {
    return { spoof: false };  // same script — not a cross-script spoof
  }

  // Walk characters pairwise and check confusable substitutions.
  const substitutions: DomainSpoofSubstitution[] = [];
  for (let i = 0; i < labelChars.length; i++) {
    const lch = labelChars[i];
    const tch = targetChars[i];

    if (lch === tch) continue;  // identical — no substitution needed

    // Script-neutral characters (digits, hyphens, uncategorised letters)
    // don't need substitution checking.
    const lTag = getScriptTag(lch);
    if (lTag === "non-letter" || lTag === "other-letter") continue;

    // Check if lch is a confusable of tch.
    let similarity: number | undefined;
    const w = lookupWeight(lch, tch, weights, "domain");

    if (map[lch] === tch) {
      // Found via TR39 confusable map: at least the default, raised by a measured weight. A measurement that finds the
      // pair alike in only some fonts does not undo Unicode's own mapping.
      similarity = w ? Math.max(0.5, round3(1 - w.cost)) : 0.5;
    } else if (w) {
      // Novel pair found in weights table (not in TR39 map).
      similarity = round3(1 - w.cost);
    }

    if (similarity === undefined) {
      // Not a confusable — the chain is broken.
      return { spoof: false };
    }

    substitutions.push({ index: i, from: tch, to: lch, similarity });
  }

  // Must have at least one substitution (identical strings already exited).
  if (substitutions.length === 0) return { spoof: false };

  // Compute average danger.
  const dangerSum = substitutions.reduce((sum, s) => sum + s.similarity, 0);
  const danger = round3(dangerSum / substitutions.length);

  return {
    spoof: danger >= minDanger,
    script: labelScript,
    danger,
    substitutions,
  };
}

function countConfusableChars(value: string, map: Record<string, string>): {
  confusableCount: number;
  divergenceCount: number;
} {
  let confusableCount = 0;
  let divergenceCount = 0;

  for (const ch of value) {
    if (ch.codePointAt(0)! < 0x80) continue; // 1, 0, m in a name are not lookalike characters on their own
    const mapped = map[ch];
    if (!mapped) continue;
    confusableCount++;
    if (isNfkcDivergentMapping(ch, mapped)) divergenceCount++;
  }

  return { confusableCount, divergenceCount };
}

/** `lookalike`: the path is lookalikes only, so its chain depth counts lookalikes. Otherwise it counts plain edits too,
 *  which make a name look less like the target, not more, so they add nothing. */
function scoreDistanceRisk(result: ConfusableDistanceResult, lookalike: boolean): number {
  let score = Math.round(result.similarity * 100);

  if (result.skeletonEqual) score = Math.max(score, 82);
  if (result.normalizedEqual) score = Math.max(score, 88);
  if (result.crossScriptCount > 0) {
    score += Math.min(12, result.crossScriptCount * 4);
  }
  if (result.ignorableCount > 0) {
    score += Math.min(12, result.ignorableCount * 4);
  }
  if (result.divergenceCount > 0) {
    score += Math.min(8, result.divergenceCount * 4);
  }
  if (lookalike && result.chainDepth >= 2) {
    score += Math.min(10, (result.chainDepth - 1) * 3);
  }

  return clamp(score, 0, 100);
}

/** A step that swaps a character for one that looks the same (Unicode's confusables, confusable-vision's measurements,
 *  NFKC or measured weights, including rn for m), or adds or drops an invisible character. */
function isLookalikeStep(step: ConfusableDistanceStep): boolean {
  return (
    step.op === "confusable-substitution" ||
    step.reason === "default-ignorable" ||
    step.reason === "nfkc-equivalent" ||
    step.reason === "visual-weight"
  );
}

/** Letters changed, added or dropped that are not lookalikes. Two neighbours swapped count as one. */
function countPlainEdits(steps: ConfusableDistanceStep[]): number {
  let count = 0;
  for (let k = 0; k < steps.length; k++) {
    const step = steps[k];
    if (step.op === "match" || isLookalikeStep(step)) continue;
    count++;
    const next = steps[k + 1];
    if (
      step.op === "substitution" &&
      next?.op === "substitution" &&
      !isLookalikeStep(next) &&
      step.from!.toLowerCase() === next.to!.toLowerCase() &&
      step.to!.toLowerCase() === next.from!.toLowerCase()
    ) {
      k++;
    }
  }
  return count;
}

/** `whole` starts or ends with `part`, and is longer. */
function hasAffix(whole: string, part: string): boolean {
  return whole.length > part.length && (whole.startsWith(part) || whole.endsWith(part));
}

/** Leetspeak swaps for the `leetspeak` risk option: the profanity matcher's aggressive table (4 for a, 1 for i or l,
 *  5 or $ for s, 8 for b, 9 or 6 for g, and so on), as weights, so each swap costs what a listed lookalike does. */
const LEETSPEAK_WEIGHTS: ConfusableWeights = (() => {
  const weights: ConfusableWeights = {};
  for (const [ch, letters] of Object.entries(PROFANITY_SUBSTITUTE_MAP_AGGRESSIVE)) {
    weights[ch] = Object.fromEntries(
      letters.map((letter) => [letter, { danger: 0.65, stableDanger: 0.65, cost: 0.35 }])
    );
  }
  return weights;
})();

/** Each leetspeak character read as the first letter it stands for (4 as a, 1 as i). */
function readLeetspeak(value: string): string {
  let out = "";
  for (const ch of value) out += PROFANITY_SUBSTITUTE_MAP_AGGRESSIVE[ch]?.[0] ?? ch;
  return out;
}

/**
 * What a name shows of a protected target it is not, for `checkRisk()`:
 * - `lookalike`: the skeletons collide (as compared, or with case kept), or every difference is a lookalike (with
 *   `leetspeak`, a leetspeak swap too) or an invisible character. Can block.
 * - `lookalike-extension`: a lookalike of the whole target with letters added (rnicrosoft-support). Warns at most.
 * - `typo`: one letter changed, added, dropped or swapped that is not a lookalike (githuh), against a name in
 *   `protect`. Warns at most. A reserved name that is not in `protect` is matched by lookalikes only.
 * - `none`: anything else. That includes the target itself with letters added or dropped at either end (admins,
 *   helper, setting): the protected word is there to read as it is, so it is not mistaken for another.
 *
 * `typedSkeletons` are the name's skeletons without and with case, and with `leetspeak`, a third with leetspeak read
 * as letters; the third is used only to find a lookalike with letters added.
 */
function targetEvidence(
  normalized: string,
  target: string,
  distance: ConfusableDistanceResult,
  typedSkeletons: string[],
  map: Record<string, string>,
  inProtect: boolean
): { kind: Exclude<RiskMatchEvidence, "exact"> | "none"; casedCollision?: boolean } {
  if (distance.skeletonEqual) return { kind: "lookalike" };
  const targetSkeleton = skeleton(target, { map });
  const targetCased = skeleton(target, { map, preserveCase: true });
  if (typedSkeletons[1] === targetCased) return { kind: "lookalike", casedCollision: true };
  const plainEdits = countPlainEdits(distance.steps);
  if (plainEdits === 0) return { kind: "lookalike" };
  if (hasAffix(normalized, target) || hasAffix(target, normalized)) return { kind: "none" };
  if (typedSkeletons.some((s, k) => hasAffix(s, k === 1 ? targetCased : targetSkeleton))) {
    return { kind: "lookalike-extension" };
  }
  return { kind: inProtect && plainEdits === 1 ? "typo" : "none" };
}

function levelForScore(score: number, warnThreshold: number, blockThreshold: number): RiskLevel {
  if (score >= blockThreshold) return "high";
  if (score >= warnThreshold) return "medium";
  return "low";
}

function actionForScore(score: number, warnThreshold: number, blockThreshold: number): RiskAction {
  if (score >= blockThreshold) return "block";
  if (score >= warnThreshold) return "warn";
  return "allow";
}

function uniqueNonEmptyStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/**
 * Build the reserved name map from config
 */
function buildReservedMap(
  reserved: NamespaceConfig["reserved"],
  canonical: (name: string) => string = (name) => name
): Map<string, string> {
  const map = new Map<string, string>();

  if (!reserved) return map;

  // Names are compared in their canonical form, so "Admin" in the list also reserves "admin"
  if (reserved instanceof Set) {
    for (const name of reserved) map.set(canonical(name), "default");
  } else if (Array.isArray(reserved)) {
    for (const name of reserved) map.set(canonical(name), "default");
  } else {
    for (const [category, names] of Object.entries(reserved)) {
      for (const name of names) map.set(canonical(name), category);
    }
  }

  return map;
}

/**
 * Create a guard with a built-in profile preset for practical defaults.
 *
 * Profile values apply first; explicit `config` values override the preset.
 */
export function createNamespaceGuardWithProfile(
  profileName: NamespaceProfileName,
  config: NamespaceConfig,
  adapter: NamespaceAdapter
) {
  const profile = NAMESPACE_PROFILES[profileName];
  if (!profile) {
    throw new Error(`Unknown namespace profile: ${profileName}`);
  }

  // The profile's own message goes with its pattern: org-slug allows 40 characters, so "Use 2-30" would be wrong
  const invalidMessage = config.pattern || config.messages?.invalid ? undefined : profile.invalidMessage;
  const mergedConfig: NamespaceConfig = {
    ...config,
    ...(invalidMessage ? { messages: { ...config.messages, invalid: invalidMessage } } : {}),
    pattern: config.pattern ?? profile.pattern,
    normalizeUnicode: config.normalizeUnicode ?? profile.normalizeUnicode,
    allowPurelyNumeric: config.allowPurelyNumeric ?? profile.allowPurelyNumeric,
    risk: {
      ...profile.risk,
      ...(config.risk ?? {}),
    },
  };

  return createNamespaceGuard(mergedConfig, adapter);
}

/**
 * Create a namespace guard instance for checking slug/handle uniqueness
 * across multiple database tables with reserved name protection.
 *
 * @param config - Reserved names, data sources, validation pattern, and optional features
 * @param adapter - Database adapter implementing the `findOne` lookup (use a built-in adapter or write your own)
 * @returns A guard with `check`, `checkMany`, `checkRisk`, `enforceRisk`, `assertAvailable`, `assertClaimable`, `claim`, `validateFormat`, `validateFormatOnly`, `clearCache`, and `cacheStats` methods
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
  const reservedMap = buildReservedMap(config.reserved, (name) =>
    normalize(name, { unicode: config.normalizeUnicode ?? true })
  );

  const pattern = config.pattern ?? DEFAULT_PATTERN;
  const configMessages = config.messages ?? {};
  const defaultReservedMsg = DEFAULT_MESSAGES.reserved;
  const invalidMsg = configMessages.invalid ?? DEFAULT_MESSAGES.invalid;
  const takenMsg = configMessages.taken ?? DEFAULT_MESSAGES.taken;

  const validators = config.validators ?? [];
  const normalizeOpts = { unicode: config.normalizeUnicode ?? true };
  const allowPurelyNumeric = config.allowPurelyNumeric ?? true;
  const purelyNumericMsg =
    configMessages.purelyNumeric ?? "Identifiers cannot be purely numeric.";

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
    const entry = { promise, expires: now + cacheTtl };
    cacheMap.set(key, entry);
    // A lookup that fails isn't kept: the next call asks the database again rather than repeating the error
    promise.catch(() => {
      if (cacheMap.get(key) === entry) cacheMap.delete(key);
    });
    return promise;
  }

  function getReservedMessage(category: string): string {
    const rm = configMessages.reserved;
    if (typeof rm === "string") return rm;
    if (rm && typeof rm === "object") return rm[category] ?? defaultReservedMsg;
    return defaultReservedMsg;
  }

  /**
   * Validate an identifier's format, purely-numeric restriction, and reserved name status
   * without querying the database.
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

  /**
   * Validate only the identifier's format and purely-numeric restriction,
   * without checking reserved names or querying the database.
   *
   * @param identifier - The raw identifier to validate
   * @returns An error message string if the format is invalid, or `null` if the format is OK
   */
  function validateFormatOnly(identifier: string): string | null {
    const normalized = normalize(identifier, normalizeOpts);

    if (!pattern.test(normalized)) {
      return invalidMsg;
    }

    if (!allowPurelyNumeric && /^\d+(-\d+)*$/.test(normalized)) {
      return purelyNumericMsg;
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
        const rejection = await validator(normalized, { identifier });
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

        // Phase 1: Cheap sync filter - format + reserved + purely-numeric
        const passedSync = candidates.filter(
          (c) =>
            pattern.test(c) &&
            !reservedMap.has(c) &&
            (allowPurelyNumeric || !/^\d+(-\d+)*$/.test(c))
        );

        // Phase 2+3: Progressive batches - validate + DB-check in batches of `max`
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
                    const rejection = await validator(c, { identifier: c });
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
    // It throws rather than returning suggestions, so there's no point looking them up
    const result = await check(identifier, scope, { skipSuggestions: true });
    if (!result.available) {
      throw new Error(result.message);
    }
  }

  /**
   * Check multiple identifiers in parallel.
   * By default, suggestions are skipped for performance. Pass `{ skipSuggestions: false }` to include them.
   *
   * @param identifiers - Array of raw identifiers to check
   * @param scope - Ownership scope applied to all checks
   * @param options - Optional settings (e.g., `{ skipSuggestions: false }` to include suggestions)
   * @returns A record mapping each identifier to its `CheckResult`
   */
  async function checkMany(
    identifiers: string[],
    scope: OwnershipScope = {},
    options?: CheckManyOptions
  ): Promise<Record<string, CheckResult>> {
    const skip = options?.skipSuggestions ?? true;
    const entries = await Promise.all(
      identifiers.map(async (id) => {
        const result = await check(id, scope, { skipSuggestions: skip });
        return [id, result] as const;
      })
    );
    return Object.fromEntries(entries);
  }

  /**
   * Score spoofing/confusability risk for an identifier against protected targets.
   *
   * Uses weighted confusable distance with chain-depth and script/invisible-character
   * signals. Reserved names can be included as protected targets by default.
   *
   * Only something visual can reach the block threshold: a skeleton collision, or a name that differs from a target
   * only by lookalikes (rnicrosoft, paypa1, paypaI) and invisible characters, or lookalike, invisible or mixed-script
   * characters in the name. One letter changed, added, dropped or swapped that is not a lookalike (githuh, against a
   * name in `protect`), or a lookalike of the whole target with letters added (rnicrosoft-support), scores at most one
   * below the block threshold. A target with letters added or dropped at either end (admins, helper, setting) and
   * names further away are not matched, and a reserved name not in `protect` is matched by lookalikes only.
   */
  function checkRisk(identifier: string, options?: CheckRiskOptions): RiskCheckResult {
    const normalized = normalize(identifier, normalizeOpts);
    // The identifier as typed, for looking characters up: lowercasing can turn a lookalike capital into a letter that
    // is not one (Cherokee Ꭱ into ꭱ), or hide one (capital I, shown as typed, reads as l)
    const trimmed = identifier.trim();
    const raw = trimmed.replace(/^@+/, "");
    const map = options?.map ?? CONFUSABLE_MAP_FULL;
    // As stored (NFKC), with listed characters that NFKC splits put back: ŀ, stored as l and a middle dot, is still ŀ
    const typed = (normalizeOpts?.unicode ?? true)
      ? rejoinSplitListed(trimmed.normalize("NFKC").replace(/^@+/, ""), map, true)
      : raw;
    const includeReserved =
      options?.includeReserved ?? config.risk?.includeReserved ?? true;
    const leetspeak = options?.leetspeak ?? config.risk?.leetspeak ?? false;
    const maxMatches = Math.max(
      1,
      options?.maxMatches ?? config.risk?.maxMatches ?? 3
    );

    const warnThreshold = clamp(
      Math.round(options?.warnThreshold ?? config.risk?.warnThreshold ?? 45),
      0,
      100
    );
    const requestedBlock = clamp(
      Math.round(options?.blockThreshold ?? config.risk?.blockThreshold ?? 70),
      0,
      100
    );
    const blockThreshold =
      requestedBlock <= warnThreshold ? Math.min(100, warnThreshold + 1) : requestedBlock;

    const reasons: RiskReason[] = [];
    let heuristicScore = 0;

    function addReason(code: RiskReasonCode, message: string, weight: number): void {
      const safeWeight = clamp(Math.round(weight), 0, 100);
      reasons.push({ code, message, weight: safeWeight });
      heuristicScore += safeWeight;
    }

    // Signals from characters that are in the name as stored, and look like something else or cannot be seen
    let visualSignal = false;
    if (hasMixedScripts(normalized)) {
      addReason("mixed-script", "Identifier mixes Latin and non-Latin scripts.", 24);
      visualSignal = true;
    }

    const ignorableCount = countDefaultIgnorables(normalized);
    if (ignorableCount > 0) {
      addReason(
        "invisible-character",
        `Identifier contains ${ignorableCount} default-ignorable Unicode character(s).`,
        Math.min(22, 10 + ignorableCount * 4)
      );
      visualSignal = true;
    }

    const charStats = countConfusableChars(typed, map);
    if (charStats.confusableCount > 0) {
      addReason(
        "confusable-character",
        `Identifier contains ${charStats.confusableCount} confusable character(s).`,
        Math.min(24, 8 + charStats.confusableCount * 3)
      );
      visualSignal = true;
    }

    // On the input as typed: NFKC rewrites these characters (ſ as s), so the name as stored no longer has them. Not a
    // visual signal, so it cannot take a name without one to the block threshold.
    const divergenceCount = countConfusableChars(raw, map).divergenceCount;
    if (divergenceCount > 0) {
      addReason(
        "divergent-mapping",
        `Identifier includes ${divergenceCount} mapping(s) where NFKC and TR39 differ.`,
        Math.min(16, 6 + divergenceCount * 3)
      );
    }

    const configuredProtect = config.risk?.protect ?? [];
    const explicitProtect = options?.protect;
    const protectInputs = explicitProtect ?? configuredProtect;
    const normalizedProtect = uniqueNonEmptyStrings(
      protectInputs.map((target) => normalize(target, normalizeOpts))
    );
    const inProtect = new Set(normalizedProtect);

    const protectedTargets = new Set<string>();
    if (includeReserved) {
      for (const reservedName of reservedMap.keys()) {
        const normalizedReserved = normalize(reservedName, normalizeOpts);
        if (normalizedReserved) protectedTargets.add(normalizedReserved);
      }
    }
    for (const target of normalizedProtect) {
      protectedTargets.add(target);
    }

    const scoredMatches: Array<{ match: RiskMatch; detail?: ConfusableDistanceResult; collision: boolean }> = [];
    const typedSkeletons = [
      skeleton(typed, { map }),
      skeleton(typed, { map, preserveCase: true }),
      ...(leetspeak ? [skeleton(readLeetspeak(typed), { map })] : []),
    ];
    const weights = leetspeak ? LEETSPEAK_WEIGHTS : undefined;
    // Without a lookalike, spelling alone can bring a name up to the block threshold but not to it
    const spellingCap = blockThreshold - 1;

    for (const target of protectedTargets) {
      if (target === normalized) {
        scoredMatches.push({
          match: {
            target,
            score: 100,
            distance: 0,
            chainDepth: 0,
            skeletonEqual: true,
            evidence: "exact",
            reasons: ["Exact protected target match"],
          },
          collision: true,
        });
        continue;
      }

      const distance = confusableDistance(typed, target, { map, weights });
      const { kind: evidence, casedCollision } = targetEvidence(
        normalized,
        target,
        distance,
        typedSkeletons,
        map,
        inProtect.has(target)
      );
      if (evidence === "none") continue;
      const lookalike = evidence === "lookalike";
      const rawScore =
        evidence === "lookalike-extension" ? 100 : scoreDistanceRisk(distance, lookalike);
      if (rawScore < 35) continue;
      const score = lookalike ? rawScore : Math.min(rawScore, spellingCap);

      const matchReasons: string[] = [];
      if (distance.skeletonEqual) matchReasons.push("TR39 skeleton collision");
      if (casedCollision) matchReasons.push("TR39 skeleton collision with case kept");
      if (evidence === "lookalike-extension") {
        matchReasons.push("lookalike of the whole name, with letters added");
      } else if (evidence === "typo") {
        matchReasons.push("one letter changed, added, dropped or swapped, not a lookalike");
      }
      const leetSwaps = leetspeak ? distance.steps.filter((s) => s.reason === "visual-weight").length : 0;
      if (leetSwaps > 0) matchReasons.push(`${leetSwaps} leetspeak swap(s)`);
      if (distance.crossScriptCount > 0) {
        matchReasons.push(`${distance.crossScriptCount} cross-script substitution(s)`);
      }
      if (distance.ignorableCount > 0) {
        matchReasons.push(`${distance.ignorableCount} default-ignorable edit(s)`);
      }
      if (distance.divergenceCount > 0) {
        matchReasons.push(`${distance.divergenceCount} NFKC/TR39 divergent mapping(s)`);
      }
      if (lookalike && distance.chainDepth >= 2) {
        matchReasons.push(`chain depth ${distance.chainDepth}`);
      }

      scoredMatches.push({
        match: {
          target,
          score,
          distance: distance.distance,
          chainDepth: distance.chainDepth,
          skeletonEqual: distance.skeletonEqual,
          evidence,
          reasons: matchReasons,
        },
        detail: distance,
        collision: distance.skeletonEqual || Boolean(casedCollision),
      });
    }

    // Matches that can block first, so which one leads does not depend on the block threshold
    const visual = (m: RiskMatch) => m.evidence === "exact" || m.evidence === "lookalike";
    scoredMatches.sort((a, b) => {
      if (visual(a.match) !== visual(b.match)) return visual(a.match) ? -1 : 1;
      if (b.match.score !== a.match.score) return b.match.score - a.match.score;
      if (a.match.distance !== b.match.distance) return a.match.distance - b.match.distance;
      return a.match.target.localeCompare(b.match.target);
    });

    const selectedMatches = scoredMatches.slice(0, maxMatches);
    const matches = selectedMatches.map((m) => m.match);

    let score = clamp(heuristicScore, 0, 100);
    const top = selectedMatches[0];
    const topVisual = top !== undefined && visual(top.match);
    if (top) {
      score = Math.max(score, top.match.score);
      addReason(
        "confusable-target",
        topVisual
          ? `Identifier is visually close to protected target "${top.match.target}".`
          : top.match.evidence === "typo"
            ? `Identifier is spelled close to protected target "${top.match.target}", with no lookalike.`
            : `Identifier contains a lookalike of protected target "${top.match.target}", with letters added.`,
        top.match.score
      );

      if (top.collision && top.detail) {
        addReason(
          "skeleton-collision",
          `Identifier skeleton collides with "${top.match.target}".`,
          20
        );
      }
      if (topVisual && (top.detail?.chainDepth ?? 0) >= 2) {
        addReason(
          "deep-chain",
          `Confusable transformation chain depth is ${top.detail!.chainDepth}.`,
          Math.min(16, 6 + top.detail!.chainDepth * 2)
        );
      }
      if ((top.detail?.divergenceCount ?? 0) > 0) {
        addReason(
          "divergent-mapping",
          `Closest target path includes ${top.detail!.divergenceCount} NFKC/TR39 divergent mapping(s).`,
          Math.min(14, 5 + top.detail!.divergenceCount * 2)
        );
      }
    }

    score = Math.max(score, clamp(heuristicScore, 0, 100));
    score = clamp(score, 0, 100);
    // Nothing visual (a close spelling, or a character NFKC rewrites, such as ſ): at most a warning
    const canBlock = topVisual || visualSignal;
    if (!canBlock) score = Math.min(score, spellingCap);
    reasons.sort((a, b) => b.weight - a.weight);

    return {
      identifier,
      normalized,
      score,
      level: levelForScore(score, warnThreshold, blockThreshold),
      action: actionForScore(score, warnThreshold, blockThreshold),
      canBlock,
      reasons,
      matches,
    };
  }

  /**
   * Enforce risk policy on an identifier and return an allow/deny decision.
   *
   * This wraps `checkRisk()` and applies a deny mode:
   * - `failOn: "block"`: deny only block-level risk
   * - `failOn: "warn"`: deny warn + block risk
   */
  function enforceRisk(
    identifier: string,
    options?: EnforceRiskOptions
  ): EnforceRiskResult {
    const {
      failOn,
      messages,
      protect,
      includeReserved,
      leetspeak,
      map,
      maxMatches,
      warnThreshold,
      blockThreshold,
    } = options ?? {};
    const configuredProtect = config.risk?.protect ?? [];
    const fallbackProtect =
      configuredProtect.length > 0 ? configuredProtect : DEFAULT_PROTECTED_TOKENS;
    const effectiveProtect = protect ?? fallbackProtect;
    const risk = checkRisk(identifier, {
      protect: effectiveProtect,
      includeReserved,
      leetspeak,
      map,
      maxMatches,
      warnThreshold,
      blockThreshold,
    });
    const failMode = failOn ?? "block";
    const deny =
      failMode === "warn" ? risk.action !== "allow" : risk.action === "block";

    if (!deny) {
      return {
        allowed: true,
        action: risk.action,
        risk,
      };
    }

    const topTarget = risk.matches[0]?.target;
    const suffix = topTarget ? ` Closest protected target: "${topTarget}".` : "";
    const defaultWarnMessage =
      "Identifier is potentially confusable with a protected name." + suffix;
    const defaultBlockMessage =
      "Identifier is too confusable with a protected name." + suffix;

    return {
      allowed: false,
      action: risk.action,
      message:
        risk.action === "block"
          ? messages?.block ?? defaultBlockMessage
          : messages?.warn ?? defaultWarnMessage,
      risk,
    };
  }

  /**
   * One-liner claimability guard.
   *
   * Runs availability checks (`check`) plus risk enforcement (`enforceRisk`).
   * Throws an `Error` if the identifier cannot be claimed.
   */
  async function assertClaimable(
    identifier: string,
    scope: OwnershipScope = {},
    options?: AssertClaimableOptions
  ): Promise<void> {
    const availability = await check(identifier, scope, { skipSuggestions: true });
    if (!availability.available) {
      throw new Error(availability.message);
    }

    const decision = enforceRisk(identifier, options);
    if (!decision.allowed) {
      throw new Error(
        decision.message ??
          "Identifier is too close to a protected or existing namespace."
      );
    }
  }

  /**
   * Check a name and write it in one step.
   *
   * Runs claimability checks, then executes your write callback with the
   * normalized identifier. If the write fails on a unique constraint, returns
   * an unavailable result instead of throwing. This closes the race only when
   * one unique index covers every table that shares the namespace: with
   * users and organisations in separate tables, have the write also insert
   * into a shared names table in the same transaction.
   */
  async function claim<T>(
    identifier: string,
    write: (normalized: string) => Promise<T>,
    options?: ClaimOptions
  ): Promise<ClaimResult<T>> {
    const normalized = normalize(identifier, normalizeOpts);
    const scope = options?.scope ?? {};

    const availability = await check(identifier, scope, { skipSuggestions: true });
    if (!availability.available) {
      return {
        claimed: false,
        normalized,
        reason: "unavailable",
        message: availability.message,
      };
    }

    const decision = enforceRisk(identifier, options);
    if (!decision.allowed) {
      return {
        claimed: false,
        normalized,
        reason: "unavailable",
        message:
          decision.message ??
          "Identifier is too close to a protected or existing namespace.",
      };
    }

    try {
      const value = await write(normalized);
      return { claimed: true, normalized, value };
    } catch (error) {
      const detector = options?.isUniqueViolation ?? isLikelyUniqueViolationError;
      if (!detector(error)) {
        throw error;
      }
      return {
        claimed: false,
        normalized,
        reason: "unavailable",
        message: options?.takenMessage ?? "That name is already in use.",
      };
    }
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
    validateFormatOnly,
    check,
    assertAvailable,
    assertClaimable,
    claim,
    checkMany,
    checkRisk,
    enforceRisk,
    clearCache,
    cacheStats,
  };
}

/** The guard instance returned by `createNamespaceGuard`. */
export type NamespaceGuard = ReturnType<typeof createNamespaceGuard>;
