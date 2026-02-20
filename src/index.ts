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
  /** Custom error messages */
  messages?: {
    invalid?: string;
    reserved?: string | Record<string, string>;
    taken?: (sourceName: string) => string;
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
      if (chars[i] !== chars[i + 1]) {
        const swapped = [...chars];
        [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
        const candidate = swapped.join("");
        if (candidate !== identifier && !seen.has(candidate)) {
          seen.add(candidate);
          candidates.push(candidate);
        }
      }
    }
    return candidates;
  };
}

/**
 * Create a strategy that generates cognitively similar names using
 * edit-distance-1 mutations: single-char deletions, keyboard-adjacent
 * substitutions, and common prefix/suffix additions.
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
 * Normalize a raw identifier: trims whitespace, lowercases, and strips leading `@` symbols.
 *
 * @param raw - The raw user input
 * @returns The normalized identifier
 *
 * @example
 * ```ts
 * normalize("  @Sarah  "); // "sarah"
 * normalize("ACME-Corp");  // "acme-corp"
 * ```
 */
export function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, "");
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

  // In-memory cache for adapter lookups
  const cacheEnabled = !!config.cache;
  const cacheTtl = config.cache?.ttl ?? 5000;
  const cacheMaxSize = 1000;
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
    const normalized = normalize(identifier);

    if (!pattern.test(normalized)) {
      return invalidMsg;
    }

    if (reservedMap.has(normalized)) {
      return getReservedMessage(reservedMap.get(normalized)!);
    }

    return null;
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

      if (source.scopeKey) {
        const scopeValue = scope[source.scopeKey];
        const idColumn = source.idColumn ?? "id";
        const existingId = existing[idColumn];
        if (scopeValue && existingId && scopeValue === String(existingId)) {
          return null;
        }
      }

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
    const normalized = normalize(identifier);

    // Format validation
    if (!pattern.test(normalized)) {
      return { available: false, reason: "invalid", message: invalidMsg };
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

      // Check if caller owns this record
      if (source.scopeKey) {
        const scopeValue = scope[source.scopeKey];
        const idColumn = source.idColumn ?? "id";
        const existingId = existing[idColumn];

        if (scopeValue && existingId && scopeValue === String(existingId)) {
          return null; // Caller owns this, not a collision
        }
      }

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

        // Phase 1: Cheap sync filter — format + reserved
        const passedSync = candidates.filter(
          (c) => pattern.test(c) && !reservedMap.has(c)
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
