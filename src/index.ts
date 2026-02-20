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
    /** Generate candidate slugs (default: appends -1 through -9) */
    generate?: (identifier: string) => string[];
    /** Max suggestions to return (default: 3) */
    max?: number;
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
  for (let len = 100; len >= 1; len--) {
    for (const chars of testStrings) {
      // Build a string of the target length by repeating the test chars
      const s = chars.repeat(Math.ceil(len / chars.length)).slice(0, len);
      if (pattern.test(s)) return len;
    }
  }
  return 30;
}

/**
 * Create a default suggestion generator that's aware of the max identifier length.
 * Generates interleaved hyphenated and compact variants, plus truncated variants
 * for identifiers near the max length.
 */
function createDefaultSuggest(pattern: RegExp): (identifier: string) => string[] {
  const maxLen = extractMaxLength(pattern);

  return (identifier: string): string[] => {
    const candidates: string[] = [];

    for (let i = 1; i <= 9; i++) {
      const hyphenated = `${identifier}-${i}`;
      if (hyphenated.length <= maxLen) candidates.push(hyphenated);

      const compact = `${identifier}${i}`;
      if (compact.length <= maxLen) candidates.push(compact);
    }

    // Truncated variants for identifiers near max length
    if (identifier.length >= maxLen - 1) {
      for (let i = 1; i <= 9; i++) {
        const suffix = String(i);
        const truncated = identifier.slice(0, maxLen - suffix.length) + suffix;
        if (truncated !== identifier && !candidates.includes(truncated)) {
          candidates.push(truncated);
        }
      }
    }

    return candidates;
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

  return async (value: string) => {
    const normalized = value.toLowerCase();

    if (wordSet.has(normalized)) {
      return { available: false, message };
    }

    if (checkSubstrings) {
      for (const word of wordSet) {
        if (normalized.includes(word)) {
          return { available: false, message };
        }
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

      // Generate suggestions if configured and not skipped
      if (config.suggest && !options?.skipSuggestions) {
        const generate = config.suggest.generate ?? createDefaultSuggest(pattern);
        const max = config.suggest.max ?? 3;
        const candidates = generate(normalized);
        const suggestions: string[] = [];

        for (const candidate of candidates) {
          if (suggestions.length >= max) break;
          // Skip candidates that don't match the format pattern
          if (!pattern.test(candidate)) continue;
          const candidateResult = await check(candidate, scope, { skipSuggestions: true });
          if (candidateResult.available) {
            suggestions.push(candidate);
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
