export type NamespaceSource = {
  /** Table/model name */
  name: string;
  /** Column that holds the slug/handle */
  column: string;
  /** Column name for the primary key (default: "id") */
  idColumn?: string;
  /** Optional scope key for ownership checks (e.g., "userId", "orgId") */
  scopeKey?: string;
};

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

export type FindOneOptions = {
  /** Use case-insensitive matching */
  caseInsensitive?: boolean;
};

export type NamespaceAdapter = {
  findOne: (
    source: NamespaceSource,
    value: string,
    options?: FindOneOptions
  ) => Promise<Record<string, unknown> | null>;
};

export type OwnershipScope = Record<string, string | null | undefined>;

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

function defaultSuggest(identifier: string): string[] {
  return Array.from({ length: 9 }, (_, i) => `${identifier}-${i + 1}`);
}

/**
 * Normalize an identifier (trim, lowercase, strip leading @)
 */
export function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, "");
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
 * Create a namespace guard instance
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
  const cacheMap = new Map<string, { value: Record<string, unknown> | null; expires: number }>();

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
      return Promise.resolve(cached.value);
    }

    return adapter.findOne(source, value, options).then((result) => {
      cacheMap.set(key, { value: result, expires: now + cacheTtl });
      return result;
    });
  }

  function getReservedMessage(category: string): string {
    const rm = configMessages.reserved;
    if (typeof rm === "string") return rm;
    if (rm && typeof rm === "object") return rm[category] ?? defaultReservedMsg;
    return defaultReservedMsg;
  }

  /**
   * Validate format only (no DB check)
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
   * Check if an identifier is available
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
      const rejection = await validator(normalized);
      if (rejection) {
        return { available: false, reason: "invalid", message: rejection.message };
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
        const generate = config.suggest.generate ?? defaultSuggest;
        const max = config.suggest.max ?? 3;
        const candidates = generate(normalized);
        const suggestions: string[] = [];

        for (const candidate of candidates) {
          if (suggestions.length >= max) break;
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
   * Assert an identifier is available, throw if not
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
   * Check multiple identifiers in one call
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
   * Clear the in-memory cache (no-op if caching is not enabled)
   */
  function clearCache(): void {
    cacheMap.clear();
  }

  return {
    normalize,
    validateFormat,
    check,
    assertAvailable,
    checkMany,
    clearCache,
  };
}

export type NamespaceGuard = ReturnType<typeof createNamespaceGuard>;
