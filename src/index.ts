import {
  LLM_CONFUSABLE_MAP,
  LLM_CONFUSABLE_MAP_CHAR_COUNT,
  LLM_CONFUSABLE_MAP_PAIR_COUNT,
  LLM_CONFUSABLE_MAP_SOURCE_COUNTS,
  type LlmConfusableMapEntry,
} from "./llm-confusable-map";

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

/** Async validator hook type used by `NamespaceConfig.validators`. */
export type NamespaceValidator = (value: string) => Promise<NamespaceValidatorResult>;

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
    /** Include reserved names as protected targets by default (default: true) */
    includeReserved?: boolean;
    /** Default protected targets when none are passed to `checkRisk`/`enforceRisk` (default: none). */
    protect?: string[];
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
  /** Check if identifier contains a blocked word as a substring (default: `true`). */
  checkSubstrings?: boolean;
  /** `basic`: lowercase matching only. `evasion`: Unicode+substitute folding (default: `evasion`). */
  mode?: ProfanityValidationMode;
  /** Variant strictness for evasion mode (default: `balanced`). */
  variantProfile?: ProfanityVariantProfile;
  /** Minimum blocked-word length for substring checks (default: `4`). Exact matches are always checked. */
  minSubstringLength?: number;
  /** Confusable map used for evasion folding (default: `CONFUSABLE_MAP_FULL`). */
  map?: Record<string, string>;
  /** Max folded candidates generated per value in evasion mode (default: `64`). */
  maxFoldVariants?: number;
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

/** Options for `canonicalise()` LLM preprocessing. */
export type CanonicaliseOptions = {
  /** Minimum SSIM score required for replacement (default: `0.7`). */
  threshold?: number;
  /** Include confusable-vision novel discoveries in addition to TR39 mappings (default: `true`). */
  includeNovel?: boolean;
  /** Restrict replacement to specific source scripts (case-insensitive, e.g. `["Cyrillic", "Greek"]`). */
  scripts?: string[];
  /**
   * Canonicalisation strategy (default: `"mixed"`).
   *
   * - `"mixed"` -- only replace confusable characters inside tokens that already
   *   contain Latin letters. Standalone non-Latin words (e.g. "Москва") are
   *   preserved.  Safe for multilingual text.
   *
   * - `"all"` -- replace every confusable character regardless of surrounding
   *   context.  Use this when the document is known to be Latin-script (e.g.
   *   an English contract) and you want to catch attackers who substitute
   *   every character in a word.
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
  /** SSIM score used for this mapping. */
  ssimScore: number;
  /** Mapping source (`tr39` baseline or `novel` discovery). */
  source: "tr39" | "novel";
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

/** Options for the `skeleton()` and `areConfusable()` functions. */
export type SkeletonOptions = {
  /** Confusable character map to use.
   *  Default: `CONFUSABLE_MAP_FULL` (complete TR39 map, no NFKC filtering).
   *  Pass `CONFUSABLE_MAP` if your pipeline runs NFKC before calling skeleton(). */
  map?: Record<string, string>;
};

/** Measured visual weight for a single confusable pair. */
export type ConfusableWeight = {
  /** Maximum SSIM across all font comparisons (attacker perspective). */
  danger: number;
  /** 95th percentile SSIM across all font comparisons (defender perspective). */
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
   *  - `'identifier'`: only apply weights for XID_Continue sources
   *  - `'domain'`: only apply weights for IDNA PVALID sources
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

/** A nearest protected target returned by risk scoring. */
export type RiskMatch = {
  target: string;
  score: number;
  distance: number;
  chainDepth: number;
  skeletonEqual: boolean;
  reasons: string[];
};

/** Options for `guard.checkRisk()`. */
export type CheckRiskOptions = {
  /** Additional high-value identifiers to protect against confusable variants. */
  protect?: string[];
  /** Include configured reserved names in the protected target set (default: true). */
  includeReserved?: boolean;
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
      code === "SQLITE_CONSTRAINT" ||
      code === "SQLITE_CONSTRAINT_UNIQUE" ||
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
      message.includes("e11000") ||
      message.includes("constraint failed")
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
    normalizeUnicode: true,
    allowPurelyNumeric: false,
    risk: {
      includeReserved: true,
      protect: [],
      maxMatches: 3,
      warnThreshold: 45,
      blockThreshold: 70,
    },
  },
  "org-slug": {
    description: "Organization/workspace slugs with conservative collision policy.",
    pattern: /^[a-z0-9][a-z0-9-]{1,39}$/,
    normalizeUnicode: true,
    allowPurelyNumeric: false,
    risk: {
      includeReserved: true,
      protect: [],
      maxMatches: 5,
      warnThreshold: 40,
      blockThreshold: 65,
    },
  },
  "developer-id": {
    description: "Developer/package style identifiers with stricter warn thresholds.",
    pattern: /^[a-z0-9][a-z0-9-]{1,49}$/,
    normalizeUnicode: true,
    allowPurelyNumeric: true,
    risk: {
      includeReserved: true,
      protect: [],
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
const NON_ASCII_ALNUM_RE = /[^a-z0-9]+/g;

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

function buildProfanityFoldCandidates(
  value: string,
  map: Record<string, string>,
  substituteMap: Record<string, string[]>,
  maxVariants: number
): string[] {
  const skeletonized = skeleton(value.normalize("NFKC"), { map });
  let candidates = [""];

  for (const ch of skeletonized) {
    const options = new Set<string>();
    if (ASCII_ALNUM_RE.test(ch)) {
      options.add(ch);
    } else {
      // Separators/punctuation can be used to evade simple substring checks.
      options.add("");
    }

    const substitutes = substituteMap[ch] ?? [];
    for (const substitute of substitutes) {
      options.add(substitute);
    }

    if (options.size === 0) {
      options.add("");
    }

    const next: string[] = [];
    const seen = new Set<string>();
    for (const prefix of candidates) {
      for (const option of options) {
        const candidate = prefix + option;
        if (seen.has(candidate)) continue;
        seen.add(candidate);
        next.push(candidate);
        if (next.length >= maxVariants) break;
      }
      if (next.length >= maxVariants) break;
    }
    candidates = next.length > 0 ? next : candidates;
  }

  return Array.from(
    new Set(
      candidates
        .map((candidate) => candidate.replace(NON_ASCII_ALNUM_RE, ""))
        .filter(Boolean)
    )
  );
}

/**
 * Create a validator that rejects identifiers containing profanity or offensive words.
 *
 * Supply your own word list - no words are bundled with the library.
 * The returned function is compatible with `config.validators`.
 *
 * @param words - Array of words to block
 * @param options - Optional settings
 * @param options.message - Custom rejection message (default: "That name is not allowed.")
 * @param options.checkSubstrings - Check if identifier contains a blocked word as a substring (default: true)
 * @param options.mode - `basic` (lowercase only) or `evasion` (Unicode/substitute folding) (default: `evasion`)
 * @param options.variantProfile - `balanced` (precision-first) or `aggressive` (broader substitutes) (default: `balanced`)
 * @param options.minSubstringLength - Minimum blocked-word length used in substring checks (default: `4`)
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
  const foldMap = options?.map ?? CONFUSABLE_MAP_FULL;
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

  // Pre-compile regex for O(len) substring matching instead of O(words × len)
  const substringWords = checkSubstrings
    ? Array.from(wordSet).filter((w) => w.length >= minSubstringLength)
    : [];
  const substringRegex =
    substringWords.length > 0
      ? new RegExp(substringWords.map((w) => escapeRegex(w)).join("|"))
      : null;

  const foldedExactWordSet =
    mode === "evasion"
      ? new Set(
          rawWords.flatMap((word) =>
            buildProfanityFoldCandidates(
              word,
              foldMap,
              substituteMap,
              Math.min(16, maxFoldVariants)
            )
          )
        )
      : null;
  const foldedSubstringWordSet =
    mode === "evasion" &&
    checkSubstrings
      ? new Set(
          rawWords
            .filter((word) => word.length >= minSubstringLength)
            .flatMap((word) =>
              buildProfanityFoldCandidates(
                word,
                foldMap,
                substituteMap,
                Math.min(16, maxFoldVariants)
              )
            )
        )
      : null;
  const foldedSubstringRegex =
    mode === "evasion" &&
    checkSubstrings &&
    foldedSubstringWordSet &&
    foldedSubstringWordSet.size > 0
      ? new RegExp(
          Array.from(foldedSubstringWordSet)
            .map((w) => escapeRegex(w))
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

    if (mode === "evasion" && foldedExactWordSet && foldedExactWordSet.size > 0) {
      const foldedCandidates = buildProfanityFoldCandidates(
        normalized,
        foldMap,
        substituteMap,
        maxFoldVariants
      );

      if (foldedCandidates.some((candidate) => foldedExactWordSet.has(candidate))) {
        return { available: false, message };
      }

      if (
        foldedSubstringRegex &&
        foldedCandidates.some((candidate) => foldedSubstringRegex.test(candidate))
      ) {
        return { available: false, message };
      }
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
 *
 * Data source: Unicode confusables.txt (https://unicode.org/Public/security/latest/confusables.txt)
 * Copyright 1991-Present Unicode, Inc. Licensed under the Unicode License v3.
 * See https://www.unicode.org/terms_of_use.html
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
 * Complete TR39 confusable mapping: every single-character mapping to a
 * lowercase Latin letter or digit from confusables.txt, with no NFKC filtering.
 *
 * Use this when your pipeline does NOT run NFKC normalization before confusable
 * detection (which is most real-world systems: TR39 skeleton uses NFD, Chromium
 * uses NFD, Rust uses NFC, django-registration uses no normalization at all).
 *
 * Includes ~1,400 entries vs CONFUSABLE_MAP's ~613 NFKC-deduped entries.
 * The additional entries cover characters that NFKC normalization would handle
 * (mathematical alphanumerics, fullwidth forms, etc.) plus the 31 entries where
 * TR39 and NFKC disagree on the target letter.
 *
 * Regenerate: `npx tsx scripts/generate-confusables.ts`
 *
 * Data source: Unicode confusables.txt (https://unicode.org/Public/security/latest/confusables.txt)
 * Copyright 1991-Present Unicode, Inc. Licensed under the Unicode License v3.
 * See https://www.unicode.org/terms_of_use.html
 */
/* prettier-ignore */
export const CONFUSABLE_MAP_FULL: Record<string, string> = {
  // Latin-1 Supplement (2)
  "\u00d7": "x", "\u00fe": "p",
  // Latin Extended-A (2)
  "\u0131": "i", "\u017f": "f",
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
  // Other (U+05C0) (1)
  "\u05c0": "l",
  // Other (U+05D5) (1)
  "\u05d5": "l",
  // Other (U+05D8) (1)
  "\u05d8": "v",
  // Other (U+05DF) (1)
  "\u05df": "l",
  // Other (U+05E1) (1)
  "\u05e1": "o",
  // Other (U+0627) (1)
  "\u0627": "l",
  // Other (U+0647) (1)
  "\u0647": "o",
  // Other (U+0661) (1)
  "\u0661": "l",
  // Other (U+0665) (1)
  "\u0665": "o",
  // Other (U+0667) (1)
  "\u0667": "v",
  // Other (U+06BE) (1)
  "\u06be": "o",
  // Other (U+06C1) (1)
  "\u06c1": "o",
  // Other (U+06D5) (1)
  "\u06d5": "o",
  // Other (U+06F1) (1)
  "\u06f1": "l",
  // Other (U+06F5) (1)
  "\u06f5": "o",
  // Other (U+06F7) (1)
  "\u06f7": "v",
  // Other (U+07C0) (1)
  "\u07c0": "o",
  // Other (U+07CA) (1)
  "\u07ca": "l",
  // Other (U+0966) (1)
  "\u0966": "o",
  // Other (U+0969) (1)
  "\u0969": "3",
  // Other (U+09E6) (1)
  "\u09e6": "o",
  // Other (U+09EA) (1)
  "\u09ea": "8",
  // Other (U+09ED) (1)
  "\u09ed": "9",
  // Other (U+0A66) (1)
  "\u0a66": "o",
  // Other (U+0A67) (1)
  "\u0a67": "9",
  // Other (U+0A6A) (1)
  "\u0a6a": "8",
  // Other (U+0AE6) (1)
  "\u0ae6": "o",
  // Other (U+0AE9) (1)
  "\u0ae9": "3",
  // Other (U+0B03) (1)
  "\u0b03": "8",
  // Other (U+0B20) (1)
  "\u0b20": "o",
  // Other (U+0B66) (1)
  "\u0b66": "o",
  // Other (U+0B68) (1)
  "\u0b68": "9",
  // Other (U+0BE6) (1)
  "\u0be6": "o",
  // Other (U+0C02) (1)
  "\u0c02": "o",
  // Other (U+0C66) (1)
  "\u0c66": "o",
  // Other (U+0C82) (1)
  "\u0c82": "o",
  // Other (U+0CE6) (1)
  "\u0ce6": "o",
  // Other (U+0D02) (1)
  "\u0d02": "o",
  // Other (U+0D1F) (1)
  "\u0d1f": "s",
  // Other (U+0D20) (1)
  "\u0d20": "o",
  // Other (U+0D66) (1)
  "\u0d66": "o",
  // Other (U+0D6D) (1)
  "\u0d6d": "9",
  // Other (U+0D82) (1)
  "\u0d82": "o",
  // Other (U+0E50) (1)
  "\u0e50": "o",
  // Other (U+0ED0) (1)
  "\u0ed0": "o",
  // Other (U+1004) (1)
  "\u1004": "c",
  // Other (U+101D) (1)
  "\u101d": "o",
  // Other (U+1040) (1)
  "\u1040": "o",
  // Other (U+105A) (1)
  "\u105a": "c",
  // Georgian (2)
  "\u10e7": "y", "\u10ff": "o",
  // Other (U+1200) (1)
  "\u1200": "u",
  // Other (U+12D0) (1)
  "\u12d0": "o",
  // Cherokee (30)
  "\u13a0": "d", "\u13a1": "r", "\u13a2": "t", "\u13a5": "i",
  "\u13a9": "y", "\u13aa": "a", "\u13ab": "j", "\u13ac": "e",
  "\u13b3": "w", "\u13b7": "m", "\u13bb": "h", "\u13bd": "y",
  "\u13c0": "g", "\u13c2": "h", "\u13c3": "z", "\u13ce": "4",
  "\u13cf": "b", "\u13d2": "r", "\u13d4": "w", "\u13d5": "s",
  "\u13d9": "v", "\u13da": "s", "\u13de": "l", "\u13df": "c",
  "\u13e2": "p", "\u13e6": "k", "\u13e7": "d", "\u13ee": "6",
  "\u13f3": "g", "\u13f4": "b",
  // Unified Canadian Aboriginal Syllabics (21)
  "\u142f": "v", "\u144c": "u", "\u146d": "p", "\u146f": "d",
  "\u1472": "b", "\u148d": "j", "\u14aa": "l", "\u14bf": "2",
  "\u1541": "x", "\u157c": "h", "\u157d": "x", "\u1587": "r",
  "\u15af": "b", "\u15b4": "f", "\u15c5": "a", "\u15de": "d",
  "\u15ea": "d", "\u15f0": "m", "\u15f7": "b", "\u166d": "x",
  "\u166e": "x",
  // Other (U+16B7) (1)
  "\u16b7": "x",
  // Other (U+16C1) (1)
  "\u16c1": "l",
  // Other (U+16D5) (1)
  "\u16d5": "k",
  // Other (U+16D6) (1)
  "\u16d6": "m",
  // Other (U+17E0) (1)
  "\u17e0": "o",
  // Phonetic Extensions (16)
  "\u1d00": "a", "\u1d04": "c", "\u1d05": "d", "\u1d07": "e",
  "\u1d0a": "j", "\u1d0b": "k", "\u1d0d": "m", "\u1d0f": "o",
  "\u1d11": "o", "\u1d18": "p", "\u1d1b": "t", "\u1d1c": "u",
  "\u1d20": "v", "\u1d21": "w", "\u1d22": "z", "\u1d26": "r",
  // Other (U+1D83) (1)
  "\u1d83": "g",
  // Other (U+1D8C) (1)
  "\u1d8c": "y",
  // Latin Extended Additional (2)
  "\u1e9d": "f", "\u1eff": "y",
  // Other (U+1FBE) (1)
  "\u1fbe": "i",
  // Letterlike Symbols (34)
  "\u2102": "c", "\u210a": "g", "\u210b": "h", "\u210c": "h",
  "\u210d": "h", "\u210e": "h", "\u2110": "l", "\u2111": "l",
  "\u2112": "l", "\u2113": "l", "\u2115": "n", "\u2119": "p",
  "\u211a": "q", "\u211b": "r", "\u211c": "r", "\u211d": "r",
  "\u2124": "z", "\u2128": "z", "\u212a": "k", "\u212c": "b",
  "\u212d": "c", "\u212e": "e", "\u212f": "e", "\u2130": "e",
  "\u2131": "f", "\u2133": "m", "\u2134": "o", "\u2139": "i",
  "\u213d": "y", "\u2145": "d", "\u2146": "d", "\u2147": "e",
  "\u2148": "i", "\u2149": "j",
  // Number Forms (13)
  "\u2160": "l", "\u2164": "v", "\u2169": "x", "\u216c": "l",
  "\u216d": "c", "\u216e": "d", "\u216f": "m", "\u2170": "i",
  "\u2174": "v", "\u2179": "x", "\u217c": "l", "\u217d": "c",
  "\u217e": "d",
  // Mathematical Operators (7)
  "\u2223": "l", "\u2228": "v", "\u222a": "u", "\u22a4": "t",
  "\u22c1": "v", "\u22c3": "u", "\u22ff": "e",
  // Miscellaneous Technical (4)
  "\u2373": "i", "\u2374": "p", "\u237a": "a", "\u23fd": "l",
  // Box Drawing (1)
  "\u2573": "x",
  // Other (U+27D9) (1)
  "\u27d9": "t",
  // Other (U+292B) (1)
  "\u292b": "x",
  // Other (U+292C) (1)
  "\u292c": "x",
  // Other (U+2A2F) (1)
  "\u2a2f": "x",
  // Other (U+2C82) (1)
  "\u2c82": "b",
  // Other (U+2C85) (1)
  "\u2c85": "r",
  // Other (U+2C8E) (1)
  "\u2c8e": "h",
  // Other (U+2C92) (1)
  "\u2c92": "l",
  // Other (U+2C93) (1)
  "\u2c93": "i",
  // Other (U+2C94) (1)
  "\u2c94": "k",
  // Other (U+2C98) (1)
  "\u2c98": "m",
  // Other (U+2C9A) (1)
  "\u2c9a": "n",
  // Other (U+2C9C) (1)
  "\u2c9c": "3",
  // Other (U+2C9E) (1)
  "\u2c9e": "o",
  // Other (U+2C9F) (1)
  "\u2c9f": "o",
  // Other (U+2CA2) (1)
  "\u2ca2": "p",
  // Other (U+2CA3) (1)
  "\u2ca3": "p",
  // Other (U+2CA4) (1)
  "\u2ca4": "c",
  // Other (U+2CA5) (1)
  "\u2ca5": "c",
  // Other (U+2CA6) (1)
  "\u2ca6": "t",
  // Other (U+2CA8) (1)
  "\u2ca8": "y",
  // Other (U+2CA9) (1)
  "\u2ca9": "y",
  // Other (U+2CAC) (1)
  "\u2cac": "x",
  // Other (U+2CBD) (1)
  "\u2cbd": "w",
  // Other (U+2CC4) (1)
  "\u2cc4": "3",
  // Other (U+2CCA) (1)
  "\u2cca": "9",
  // Other (U+2CCB) (1)
  "\u2ccb": "9",
  // Other (U+2CCC) (1)
  "\u2ccc": "3",
  // Other (U+2CCE) (1)
  "\u2cce": "p",
  // Other (U+2CCF) (1)
  "\u2ccf": "p",
  // Other (U+2CD0) (1)
  "\u2cd0": "l",
  // Other (U+2CD2) (1)
  "\u2cd2": "6",
  // Other (U+2CD3) (1)
  "\u2cd3": "6",
  // Other (U+2CDC) (1)
  "\u2cdc": "6",
  // Other (U+2D38) (1)
  "\u2d38": "v",
  // Other (U+2D39) (1)
  "\u2d39": "e",
  // Other (U+2D4F) (1)
  "\u2d4f": "l",
  // Other (U+2D54) (1)
  "\u2d54": "o",
  // Other (U+2D55) (1)
  "\u2d55": "q",
  // Other (U+2D5D) (1)
  "\u2d5d": "x",
  // CJK Symbols and Punctuation (1)
  "\u3007": "o",
  // Other (U+A4D0) (1)
  "\ua4d0": "b",
  // Other (U+A4D1) (1)
  "\ua4d1": "p",
  // Other (U+A4D2) (1)
  "\ua4d2": "d",
  // Other (U+A4D3) (1)
  "\ua4d3": "d",
  // Other (U+A4D4) (1)
  "\ua4d4": "t",
  // Other (U+A4D6) (1)
  "\ua4d6": "g",
  // Other (U+A4D7) (1)
  "\ua4d7": "k",
  // Other (U+A4D9) (1)
  "\ua4d9": "j",
  // Other (U+A4DA) (1)
  "\ua4da": "c",
  // Other (U+A4DC) (1)
  "\ua4dc": "z",
  // Other (U+A4DD) (1)
  "\ua4dd": "f",
  // Other (U+A4DF) (1)
  "\ua4df": "m",
  // Other (U+A4E0) (1)
  "\ua4e0": "n",
  // Other (U+A4E1) (1)
  "\ua4e1": "l",
  // Other (U+A4E2) (1)
  "\ua4e2": "s",
  // Other (U+A4E3) (1)
  "\ua4e3": "r",
  // Other (U+A4E6) (1)
  "\ua4e6": "v",
  // Other (U+A4E7) (1)
  "\ua4e7": "h",
  // Other (U+A4EA) (1)
  "\ua4ea": "w",
  // Other (U+A4EB) (1)
  "\ua4eb": "x",
  // Other (U+A4EC) (1)
  "\ua4ec": "y",
  // Other (U+A4EE) (1)
  "\ua4ee": "a",
  // Other (U+A4F0) (1)
  "\ua4f0": "e",
  // Other (U+A4F2) (1)
  "\ua4f2": "l",
  // Other (U+A4F3) (1)
  "\ua4f3": "o",
  // Other (U+A4F4) (1)
  "\ua4f4": "u",
  // Other (U+A644) (1)
  "\ua644": "2",
  // Other (U+A647) (1)
  "\ua647": "i",
  // Other (U+A6DF) (1)
  "\ua6df": "v",
  // Other (U+A6EF) (1)
  "\ua6ef": "2",
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
  // Other (U+FBA6) (1)
  "\ufba6": "o",
  // Other (U+FBA7) (1)
  "\ufba7": "o",
  // Other (U+FBA8) (1)
  "\ufba8": "o",
  // Other (U+FBA9) (1)
  "\ufba9": "o",
  // Other (U+FBAA) (1)
  "\ufbaa": "o",
  // Other (U+FBAB) (1)
  "\ufbab": "o",
  // Other (U+FBAC) (1)
  "\ufbac": "o",
  // Other (U+FBAD) (1)
  "\ufbad": "o",
  // Other (U+FE8D) (1)
  "\ufe8d": "l",
  // Other (U+FE8E) (1)
  "\ufe8e": "l",
  // Other (U+FEE9) (1)
  "\ufee9": "o",
  // Other (U+FEEA) (1)
  "\ufeea": "o",
  // Other (U+FEEB) (1)
  "\ufeeb": "o",
  // Other (U+FEEC) (1)
  "\ufeec": "o",
  // Halfwidth and Fullwidth Forms (32)
  "\uff21": "a", "\uff22": "b", "\uff23": "c", "\uff25": "e",
  "\uff28": "h", "\uff29": "l", "\uff2a": "j", "\uff2b": "k",
  "\uff2d": "m", "\uff2e": "n", "\uff2f": "o", "\uff30": "p",
  "\uff33": "s", "\uff34": "t", "\uff38": "x", "\uff39": "y",
  "\uff3a": "z", "\uff41": "a", "\uff43": "c", "\uff45": "e",
  "\uff47": "g", "\uff48": "h", "\uff49": "i", "\uff4a": "j",
  "\uff4c": "l", "\uff4f": "o", "\uff50": "p", "\uff53": "s",
  "\uff56": "v", "\uff58": "x", "\uff59": "y", "\uffe8": "l",
  // Other (U+10282) (1)
  "\u{10282}": "b",
  // Other (U+10286) (1)
  "\u{10286}": "e",
  // Other (U+10287) (1)
  "\u{10287}": "f",
  // Other (U+1028A) (1)
  "\u{1028a}": "l",
  // Other (U+10290) (1)
  "\u{10290}": "x",
  // Other (U+10292) (1)
  "\u{10292}": "o",
  // Other (U+10295) (1)
  "\u{10295}": "p",
  // Other (U+10296) (1)
  "\u{10296}": "s",
  // Other (U+10297) (1)
  "\u{10297}": "t",
  // Other (U+102A0) (1)
  "\u{102a0}": "a",
  // Other (U+102A1) (1)
  "\u{102a1}": "b",
  // Other (U+102A2) (1)
  "\u{102a2}": "c",
  // Other (U+102A5) (1)
  "\u{102a5}": "f",
  // Other (U+102AB) (1)
  "\u{102ab}": "o",
  // Other (U+102B0) (1)
  "\u{102b0}": "m",
  // Other (U+102B1) (1)
  "\u{102b1}": "t",
  // Other (U+102B2) (1)
  "\u{102b2}": "y",
  // Other (U+102B4) (1)
  "\u{102b4}": "x",
  // Other (U+102CF) (1)
  "\u{102cf}": "h",
  // Other (U+102F5) (1)
  "\u{102f5}": "z",
  // Other (U+10301) (1)
  "\u{10301}": "b",
  // Other (U+10302) (1)
  "\u{10302}": "c",
  // Other (U+10309) (1)
  "\u{10309}": "l",
  // Other (U+10311) (1)
  "\u{10311}": "m",
  // Other (U+10315) (1)
  "\u{10315}": "t",
  // Other (U+10317) (1)
  "\u{10317}": "x",
  // Other (U+1031A) (1)
  "\u{1031a}": "8",
  // Other (U+10320) (1)
  "\u{10320}": "l",
  // Other (U+10322) (1)
  "\u{10322}": "x",
  // Other (U+10404) (1)
  "\u{10404}": "o",
  // Other (U+10415) (1)
  "\u{10415}": "c",
  // Other (U+1041B) (1)
  "\u{1041b}": "l",
  // Other (U+10420) (1)
  "\u{10420}": "s",
  // Other (U+1042C) (1)
  "\u{1042c}": "o",
  // Other (U+1043D) (1)
  "\u{1043d}": "c",
  // Other (U+10448) (1)
  "\u{10448}": "s",
  // Other (U+104B4) (1)
  "\u{104b4}": "r",
  // Other (U+104C2) (1)
  "\u{104c2}": "o",
  // Other (U+104CE) (1)
  "\u{104ce}": "u",
  // Other (U+104D2) (1)
  "\u{104d2}": "7",
  // Other (U+104EA) (1)
  "\u{104ea}": "o",
  // Other (U+104F6) (1)
  "\u{104f6}": "u",
  // Other (U+10513) (1)
  "\u{10513}": "n",
  // Other (U+10516) (1)
  "\u{10516}": "o",
  // Other (U+10518) (1)
  "\u{10518}": "k",
  // Other (U+1051C) (1)
  "\u{1051c}": "c",
  // Other (U+1051D) (1)
  "\u{1051d}": "v",
  // Other (U+10525) (1)
  "\u{10525}": "f",
  // Other (U+10526) (1)
  "\u{10526}": "l",
  // Other (U+10527) (1)
  "\u{10527}": "x",
  // Other (U+114D0) (1)
  "\u{114d0}": "o",
  // Other (U+11706) (1)
  "\u{11706}": "v",
  // Other (U+1170A) (1)
  "\u{1170a}": "w",
  // Other (U+1170E) (1)
  "\u{1170e}": "w",
  // Other (U+1170F) (1)
  "\u{1170f}": "w",
  // Other (U+118A0) (1)
  "\u{118a0}": "v",
  // Other (U+118A2) (1)
  "\u{118a2}": "f",
  // Other (U+118A3) (1)
  "\u{118a3}": "l",
  // Other (U+118A4) (1)
  "\u{118a4}": "y",
  // Other (U+118A6) (1)
  "\u{118a6}": "e",
  // Other (U+118A9) (1)
  "\u{118a9}": "z",
  // Other (U+118AC) (1)
  "\u{118ac}": "9",
  // Other (U+118AE) (1)
  "\u{118ae}": "e",
  // Other (U+118AF) (1)
  "\u{118af}": "4",
  // Other (U+118B2) (1)
  "\u{118b2}": "l",
  // Other (U+118B5) (1)
  "\u{118b5}": "o",
  // Other (U+118B8) (1)
  "\u{118b8}": "u",
  // Other (U+118BB) (1)
  "\u{118bb}": "5",
  // Other (U+118BC) (1)
  "\u{118bc}": "t",
  // Other (U+118C0) (1)
  "\u{118c0}": "v",
  // Other (U+118C1) (1)
  "\u{118c1}": "s",
  // Other (U+118C2) (1)
  "\u{118c2}": "f",
  // Other (U+118C3) (1)
  "\u{118c3}": "i",
  // Other (U+118C4) (1)
  "\u{118c4}": "z",
  // Other (U+118C6) (1)
  "\u{118c6}": "7",
  // Other (U+118C8) (1)
  "\u{118c8}": "o",
  // Other (U+118CA) (1)
  "\u{118ca}": "3",
  // Other (U+118CC) (1)
  "\u{118cc}": "9",
  // Other (U+118D5) (1)
  "\u{118d5}": "6",
  // Other (U+118D6) (1)
  "\u{118d6}": "9",
  // Other (U+118D7) (1)
  "\u{118d7}": "o",
  // Other (U+118D8) (1)
  "\u{118d8}": "u",
  // Other (U+118DC) (1)
  "\u{118dc}": "y",
  // Other (U+118E0) (1)
  "\u{118e0}": "o",
  // Other (U+118E5) (1)
  "\u{118e5}": "z",
  // Other (U+118E6) (1)
  "\u{118e6}": "w",
  // Other (U+118E9) (1)
  "\u{118e9}": "c",
  // Other (U+118EC) (1)
  "\u{118ec}": "x",
  // Other (U+118EF) (1)
  "\u{118ef}": "w",
  // Other (U+118F2) (1)
  "\u{118f2}": "c",
  // Other (U+11DDA) (1)
  "\u{11dda}": "l",
  // Other (U+11DE0) (1)
  "\u{11de0}": "o",
  // Other (U+11DE1) (1)
  "\u{11de1}": "l",
  // Other (U+16EAA) (1)
  "\u{16eaa}": "l",
  // Other (U+16EB6) (1)
  "\u{16eb6}": "b",
  // Other (U+16F08) (1)
  "\u{16f08}": "v",
  // Other (U+16F0A) (1)
  "\u{16f0a}": "t",
  // Other (U+16F16) (1)
  "\u{16f16}": "l",
  // Other (U+16F28) (1)
  "\u{16f28}": "l",
  // Other (U+16F35) (1)
  "\u{16f35}": "r",
  // Other (U+16F3A) (1)
  "\u{16f3a}": "s",
  // Other (U+16F3B) (1)
  "\u{16f3b}": "3",
  // Other (U+16F40) (1)
  "\u{16f40}": "a",
  // Other (U+16F42) (1)
  "\u{16f42}": "u",
  // Other (U+16F43) (1)
  "\u{16f43}": "y",
  // Other (U+1CCD6) (1)
  "\u{1ccd6}": "a",
  // Other (U+1CCD7) (1)
  "\u{1ccd7}": "b",
  // Other (U+1CCD8) (1)
  "\u{1ccd8}": "c",
  // Other (U+1CCD9) (1)
  "\u{1ccd9}": "d",
  // Other (U+1CCDA) (1)
  "\u{1ccda}": "e",
  // Other (U+1CCDB) (1)
  "\u{1ccdb}": "f",
  // Other (U+1CCDC) (1)
  "\u{1ccdc}": "g",
  // Other (U+1CCDD) (1)
  "\u{1ccdd}": "h",
  // Other (U+1CCDE) (1)
  "\u{1ccde}": "l",
  // Other (U+1CCDF) (1)
  "\u{1ccdf}": "j",
  // Other (U+1CCE0) (1)
  "\u{1cce0}": "k",
  // Other (U+1CCE1) (1)
  "\u{1cce1}": "l",
  // Other (U+1CCE2) (1)
  "\u{1cce2}": "m",
  // Other (U+1CCE3) (1)
  "\u{1cce3}": "n",
  // Other (U+1CCE4) (1)
  "\u{1cce4}": "o",
  // Other (U+1CCE5) (1)
  "\u{1cce5}": "p",
  // Other (U+1CCE6) (1)
  "\u{1cce6}": "q",
  // Other (U+1CCE7) (1)
  "\u{1cce7}": "r",
  // Other (U+1CCE8) (1)
  "\u{1cce8}": "s",
  // Other (U+1CCE9) (1)
  "\u{1cce9}": "t",
  // Other (U+1CCEA) (1)
  "\u{1ccea}": "u",
  // Other (U+1CCEB) (1)
  "\u{1cceb}": "v",
  // Other (U+1CCEC) (1)
  "\u{1ccec}": "w",
  // Other (U+1CCED) (1)
  "\u{1cced}": "x",
  // Other (U+1CCEE) (1)
  "\u{1ccee}": "y",
  // Other (U+1CCEF) (1)
  "\u{1ccef}": "z",
  // Other (U+1CCF0) (1)
  "\u{1ccf0}": "o",
  // Other (U+1CCF1) (1)
  "\u{1ccf1}": "l",
  // Other (U+1CCF2) (1)
  "\u{1ccf2}": "2",
  // Other (U+1CCF3) (1)
  "\u{1ccf3}": "3",
  // Other (U+1CCF4) (1)
  "\u{1ccf4}": "4",
  // Other (U+1CCF5) (1)
  "\u{1ccf5}": "5",
  // Other (U+1CCF6) (1)
  "\u{1ccf6}": "6",
  // Other (U+1CCF7) (1)
  "\u{1ccf7}": "7",
  // Other (U+1CCF8) (1)
  "\u{1ccf8}": "8",
  // Other (U+1CCF9) (1)
  "\u{1ccf9}": "9",
  // Other (U+1D206) (1)
  "\u{1d206}": "3",
  // Other (U+1D20D) (1)
  "\u{1d20d}": "v",
  // Other (U+1D212) (1)
  "\u{1d212}": "7",
  // Other (U+1D213) (1)
  "\u{1d213}": "f",
  // Other (U+1D216) (1)
  "\u{1d216}": "r",
  // Other (U+1D22A) (1)
  "\u{1d22a}": "l",
  // Mathematical Alphanumeric Symbols (806)
  "\u{1d400}": "a", "\u{1d401}": "b", "\u{1d402}": "c", "\u{1d403}": "d",
  "\u{1d404}": "e", "\u{1d405}": "f", "\u{1d406}": "g", "\u{1d407}": "h",
  "\u{1d408}": "l", "\u{1d409}": "j", "\u{1d40a}": "k", "\u{1d40b}": "l",
  "\u{1d40c}": "m", "\u{1d40d}": "n", "\u{1d40e}": "o", "\u{1d40f}": "p",
  "\u{1d410}": "q", "\u{1d411}": "r", "\u{1d412}": "s", "\u{1d413}": "t",
  "\u{1d414}": "u", "\u{1d415}": "v", "\u{1d416}": "w", "\u{1d417}": "x",
  "\u{1d418}": "y", "\u{1d419}": "z", "\u{1d41a}": "a", "\u{1d41b}": "b",
  "\u{1d41c}": "c", "\u{1d41d}": "d", "\u{1d41e}": "e", "\u{1d41f}": "f",
  "\u{1d420}": "g", "\u{1d421}": "h", "\u{1d422}": "i", "\u{1d423}": "j",
  "\u{1d424}": "k", "\u{1d425}": "l", "\u{1d427}": "n", "\u{1d428}": "o",
  "\u{1d429}": "p", "\u{1d42a}": "q", "\u{1d42b}": "r", "\u{1d42c}": "s",
  "\u{1d42d}": "t", "\u{1d42e}": "u", "\u{1d42f}": "v", "\u{1d430}": "w",
  "\u{1d431}": "x", "\u{1d432}": "y", "\u{1d433}": "z", "\u{1d434}": "a",
  "\u{1d435}": "b", "\u{1d436}": "c", "\u{1d437}": "d", "\u{1d438}": "e",
  "\u{1d439}": "f", "\u{1d43a}": "g", "\u{1d43b}": "h", "\u{1d43c}": "l",
  "\u{1d43d}": "j", "\u{1d43e}": "k", "\u{1d43f}": "l", "\u{1d440}": "m",
  "\u{1d441}": "n", "\u{1d442}": "o", "\u{1d443}": "p", "\u{1d444}": "q",
  "\u{1d445}": "r", "\u{1d446}": "s", "\u{1d447}": "t", "\u{1d448}": "u",
  "\u{1d449}": "v", "\u{1d44a}": "w", "\u{1d44b}": "x", "\u{1d44c}": "y",
  "\u{1d44d}": "z", "\u{1d44e}": "a", "\u{1d44f}": "b", "\u{1d450}": "c",
  "\u{1d451}": "d", "\u{1d452}": "e", "\u{1d453}": "f", "\u{1d454}": "g",
  "\u{1d456}": "i", "\u{1d457}": "j", "\u{1d458}": "k", "\u{1d459}": "l",
  "\u{1d45b}": "n", "\u{1d45c}": "o", "\u{1d45d}": "p", "\u{1d45e}": "q",
  "\u{1d45f}": "r", "\u{1d460}": "s", "\u{1d461}": "t", "\u{1d462}": "u",
  "\u{1d463}": "v", "\u{1d464}": "w", "\u{1d465}": "x", "\u{1d466}": "y",
  "\u{1d467}": "z", "\u{1d468}": "a", "\u{1d469}": "b", "\u{1d46a}": "c",
  "\u{1d46b}": "d", "\u{1d46c}": "e", "\u{1d46d}": "f", "\u{1d46e}": "g",
  "\u{1d46f}": "h", "\u{1d470}": "l", "\u{1d471}": "j", "\u{1d472}": "k",
  "\u{1d473}": "l", "\u{1d474}": "m", "\u{1d475}": "n", "\u{1d476}": "o",
  "\u{1d477}": "p", "\u{1d478}": "q", "\u{1d479}": "r", "\u{1d47a}": "s",
  "\u{1d47b}": "t", "\u{1d47c}": "u", "\u{1d47d}": "v", "\u{1d47e}": "w",
  "\u{1d47f}": "x", "\u{1d480}": "y", "\u{1d481}": "z", "\u{1d482}": "a",
  "\u{1d483}": "b", "\u{1d484}": "c", "\u{1d485}": "d", "\u{1d486}": "e",
  "\u{1d487}": "f", "\u{1d488}": "g", "\u{1d489}": "h", "\u{1d48a}": "i",
  "\u{1d48b}": "j", "\u{1d48c}": "k", "\u{1d48d}": "l", "\u{1d48f}": "n",
  "\u{1d490}": "o", "\u{1d491}": "p", "\u{1d492}": "q", "\u{1d493}": "r",
  "\u{1d494}": "s", "\u{1d495}": "t", "\u{1d496}": "u", "\u{1d497}": "v",
  "\u{1d498}": "w", "\u{1d499}": "x", "\u{1d49a}": "y", "\u{1d49b}": "z",
  "\u{1d49c}": "a", "\u{1d49e}": "c", "\u{1d49f}": "d", "\u{1d4a2}": "g",
  "\u{1d4a5}": "j", "\u{1d4a6}": "k", "\u{1d4a9}": "n", "\u{1d4aa}": "o",
  "\u{1d4ab}": "p", "\u{1d4ac}": "q", "\u{1d4ae}": "s", "\u{1d4af}": "t",
  "\u{1d4b0}": "u", "\u{1d4b1}": "v", "\u{1d4b2}": "w", "\u{1d4b3}": "x",
  "\u{1d4b4}": "y", "\u{1d4b5}": "z", "\u{1d4b6}": "a", "\u{1d4b7}": "b",
  "\u{1d4b8}": "c", "\u{1d4b9}": "d", "\u{1d4bb}": "f", "\u{1d4bd}": "h",
  "\u{1d4be}": "i", "\u{1d4bf}": "j", "\u{1d4c0}": "k", "\u{1d4c1}": "l",
  "\u{1d4c3}": "n", "\u{1d4c5}": "p", "\u{1d4c6}": "q", "\u{1d4c7}": "r",
  "\u{1d4c8}": "s", "\u{1d4c9}": "t", "\u{1d4ca}": "u", "\u{1d4cb}": "v",
  "\u{1d4cc}": "w", "\u{1d4cd}": "x", "\u{1d4ce}": "y", "\u{1d4cf}": "z",
  "\u{1d4d0}": "a", "\u{1d4d1}": "b", "\u{1d4d2}": "c", "\u{1d4d3}": "d",
  "\u{1d4d4}": "e", "\u{1d4d5}": "f", "\u{1d4d6}": "g", "\u{1d4d7}": "h",
  "\u{1d4d8}": "l", "\u{1d4d9}": "j", "\u{1d4da}": "k", "\u{1d4db}": "l",
  "\u{1d4dc}": "m", "\u{1d4dd}": "n", "\u{1d4de}": "o", "\u{1d4df}": "p",
  "\u{1d4e0}": "q", "\u{1d4e1}": "r", "\u{1d4e2}": "s", "\u{1d4e3}": "t",
  "\u{1d4e4}": "u", "\u{1d4e5}": "v", "\u{1d4e6}": "w", "\u{1d4e7}": "x",
  "\u{1d4e8}": "y", "\u{1d4e9}": "z", "\u{1d4ea}": "a", "\u{1d4eb}": "b",
  "\u{1d4ec}": "c", "\u{1d4ed}": "d", "\u{1d4ee}": "e", "\u{1d4ef}": "f",
  "\u{1d4f0}": "g", "\u{1d4f1}": "h", "\u{1d4f2}": "i", "\u{1d4f3}": "j",
  "\u{1d4f4}": "k", "\u{1d4f5}": "l", "\u{1d4f7}": "n", "\u{1d4f8}": "o",
  "\u{1d4f9}": "p", "\u{1d4fa}": "q", "\u{1d4fb}": "r", "\u{1d4fc}": "s",
  "\u{1d4fd}": "t", "\u{1d4fe}": "u", "\u{1d4ff}": "v", "\u{1d500}": "w",
  "\u{1d501}": "x", "\u{1d502}": "y", "\u{1d503}": "z", "\u{1d504}": "a",
  "\u{1d505}": "b", "\u{1d507}": "d", "\u{1d508}": "e", "\u{1d509}": "f",
  "\u{1d50a}": "g", "\u{1d50d}": "j", "\u{1d50e}": "k", "\u{1d50f}": "l",
  "\u{1d510}": "m", "\u{1d511}": "n", "\u{1d512}": "o", "\u{1d513}": "p",
  "\u{1d514}": "q", "\u{1d516}": "s", "\u{1d517}": "t", "\u{1d518}": "u",
  "\u{1d519}": "v", "\u{1d51a}": "w", "\u{1d51b}": "x", "\u{1d51c}": "y",
  "\u{1d51e}": "a", "\u{1d51f}": "b", "\u{1d520}": "c", "\u{1d521}": "d",
  "\u{1d522}": "e", "\u{1d523}": "f", "\u{1d524}": "g", "\u{1d525}": "h",
  "\u{1d526}": "i", "\u{1d527}": "j", "\u{1d528}": "k", "\u{1d529}": "l",
  "\u{1d52b}": "n", "\u{1d52c}": "o", "\u{1d52d}": "p", "\u{1d52e}": "q",
  "\u{1d52f}": "r", "\u{1d530}": "s", "\u{1d531}": "t", "\u{1d532}": "u",
  "\u{1d533}": "v", "\u{1d534}": "w", "\u{1d535}": "x", "\u{1d536}": "y",
  "\u{1d537}": "z", "\u{1d538}": "a", "\u{1d539}": "b", "\u{1d53b}": "d",
  "\u{1d53c}": "e", "\u{1d53d}": "f", "\u{1d53e}": "g", "\u{1d540}": "l",
  "\u{1d541}": "j", "\u{1d542}": "k", "\u{1d543}": "l", "\u{1d544}": "m",
  "\u{1d546}": "o", "\u{1d54a}": "s", "\u{1d54b}": "t", "\u{1d54c}": "u",
  "\u{1d54d}": "v", "\u{1d54e}": "w", "\u{1d54f}": "x", "\u{1d550}": "y",
  "\u{1d552}": "a", "\u{1d553}": "b", "\u{1d554}": "c", "\u{1d555}": "d",
  "\u{1d556}": "e", "\u{1d557}": "f", "\u{1d558}": "g", "\u{1d559}": "h",
  "\u{1d55a}": "i", "\u{1d55b}": "j", "\u{1d55c}": "k", "\u{1d55d}": "l",
  "\u{1d55f}": "n", "\u{1d560}": "o", "\u{1d561}": "p", "\u{1d562}": "q",
  "\u{1d563}": "r", "\u{1d564}": "s", "\u{1d565}": "t", "\u{1d566}": "u",
  "\u{1d567}": "v", "\u{1d568}": "w", "\u{1d569}": "x", "\u{1d56a}": "y",
  "\u{1d56b}": "z", "\u{1d56c}": "a", "\u{1d56d}": "b", "\u{1d56e}": "c",
  "\u{1d56f}": "d", "\u{1d570}": "e", "\u{1d571}": "f", "\u{1d572}": "g",
  "\u{1d573}": "h", "\u{1d574}": "l", "\u{1d575}": "j", "\u{1d576}": "k",
  "\u{1d577}": "l", "\u{1d578}": "m", "\u{1d579}": "n", "\u{1d57a}": "o",
  "\u{1d57b}": "p", "\u{1d57c}": "q", "\u{1d57d}": "r", "\u{1d57e}": "s",
  "\u{1d57f}": "t", "\u{1d580}": "u", "\u{1d581}": "v", "\u{1d582}": "w",
  "\u{1d583}": "x", "\u{1d584}": "y", "\u{1d585}": "z", "\u{1d586}": "a",
  "\u{1d587}": "b", "\u{1d588}": "c", "\u{1d589}": "d", "\u{1d58a}": "e",
  "\u{1d58b}": "f", "\u{1d58c}": "g", "\u{1d58d}": "h", "\u{1d58e}": "i",
  "\u{1d58f}": "j", "\u{1d590}": "k", "\u{1d591}": "l", "\u{1d593}": "n",
  "\u{1d594}": "o", "\u{1d595}": "p", "\u{1d596}": "q", "\u{1d597}": "r",
  "\u{1d598}": "s", "\u{1d599}": "t", "\u{1d59a}": "u", "\u{1d59b}": "v",
  "\u{1d59c}": "w", "\u{1d59d}": "x", "\u{1d59e}": "y", "\u{1d59f}": "z",
  "\u{1d5a0}": "a", "\u{1d5a1}": "b", "\u{1d5a2}": "c", "\u{1d5a3}": "d",
  "\u{1d5a4}": "e", "\u{1d5a5}": "f", "\u{1d5a6}": "g", "\u{1d5a7}": "h",
  "\u{1d5a8}": "l", "\u{1d5a9}": "j", "\u{1d5aa}": "k", "\u{1d5ab}": "l",
  "\u{1d5ac}": "m", "\u{1d5ad}": "n", "\u{1d5ae}": "o", "\u{1d5af}": "p",
  "\u{1d5b0}": "q", "\u{1d5b1}": "r", "\u{1d5b2}": "s", "\u{1d5b3}": "t",
  "\u{1d5b4}": "u", "\u{1d5b5}": "v", "\u{1d5b6}": "w", "\u{1d5b7}": "x",
  "\u{1d5b8}": "y", "\u{1d5b9}": "z", "\u{1d5ba}": "a", "\u{1d5bb}": "b",
  "\u{1d5bc}": "c", "\u{1d5bd}": "d", "\u{1d5be}": "e", "\u{1d5bf}": "f",
  "\u{1d5c0}": "g", "\u{1d5c1}": "h", "\u{1d5c2}": "i", "\u{1d5c3}": "j",
  "\u{1d5c4}": "k", "\u{1d5c5}": "l", "\u{1d5c7}": "n", "\u{1d5c8}": "o",
  "\u{1d5c9}": "p", "\u{1d5ca}": "q", "\u{1d5cb}": "r", "\u{1d5cc}": "s",
  "\u{1d5cd}": "t", "\u{1d5ce}": "u", "\u{1d5cf}": "v", "\u{1d5d0}": "w",
  "\u{1d5d1}": "x", "\u{1d5d2}": "y", "\u{1d5d3}": "z", "\u{1d5d4}": "a",
  "\u{1d5d5}": "b", "\u{1d5d6}": "c", "\u{1d5d7}": "d", "\u{1d5d8}": "e",
  "\u{1d5d9}": "f", "\u{1d5da}": "g", "\u{1d5db}": "h", "\u{1d5dc}": "l",
  "\u{1d5dd}": "j", "\u{1d5de}": "k", "\u{1d5df}": "l", "\u{1d5e0}": "m",
  "\u{1d5e1}": "n", "\u{1d5e2}": "o", "\u{1d5e3}": "p", "\u{1d5e4}": "q",
  "\u{1d5e5}": "r", "\u{1d5e6}": "s", "\u{1d5e7}": "t", "\u{1d5e8}": "u",
  "\u{1d5e9}": "v", "\u{1d5ea}": "w", "\u{1d5eb}": "x", "\u{1d5ec}": "y",
  "\u{1d5ed}": "z", "\u{1d5ee}": "a", "\u{1d5ef}": "b", "\u{1d5f0}": "c",
  "\u{1d5f1}": "d", "\u{1d5f2}": "e", "\u{1d5f3}": "f", "\u{1d5f4}": "g",
  "\u{1d5f5}": "h", "\u{1d5f6}": "i", "\u{1d5f7}": "j", "\u{1d5f8}": "k",
  "\u{1d5f9}": "l", "\u{1d5fb}": "n", "\u{1d5fc}": "o", "\u{1d5fd}": "p",
  "\u{1d5fe}": "q", "\u{1d5ff}": "r", "\u{1d600}": "s", "\u{1d601}": "t",
  "\u{1d602}": "u", "\u{1d603}": "v", "\u{1d604}": "w", "\u{1d605}": "x",
  "\u{1d606}": "y", "\u{1d607}": "z", "\u{1d608}": "a", "\u{1d609}": "b",
  "\u{1d60a}": "c", "\u{1d60b}": "d", "\u{1d60c}": "e", "\u{1d60d}": "f",
  "\u{1d60e}": "g", "\u{1d60f}": "h", "\u{1d610}": "l", "\u{1d611}": "j",
  "\u{1d612}": "k", "\u{1d613}": "l", "\u{1d614}": "m", "\u{1d615}": "n",
  "\u{1d616}": "o", "\u{1d617}": "p", "\u{1d618}": "q", "\u{1d619}": "r",
  "\u{1d61a}": "s", "\u{1d61b}": "t", "\u{1d61c}": "u", "\u{1d61d}": "v",
  "\u{1d61e}": "w", "\u{1d61f}": "x", "\u{1d620}": "y", "\u{1d621}": "z",
  "\u{1d622}": "a", "\u{1d623}": "b", "\u{1d624}": "c", "\u{1d625}": "d",
  "\u{1d626}": "e", "\u{1d627}": "f", "\u{1d628}": "g", "\u{1d629}": "h",
  "\u{1d62a}": "i", "\u{1d62b}": "j", "\u{1d62c}": "k", "\u{1d62d}": "l",
  "\u{1d62f}": "n", "\u{1d630}": "o", "\u{1d631}": "p", "\u{1d632}": "q",
  "\u{1d633}": "r", "\u{1d634}": "s", "\u{1d635}": "t", "\u{1d636}": "u",
  "\u{1d637}": "v", "\u{1d638}": "w", "\u{1d639}": "x", "\u{1d63a}": "y",
  "\u{1d63b}": "z", "\u{1d63c}": "a", "\u{1d63d}": "b", "\u{1d63e}": "c",
  "\u{1d63f}": "d", "\u{1d640}": "e", "\u{1d641}": "f", "\u{1d642}": "g",
  "\u{1d643}": "h", "\u{1d644}": "l", "\u{1d645}": "j", "\u{1d646}": "k",
  "\u{1d647}": "l", "\u{1d648}": "m", "\u{1d649}": "n", "\u{1d64a}": "o",
  "\u{1d64b}": "p", "\u{1d64c}": "q", "\u{1d64d}": "r", "\u{1d64e}": "s",
  "\u{1d64f}": "t", "\u{1d650}": "u", "\u{1d651}": "v", "\u{1d652}": "w",
  "\u{1d653}": "x", "\u{1d654}": "y", "\u{1d655}": "z", "\u{1d656}": "a",
  "\u{1d657}": "b", "\u{1d658}": "c", "\u{1d659}": "d", "\u{1d65a}": "e",
  "\u{1d65b}": "f", "\u{1d65c}": "g", "\u{1d65d}": "h", "\u{1d65e}": "i",
  "\u{1d65f}": "j", "\u{1d660}": "k", "\u{1d661}": "l", "\u{1d663}": "n",
  "\u{1d664}": "o", "\u{1d665}": "p", "\u{1d666}": "q", "\u{1d667}": "r",
  "\u{1d668}": "s", "\u{1d669}": "t", "\u{1d66a}": "u", "\u{1d66b}": "v",
  "\u{1d66c}": "w", "\u{1d66d}": "x", "\u{1d66e}": "y", "\u{1d66f}": "z",
  "\u{1d670}": "a", "\u{1d671}": "b", "\u{1d672}": "c", "\u{1d673}": "d",
  "\u{1d674}": "e", "\u{1d675}": "f", "\u{1d676}": "g", "\u{1d677}": "h",
  "\u{1d678}": "l", "\u{1d679}": "j", "\u{1d67a}": "k", "\u{1d67b}": "l",
  "\u{1d67c}": "m", "\u{1d67d}": "n", "\u{1d67e}": "o", "\u{1d67f}": "p",
  "\u{1d680}": "q", "\u{1d681}": "r", "\u{1d682}": "s", "\u{1d683}": "t",
  "\u{1d684}": "u", "\u{1d685}": "v", "\u{1d686}": "w", "\u{1d687}": "x",
  "\u{1d688}": "y", "\u{1d689}": "z", "\u{1d68a}": "a", "\u{1d68b}": "b",
  "\u{1d68c}": "c", "\u{1d68d}": "d", "\u{1d68e}": "e", "\u{1d68f}": "f",
  "\u{1d690}": "g", "\u{1d691}": "h", "\u{1d692}": "i", "\u{1d693}": "j",
  "\u{1d694}": "k", "\u{1d695}": "l", "\u{1d697}": "n", "\u{1d698}": "o",
  "\u{1d699}": "p", "\u{1d69a}": "q", "\u{1d69b}": "r", "\u{1d69c}": "s",
  "\u{1d69d}": "t", "\u{1d69e}": "u", "\u{1d69f}": "v", "\u{1d6a0}": "w",
  "\u{1d6a1}": "x", "\u{1d6a2}": "y", "\u{1d6a3}": "z", "\u{1d6a4}": "i",
  "\u{1d6a8}": "a", "\u{1d6a9}": "b", "\u{1d6ac}": "e", "\u{1d6ad}": "z",
  "\u{1d6ae}": "h", "\u{1d6b0}": "l", "\u{1d6b1}": "k", "\u{1d6b3}": "m",
  "\u{1d6b4}": "n", "\u{1d6b6}": "o", "\u{1d6b8}": "p", "\u{1d6bb}": "t",
  "\u{1d6bc}": "y", "\u{1d6be}": "x", "\u{1d6c2}": "a", "\u{1d6c4}": "y",
  "\u{1d6ca}": "i", "\u{1d6ce}": "v", "\u{1d6d0}": "o", "\u{1d6d2}": "p",
  "\u{1d6d4}": "o", "\u{1d6d6}": "u", "\u{1d6e0}": "p", "\u{1d6e2}": "a",
  "\u{1d6e3}": "b", "\u{1d6e6}": "e", "\u{1d6e7}": "z", "\u{1d6e8}": "h",
  "\u{1d6ea}": "l", "\u{1d6eb}": "k", "\u{1d6ed}": "m", "\u{1d6ee}": "n",
  "\u{1d6f0}": "o", "\u{1d6f2}": "p", "\u{1d6f5}": "t", "\u{1d6f6}": "y",
  "\u{1d6f8}": "x", "\u{1d6fc}": "a", "\u{1d6fe}": "y", "\u{1d704}": "i",
  "\u{1d708}": "v", "\u{1d70a}": "o", "\u{1d70c}": "p", "\u{1d70e}": "o",
  "\u{1d710}": "u", "\u{1d71a}": "p", "\u{1d71c}": "a", "\u{1d71d}": "b",
  "\u{1d720}": "e", "\u{1d721}": "z", "\u{1d722}": "h", "\u{1d724}": "l",
  "\u{1d725}": "k", "\u{1d727}": "m", "\u{1d728}": "n", "\u{1d72a}": "o",
  "\u{1d72c}": "p", "\u{1d72f}": "t", "\u{1d730}": "y", "\u{1d732}": "x",
  "\u{1d736}": "a", "\u{1d738}": "y", "\u{1d73e}": "i", "\u{1d742}": "v",
  "\u{1d744}": "o", "\u{1d746}": "p", "\u{1d748}": "o", "\u{1d74a}": "u",
  "\u{1d754}": "p", "\u{1d756}": "a", "\u{1d757}": "b", "\u{1d75a}": "e",
  "\u{1d75b}": "z", "\u{1d75c}": "h", "\u{1d75e}": "l", "\u{1d75f}": "k",
  "\u{1d761}": "m", "\u{1d762}": "n", "\u{1d764}": "o", "\u{1d766}": "p",
  "\u{1d769}": "t", "\u{1d76a}": "y", "\u{1d76c}": "x", "\u{1d770}": "a",
  "\u{1d772}": "y", "\u{1d778}": "i", "\u{1d77c}": "v", "\u{1d77e}": "o",
  "\u{1d780}": "p", "\u{1d782}": "o", "\u{1d784}": "u", "\u{1d78e}": "p",
  "\u{1d790}": "a", "\u{1d791}": "b", "\u{1d794}": "e", "\u{1d795}": "z",
  "\u{1d796}": "h", "\u{1d798}": "l", "\u{1d799}": "k", "\u{1d79b}": "m",
  "\u{1d79c}": "n", "\u{1d79e}": "o", "\u{1d7a0}": "p", "\u{1d7a3}": "t",
  "\u{1d7a4}": "y", "\u{1d7a6}": "x", "\u{1d7aa}": "a", "\u{1d7ac}": "y",
  "\u{1d7b2}": "i", "\u{1d7b6}": "v", "\u{1d7b8}": "o", "\u{1d7ba}": "p",
  "\u{1d7bc}": "o", "\u{1d7be}": "u", "\u{1d7c8}": "p", "\u{1d7ca}": "f",
  "\u{1d7ce}": "o", "\u{1d7cf}": "l", "\u{1d7d0}": "2", "\u{1d7d1}": "3",
  "\u{1d7d2}": "4", "\u{1d7d3}": "5", "\u{1d7d4}": "6", "\u{1d7d5}": "7",
  "\u{1d7d6}": "8", "\u{1d7d7}": "9", "\u{1d7d8}": "o", "\u{1d7d9}": "l",
  "\u{1d7da}": "2", "\u{1d7db}": "3", "\u{1d7dc}": "4", "\u{1d7dd}": "5",
  "\u{1d7de}": "6", "\u{1d7df}": "7", "\u{1d7e0}": "8", "\u{1d7e1}": "9",
  "\u{1d7e2}": "o", "\u{1d7e3}": "l", "\u{1d7e4}": "2", "\u{1d7e5}": "3",
  "\u{1d7e6}": "4", "\u{1d7e7}": "5", "\u{1d7e8}": "6", "\u{1d7e9}": "7",
  "\u{1d7ea}": "8", "\u{1d7eb}": "9", "\u{1d7ec}": "o", "\u{1d7ed}": "l",
  "\u{1d7ee}": "2", "\u{1d7ef}": "3", "\u{1d7f0}": "4", "\u{1d7f1}": "5",
  "\u{1d7f2}": "6", "\u{1d7f3}": "7", "\u{1d7f4}": "8", "\u{1d7f5}": "9",
  "\u{1d7f6}": "o", "\u{1d7f7}": "l", "\u{1d7f8}": "2", "\u{1d7f9}": "3",
  "\u{1d7fa}": "4", "\u{1d7fb}": "5", "\u{1d7fc}": "6", "\u{1d7fd}": "7",
  "\u{1d7fe}": "8", "\u{1d7ff}": "9",
  // Other (U+1E8C7) (1)
  "\u{1e8c7}": "l",
  // Other (U+1E8CB) (1)
  "\u{1e8cb}": "8",
  // Other (U+1EE00) (1)
  "\u{1ee00}": "l",
  // Other (U+1EE24) (1)
  "\u{1ee24}": "o",
  // Other (U+1EE64) (1)
  "\u{1ee64}": "o",
  // Other (U+1EE80) (1)
  "\u{1ee80}": "l",
  // Other (U+1EE84) (1)
  "\u{1ee84}": "o",
  // Other (U+1F74C) (1)
  "\u{1f74c}": "c",
  // Other (U+1F768) (1)
  "\u{1f768}": "t",
  // Other (U+1FBF0) (1)
  "\u{1fbf0}": "o",
  // Other (U+1FBF1) (1)
  "\u{1fbf1}": "l",
  // Other (U+1FBF2) (1)
  "\u{1fbf2}": "2",
  // Other (U+1FBF3) (1)
  "\u{1fbf3}": "3",
  // Other (U+1FBF4) (1)
  "\u{1fbf4}": "4",
  // Other (U+1FBF5) (1)
  "\u{1fbf5}": "5",
  // Other (U+1FBF6) (1)
  "\u{1fbf6}": "6",
  // Other (U+1FBF7) (1)
  "\u{1fbf7}": "7",
  // Other (U+1FBF8) (1)
  "\u{1fbf8}": "8",
  // Other (U+1FBF9) (1)
  "\u{1fbf9}": "9",
};

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
    if (cp === undefined) continue;
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
export const COMPOSABILITY_VECTOR_SUITE = "nfkc-tr39-divergence-v1";

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

  return async (value: string) => {
    // Check 1: Any confusable character present → reject
    if (confusableRegex && confusableRegex.test(value)) {
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

function normalizeScanOptions(options?: ScanOptions): NormalizedScanOptions {
  const threshold = clamp(options?.threshold ?? 0.7, 0, 1);
  const includeNovel = options?.includeNovel ?? true;
  const strategy = options?.strategy === "all" ? "all" as const : "mixed" as const;
  const scripts =
    options?.scripts && options.scripts.length > 0
      ? new Set(
          options.scripts
            .map((value) => value.trim().toLowerCase())
            .filter((value) => value.length > 0)
        )
      : null;
  const riskTerms =
    options?.riskTerms && options.riskTerms.length > 0
      ? options.riskTerms.map((value) => value.toLowerCase())
      : [...DEFAULT_SCAN_RISK_TERMS];

  const maxSizeRatio = options?.maxSizeRatio ?? 3.0;

  return { threshold, includeNovel, scripts, riskTerms, strategy, maxSizeRatio };
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

function applyLatinCase(source: string, latin: string): string {
  if (!/^[a-z]$/.test(latin)) return latin;
  const upper = source.toUpperCase();
  const lower = source.toLowerCase();
  if (source === upper && source !== lower) return latin.toUpperCase();
  return latin;
}

function pickConfusableEntry(
  ch: string,
  options: NormalizedScanOptions
): LlmConfusableMapEntry | null {
  const candidates = LLM_CONFUSABLE_MAP[ch];
  if (!candidates || candidates.length === 0) return null;

  for (const candidate of candidates) {
    if (candidate.ssimScore < options.threshold) continue;
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

function riskLevelFromFindings(
  findings: ScanFinding[],
  mixedWords: Set<string>,
  targetedWords: Set<string>,
  treatAllAsMixed = false
): "none" | "low" | "medium" | "high" {
  if (findings.length === 0) return "none";

  const mixedFindings = treatAllAsMixed
    ? findings
    : findings.filter((finding) => finding.mixedScript);
  if (mixedFindings.length === 0) return "low";

  if (
    mixedWords.size >= 3 ||
    mixedFindings.length >= 6 ||
    targetedWords.size >= 2 ||
    (targetedWords.size >= 1 && mixedFindings.length >= 3)
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

  const normalized = normalizeScanOptions(options);
  const replaceAll = normalized.strategy === "all";
  const out: string[] = [];

  forEachToken(
    text,
    (token) => {
      const { hasLatin } = hasMixedScriptsInToken(token);
      for (const item of token) {
        const entry = pickConfusableEntry(item.ch, normalized);
        if (entry && (replaceAll || hasLatin)) {
          out.push(applyLatinCase(item.ch, entry.latin));
        } else {
          out.push(item.ch);
        }
      }
    },
    (separator) => {
      out.push(separator);
    }
  );

  return out.join("");
}

/**
 * Scan text for confusable characters and return structured findings + risk summary.
 */
export function scan(text: string, options?: ScanOptions): ScanResult {
  const normalized = normalizeScanOptions(options);
  if (text.length === 0) {
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

  const findings: ScanFinding[] = [];
  const distinctChars = new Set<string>();
  const wordsAffected = new Set<string>();
  const scriptsDetected = new Set<string>();
  const mixedWords = new Set<string>();
  const targetedWords = new Set<string>();

  const treatAllAsMixed = normalized.strategy === "all";

  forEachToken(text, (token) => {
    if (token.length === 0) return;

    const word = token.map((item) => item.ch).join("");
    const lowerWord = word.toLowerCase();
    const { mixedScript } = hasMixedScriptsInToken(token);
    const effectiveMixed = mixedScript || treatAllAsMixed;
    const selected = new Map<number, LlmConfusableMapEntry>();

    for (const item of token) {
      const entry = pickConfusableEntry(item.ch, normalized);
      if (!entry) continue;
      selected.set(item.index, entry);
      findings.push({
        char: item.ch,
        codepoint: entry.codepoint || formatCodePoint(item.ch),
        script: entry.script,
        latinEquivalent: entry.latin,
        ssimScore: entry.ssimScore,
        source: entry.source,
        index: item.index,
        word,
        mixedScript,
      });
      distinctChars.add(item.ch);
      wordsAffected.add(lowerWord);
      scriptsDetected.add(entry.script);
      if (effectiveMixed) mixedWords.add(lowerWord);
    }

    if (effectiveMixed && selected.size > 0) {
      const canonicalWord = token
        .map((item) => {
          const entry = selected.get(item.index);
          return entry ? applyLatinCase(item.ch, entry.latin) : item.ch;
        })
        .join("")
        .toLowerCase();
      if (normalized.riskTerms.some((term) => canonicalWord.includes(term))) {
        targetedWords.add(lowerWord);
      }
    }
  });

  const riskLevel = riskLevelFromFindings(findings, mixedWords, targetedWords, treatAllAsMixed);
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
 * Fast gate for LLM pipelines.
 *
 * With the default `strategy: "mixed"`, returns `false` as soon as a
 * mixed-script confusable substitution is found.  Standalone non-Latin
 * words do not fail this gate.
 *
 * With `strategy: "all"`, returns `false` if any confusable character is
 * found, regardless of surrounding context.
 */
export function isClean(text: string, options?: ScanOptions): boolean {
  if (text.length === 0) return true;
  const normalized = normalizeScanOptions(options);
  const checkAll = normalized.strategy === "all";

  let clean = true;
  forEachToken(text, (token) => {
    if (!checkAll) {
      const { mixedScript } = hasMixedScriptsInToken(token);
      if (!mixedScript) return;
    }
    for (const item of token) {
      if (pickConfusableEntry(item.ch, normalized)) {
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
  const nfkc = ch.normalize("NFKC").toLowerCase();
  return /^[a-z0-9]$/.test(nfkc) && nfkc !== mapped;
}

function lookupWeight(
  from: string,
  to: string,
  weights: ConfusableWeights | undefined,
  context: "identifier" | "domain" | "all"
): ConfusableWeight | undefined {
  if (!weights) return undefined;
  const w = weights[from]?.[to] ?? weights[to]?.[from];
  if (!w) return undefined;
  // Context filtering: skip weights that don't match the deployment context
  if (context === "identifier" && !w.xidContinue) return undefined;
  if (context === "domain" && !w.idnaPvalid) return undefined;
  return w;
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
  if (from === to) {
    return { op: "match", from, to, fromIndex, toIndex, cost: 0 };
  }

  const weight = lookupWeight(from, to, weights, context ?? "all");
  const fromPrototype = map[from] ?? from;
  const toPrototype = map[to] ?? to;

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
  // Step 1: NFD normalize
  let s = input.normalize("NFD");
  // Step 2: Remove Default_Ignorable_Code_Point characters
  s = s.replace(DEFAULT_IGNORABLE_RE, "");
  // Step 3: Replace each character via confusable map (for...of iterates by code point)
  let result = "";
  for (const ch of s) {
    result += map[ch] ?? ch;
  }
  // Step 4: Reapply NFD
  result = result.normalize("NFD");
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
  const left = toCodePoints(a.normalize("NFD").toLowerCase());
  const right = toCodePoints(b.normalize("NFD").toLowerCase());
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
      const candidates = [
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
 * Check whether two strings are visually confusable by comparing their TR39 skeletons.
 *
 * @param a - First string
 * @param b - Second string
 * @param options - Optional settings (custom confusable map)
 * @returns `true` if the strings produce the same skeleton
 *
 * @example
 * ```ts
 * areConfusable("paypal", "\u0440\u0430ypal") // true
 * areConfusable("google", "g\u043e\u043egle") // true
 * areConfusable("hello", "world")             // false
 * ```
 */
export function areConfusable(
  a: string,
  b: string,
  options?: SkeletonOptions
): boolean {
  return skeleton(a, options) === skeleton(b, options);
}

function countConfusableChars(value: string, map: Record<string, string>): {
  confusableCount: number;
  divergenceCount: number;
} {
  let confusableCount = 0;
  let divergenceCount = 0;

  for (const ch of value) {
    const mapped = map[ch];
    if (!mapped) continue;
    confusableCount++;
    if (isNfkcDivergentMapping(ch, mapped)) divergenceCount++;
  }

  return { confusableCount, divergenceCount };
}

function scoreDistanceRisk(result: ConfusableDistanceResult): number {
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
  if (result.chainDepth >= 2) {
    score += Math.min(10, (result.chainDepth - 1) * 3);
  }

  return clamp(score, 0, 100);
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

  const mergedConfig: NamespaceConfig = {
    ...config,
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
  const reservedMap = buildReservedMap(config.reserved);

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
   */
  function checkRisk(identifier: string, options?: CheckRiskOptions): RiskCheckResult {
    const normalized = normalize(identifier, normalizeOpts);
    const map = options?.map ?? CONFUSABLE_MAP_FULL;
    const includeReserved =
      options?.includeReserved ?? config.risk?.includeReserved ?? true;
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

    if (hasMixedScripts(normalized)) {
      addReason("mixed-script", "Identifier mixes Latin and non-Latin scripts.", 24);
    }

    const ignorableCount = countDefaultIgnorables(normalized);
    if (ignorableCount > 0) {
      addReason(
        "invisible-character",
        `Identifier contains ${ignorableCount} default-ignorable Unicode character(s).`,
        Math.min(22, 10 + ignorableCount * 4)
      );
    }

    const charStats = countConfusableChars(normalized, map);
    if (charStats.confusableCount > 0) {
      addReason(
        "confusable-character",
        `Identifier contains ${charStats.confusableCount} confusable character(s).`,
        Math.min(24, 8 + charStats.confusableCount * 3)
      );
    }

    if (charStats.divergenceCount > 0) {
      addReason(
        "divergent-mapping",
        `Identifier includes ${charStats.divergenceCount} mapping(s) where NFKC and TR39 differ.`,
        Math.min(16, 6 + charStats.divergenceCount * 3)
      );
    }

    const configuredProtect = config.risk?.protect ?? [];
    const explicitProtect = options?.protect;
    const protectInputs = explicitProtect ?? configuredProtect;
    const normalizedProtect = uniqueNonEmptyStrings(
      protectInputs.map((target) => normalize(target, normalizeOpts))
    );

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

    const scoredMatches: Array<{ match: RiskMatch; detail?: ConfusableDistanceResult }> = [];

    for (const target of protectedTargets) {
      if (target === normalized) {
        scoredMatches.push({
          match: {
            target,
            score: 100,
            distance: 0,
            chainDepth: 0,
            skeletonEqual: true,
            reasons: ["Exact protected target match"],
          },
        });
        continue;
      }

      const distance = confusableDistance(normalized, target, { map });
      const score = scoreDistanceRisk(distance);
      if (score < 35) continue;

      const matchReasons: string[] = [];
      if (distance.skeletonEqual) matchReasons.push("TR39 skeleton collision");
      if (distance.crossScriptCount > 0) {
        matchReasons.push(`${distance.crossScriptCount} cross-script substitution(s)`);
      }
      if (distance.ignorableCount > 0) {
        matchReasons.push(`${distance.ignorableCount} default-ignorable edit(s)`);
      }
      if (distance.divergenceCount > 0) {
        matchReasons.push(`${distance.divergenceCount} NFKC/TR39 divergent mapping(s)`);
      }
      if (distance.chainDepth >= 2) {
        matchReasons.push(`chain depth ${distance.chainDepth}`);
      }

      scoredMatches.push({
        match: {
          target,
          score,
          distance: distance.distance,
          chainDepth: distance.chainDepth,
          skeletonEqual: distance.skeletonEqual,
          reasons: matchReasons,
        },
        detail: distance,
      });
    }

    scoredMatches.sort((a, b) => {
      if (b.match.score !== a.match.score) return b.match.score - a.match.score;
      if (a.match.distance !== b.match.distance) return a.match.distance - b.match.distance;
      return a.match.target.localeCompare(b.match.target);
    });

    const selectedMatches = scoredMatches.slice(0, maxMatches);
    const matches = selectedMatches.map((m) => m.match);

    let score = clamp(heuristicScore, 0, 100);
    if (selectedMatches.length > 0) {
      const top = selectedMatches[0];
      score = Math.max(score, top.match.score);
      addReason(
        "confusable-target",
        `Identifier is visually close to protected target "${top.match.target}".`,
        top.match.score
      );

      if (top.detail?.skeletonEqual) {
        addReason(
          "skeleton-collision",
          `Identifier skeleton collides with "${top.match.target}".`,
          20
        );
      }
      if ((top.detail?.chainDepth ?? 0) >= 2) {
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
    reasons.sort((a, b) => b.weight - a.weight);

    return {
      identifier,
      normalized,
      score,
      level: levelForScore(score, warnThreshold, blockThreshold),
      action: actionForScore(score, warnThreshold, blockThreshold),
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
   * Race-safe claim helper.
   *
   * Runs claimability checks, then executes your write callback with the
   * normalized identifier. If a unique-constraint race occurs, returns an
   * unavailable result instead of throwing.
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
