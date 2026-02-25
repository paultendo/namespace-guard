import { describe, it, expect, vi } from "vitest";
import {
  normalize,
  createNamespaceGuard,
  createNamespaceGuardWithProfile,
  createPredicateValidator,
  createProfanityValidator,
  createHomoglyphValidator,
  createInvisibleCharacterValidator,
  skeleton,
  areConfusable,
  confusableDistance,
  deriveNfkcTr39DivergenceVectors,
  isLikelyUniqueViolationError,
  NAMESPACE_PROFILES,
  DEFAULT_PROTECTED_TOKENS,
  NFKC_TR39_DIVERGENCE_VECTORS,
  COMPOSABILITY_VECTOR_SUITE,
  COMPOSABILITY_VECTORS,
  COMPOSABILITY_VECTORS_COUNT,
  CONFUSABLE_MAP,
  CONFUSABLE_MAP_FULL,
  type NamespaceAdapter,
  type NamespaceSource,
} from "../src/index";

// ---------------------------------------------------------------------------
// normalize()
// ---------------------------------------------------------------------------
describe("normalize", () => {
  it("trims whitespace", () => {
    expect(normalize("  hello  ")).toBe("hello");
  });

  it("lowercases input", () => {
    expect(normalize("HELLO")).toBe("hello");
    expect(normalize("HeLLo-World")).toBe("hello-world");
  });

  it("strips leading @ symbols", () => {
    expect(normalize("@sarah")).toBe("sarah");
    expect(normalize("@@sarah")).toBe("sarah");
  });

  it("handles all transformations together", () => {
    expect(normalize("  @Sarah  ")).toBe("sarah");
    expect(normalize(" @@ACME-Corp ")).toBe("acme-corp");
  });

  it("returns empty string for empty input", () => {
    expect(normalize("")).toBe("");
    expect(normalize("   ")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createMockAdapter(
  records: Record<string, Record<string, Record<string, unknown>>>
): NamespaceAdapter {
  return {
    findOne: vi.fn(async (source: NamespaceSource, value: string) => {
      const table = records[source.name];
      if (!table) return null;
      return table[value] ?? null;
    }),
  };
}

const defaultSources: NamespaceSource[] = [
  { name: "user", column: "handle", scopeKey: "id" },
  { name: "organization", column: "slug", scopeKey: "id" },
];

// ---------------------------------------------------------------------------
// Format validation
// ---------------------------------------------------------------------------
describe("format validation", () => {
  const guard = createNamespaceGuard(
    { sources: defaultSources },
    createMockAdapter({})
  );

  it("accepts valid slugs", () => {
    expect(guard.validateFormat("sarah")).toBeNull();
    expect(guard.validateFormat("acme-corp")).toBeNull();
    expect(guard.validateFormat("a1")).toBeNull();
    expect(guard.validateFormat("ab")).toBeNull();
    expect(guard.validateFormat("a".repeat(30))).toBeNull();
  });

  it("rejects slugs that are too short", () => {
    expect(guard.validateFormat("a")).not.toBeNull();
  });

  it("rejects slugs that are too long", () => {
    expect(guard.validateFormat("a".repeat(31))).not.toBeNull();
  });

  it("rejects slugs starting with a hyphen", () => {
    expect(guard.validateFormat("-sarah")).not.toBeNull();
  });

  it("normalizes uppercase before validating (so uppercase passes)", () => {
    // "Sarah" normalizes to "sarah" which is valid
    expect(guard.validateFormat("Sarah")).toBeNull();
  });

  it("rejects special characters", () => {
    expect(guard.validateFormat("sarah!")).not.toBeNull();
    expect(guard.validateFormat("sarah.bob")).not.toBeNull();
    expect(guard.validateFormat("sarah_bob")).not.toBeNull();
    expect(guard.validateFormat("sarah bob")).not.toBeNull();
  });

  it("normalizes before validating", () => {
    // " @Sarah " normalizes to "sarah" which is valid
    expect(guard.validateFormat(" @Sarah ")).toBeNull();
  });

  it("respects custom patterns", () => {
    const customGuard = createNamespaceGuard(
      { sources: defaultSources, pattern: /^[a-z]{3,10}$/ },
      createMockAdapter({})
    );
    expect(customGuard.validateFormat("abc")).toBeNull();
    expect(customGuard.validateFormat("ab")).not.toBeNull(); // too short
    expect(customGuard.validateFormat("abc-def")).not.toBeNull(); // hyphen not allowed
  });
});

// ---------------------------------------------------------------------------
// validateFormatOnly
// ---------------------------------------------------------------------------
describe("validateFormatOnly", () => {
  it("accepts valid slugs", () => {
    const guard = createNamespaceGuard(
      { reserved: ["admin"], sources: defaultSources },
      createMockAdapter({})
    );
    expect(guard.validateFormatOnly("sarah")).toBeNull();
    expect(guard.validateFormatOnly("acme-corp")).toBeNull();
  });

  it("rejects invalid format", () => {
    const guard = createNamespaceGuard(
      { reserved: ["admin"], sources: defaultSources },
      createMockAdapter({})
    );
    expect(guard.validateFormatOnly("a")).not.toBeNull();
    expect(guard.validateFormatOnly("-bad")).not.toBeNull();
  });

  it("does NOT check reserved names", () => {
    const guard = createNamespaceGuard(
      { reserved: ["admin", "settings"], sources: defaultSources },
      createMockAdapter({})
    );
    // validateFormat rejects reserved names
    expect(guard.validateFormat("admin")).not.toBeNull();
    // validateFormatOnly does not
    expect(guard.validateFormatOnly("admin")).toBeNull();
    expect(guard.validateFormatOnly("settings")).toBeNull();
  });

  it("rejects purely numeric when configured", () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources, allowPurelyNumeric: false },
      createMockAdapter({})
    );
    expect(guard.validateFormatOnly("12345")).not.toBeNull();
  });

  it("normalizes full-width input before format check", () => {
    const guard = createNamespaceGuard(
      { reserved: ["admin"], sources: defaultSources },
      createMockAdapter({})
    );
    // Full-width "hello" - NFKC normalizes to ASCII, format passes
    expect(guard.validateFormatOnly("\uff48\uff45\uff4c\uff4c\uff4f")).toBeNull();
  });

  it("strips leading @ before format check", () => {
    const guard = createNamespaceGuard(
      { reserved: ["admin"], sources: defaultSources },
      createMockAdapter({})
    );
    expect(guard.validateFormatOnly("@sarah")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Reserved name blocking
// ---------------------------------------------------------------------------
describe("reserved names", () => {
  it("blocks reserved names (array)", async () => {
    const guard = createNamespaceGuard(
      { reserved: ["admin", "api", "settings"], sources: defaultSources },
      createMockAdapter({})
    );

    const result = await guard.check("admin");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("reserved");
    }
  });

  it("blocks reserved names (Set)", async () => {
    const guard = createNamespaceGuard(
      { reserved: new Set(["admin", "api"]), sources: defaultSources },
      createMockAdapter({})
    );

    const result = await guard.check("api");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("reserved");
    }
  });

  it("normalizes before checking reserved names", async () => {
    const guard = createNamespaceGuard(
      { reserved: ["admin"], sources: defaultSources },
      createMockAdapter({})
    );

    const result = await guard.check("  @ADMIN  ");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("reserved");
    }
  });

  it("allows non-reserved names", async () => {
    const guard = createNamespaceGuard(
      { reserved: ["admin"], sources: defaultSources },
      createMockAdapter({})
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(true);
  });

  it("validates format before checking reserved names", async () => {
    const guard = createNamespaceGuard(
      { reserved: ["a"], sources: defaultSources },
      createMockAdapter({})
    );

    // "a" is too short for the default pattern, so format check fires first
    const result = await guard.check("a");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("invalid");
    }
  });
});

// ---------------------------------------------------------------------------
// Multi-source collision detection
// ---------------------------------------------------------------------------
describe("collision detection", () => {
  it("detects collision in first source", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("taken");
      expect(result.source).toBe("user");
    }
  });

  it("detects collision in second source", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({
        organization: { "acme-corp": { id: "o1" } },
      })
    );

    const result = await guard.check("acme-corp");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("taken");
      expect(result.source).toBe("organization");
    }
  });

  it("returns available when no collisions", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({
        user: { bob: { id: "u2" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(true);
  });

  it("checks all sources in parallel", async () => {
    const adapter = createMockAdapter({});
    const guard = createNamespaceGuard({ sources: defaultSources }, adapter);

    await guard.check("test-slug");

    expect(adapter.findOne).toHaveBeenCalledTimes(2);
    expect(adapter.findOne).toHaveBeenCalledWith(
      defaultSources[0],
      "test-slug",
      undefined
    );
    expect(adapter.findOne).toHaveBeenCalledWith(
      defaultSources[1],
      "test-slug",
      undefined
    );
  });
});

// ---------------------------------------------------------------------------
// Ownership scoping
// ---------------------------------------------------------------------------
describe("ownership scoping", () => {
  it("allows updating own record", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    // User u1 owns "sarah", so they should be able to keep it
    const result = await guard.check("sarah", { id: "u1" });
    expect(result.available).toBe(true);
  });

  it("blocks when scope does not match", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    // User u2 does NOT own "sarah"
    const result = await guard.check("sarah", { id: "u2" });
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("taken");
    }
  });

  it("blocks when no scope is provided", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
  });

  it("handles custom idColumn", async () => {
    const sources: NamespaceSource[] = [
      { name: "user", column: "handle", idColumn: "userId", scopeKey: "userId" },
    ];

    const guard = createNamespaceGuard(
      { sources },
      createMockAdapter({
        user: { sarah: { userId: "u1" } },
      })
    );

    const result = await guard.check("sarah", { userId: "u1" });
    expect(result.available).toBe(true);
  });

  it("handles numeric IDs via string coercion", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({
        user: { sarah: { id: 42 } },
      })
    );

    // Pass "42" as string - should match the numeric 42 via String()
    const result = await guard.check("sarah", { id: "42" });
    expect(result.available).toBe(true);
  });

  it("skips ownership check when scope value is null", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah", { id: null });
    expect(result.available).toBe(false);
  });

  it("handles multiple scope keys across sources", async () => {
    const sources: NamespaceSource[] = [
      { name: "user", column: "handle", scopeKey: "userId" },
      { name: "organization", column: "slug", scopeKey: "orgId" },
    ];

    const guard = createNamespaceGuard(
      { sources },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
        organization: { sarah: { id: "o1" } },
      })
    );

    // User owns user record but not org record
    const result = await guard.check("sarah", { userId: "u1" });
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.source).toBe("organization");
    }
  });
});

// ---------------------------------------------------------------------------
// Custom messages
// ---------------------------------------------------------------------------
describe("custom messages", () => {
  it("uses custom invalid message", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        messages: { invalid: "Custom invalid" },
      },
      createMockAdapter({})
    );

    const result = await guard.check("!!!");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.message).toBe("Custom invalid");
    }
  });

  it("uses custom reserved message", async () => {
    const guard = createNamespaceGuard(
      {
        reserved: ["admin"],
        sources: defaultSources,
        messages: { reserved: "Custom reserved" },
      },
      createMockAdapter({})
    );

    const result = await guard.check("admin");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.message).toBe("Custom reserved");
    }
  });

  it("uses custom taken message with source name", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        messages: { taken: (source) => `Taken by ${source}` },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.message).toBe("Taken by user");
    }
  });
});

// ---------------------------------------------------------------------------
// assertAvailable
// ---------------------------------------------------------------------------
describe("assertAvailable", () => {
  it("does not throw when available", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({})
    );

    await expect(guard.assertAvailable("sarah")).resolves.toBeUndefined();
  });

  it("throws when not available", async () => {
    const guard = createNamespaceGuard(
      { reserved: ["admin"], sources: defaultSources },
      createMockAdapter({})
    );

    await expect(guard.assertAvailable("admin")).rejects.toThrow(
      "That name is reserved"
    );
  });

  it("throws with taken message", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    await expect(guard.assertAvailable("sarah")).rejects.toThrow(
      "already in use"
    );
  });

  it("passes scope through", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    // Should not throw because u1 owns "sarah"
    await expect(
      guard.assertAvailable("sarah", { id: "u1" })
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// assertClaimable
// ---------------------------------------------------------------------------
describe("assertClaimable", () => {
  it("passes for available identifiers", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({})
    );

    await expect(guard.assertClaimable("sarah-team")).resolves.toBeUndefined();
  });

  it("throws on format/reserved/taken errors from availability checks", async () => {
    const guard = createNamespaceGuard(
      {
        reserved: ["admin"],
        sources: defaultSources,
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    await expect(guard.assertClaimable("admin")).rejects.toThrow("reserved");
    await expect(guard.assertClaimable("sarah")).rejects.toThrow("already in use");
  });

  it("blocks confusable variants of default protected tokens", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        pattern: /^[\p{L}\p{N}][\p{L}\p{N}-]{1,29}$/u,
      },
      createMockAdapter({})
    );

    // admіn (Cyrillic і) should be blocked via default protected token "admin"
    await expect(guard.assertClaimable("adm\u0456n")).rejects.toThrow(
      "too confusable"
    );
  });

  it("supports failOn=warn policy when enforcing claimability", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({})
    );

    // This is typically warn-level against paypal under these thresholds
    await expect(
      guard.assertClaimable("paypa1", {}, {
        protect: ["paypal"],
        warnThreshold: 70,
        blockThreshold: 95,
      })
    ).resolves.toBeUndefined();

    await expect(
      guard.assertClaimable("paypa1", {}, {
        protect: ["paypal"],
        warnThreshold: 70,
        blockThreshold: 95,
        failOn: "warn",
      })
    ).rejects.toThrow("potentially confusable");
  });

  it("uses configured risk protect targets when provided", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        pattern: /^[\p{L}\p{N}][\p{L}\p{N}-]{1,29}$/u,
        risk: { includeReserved: false, protect: ["paypal"] },
      },
      createMockAdapter({})
    );

    await expect(guard.assertClaimable("\u0440\u0430ypal")).rejects.toThrow(
      "too confusable"
    );
  });

  it("ships default protected token set with high-value entries", () => {
    expect(DEFAULT_PROTECTED_TOKENS).toContain("admin");
    expect(DEFAULT_PROTECTED_TOKENS).toContain("support");
  });
});

// ---------------------------------------------------------------------------
// claim
// ---------------------------------------------------------------------------
describe("claim", () => {
  it("claims successfully and passes normalized identifier to write callback", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({})
    );

    const result = await guard.claim("  @Sarah  ", async (normalized) => {
      expect(normalized).toBe("sarah");
      return { id: "u1", handleCanonical: normalized };
    });

    expect(result.claimed).toBe(true);
    if (result.claimed) {
      expect(result.normalized).toBe("sarah");
      expect(result.value.id).toBe("u1");
    }
  });

  it("returns unavailable when pre-check fails", async () => {
    const guard = createNamespaceGuard(
      {
        reserved: ["admin"],
        sources: defaultSources,
      },
      createMockAdapter({})
    );

    const write = vi.fn(async () => ({ id: "x" }));
    const result = await guard.claim("admin", write);

    expect(result.claimed).toBe(false);
    expect(write).not.toHaveBeenCalled();
    if (!result.claimed) {
      expect(result.reason).toBe("unavailable");
      expect(result.message).toContain("reserved");
    }
  });

  it("maps duplicate-key races to unavailable result", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({})
    );

    const result = await guard.claim("sarah", async () => {
      const err = new Error("duplicate key value violates unique constraint");
      (err as Error & { code: string }).code = "23505";
      throw err;
    });

    expect(result.claimed).toBe(false);
    if (!result.claimed) {
      expect(result.reason).toBe("unavailable");
      expect(result.message).toContain("already in use");
    }
  });

  it("supports custom duplicate detector", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({})
    );

    const result = await guard.claim(
      "sarah",
      async () => {
        throw new Error("something custom");
      },
      {
        isUniqueViolation: (error) =>
          error instanceof Error && error.message.includes("custom"),
      }
    );

    expect(result.claimed).toBe(false);
    if (!result.claimed) {
      expect(result.message).toContain("already in use");
    }
  });

  it("rethrows non-duplicate write errors", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({})
    );

    await expect(
      guard.claim("sarah", async () => {
        throw new Error("network down");
      })
    ).rejects.toThrow("network down");
  });
});

// ---------------------------------------------------------------------------
// unique violation detector
// ---------------------------------------------------------------------------
describe("isLikelyUniqueViolationError", () => {
  it("detects common driver/ORM duplicate signatures", () => {
    const pg = { code: "23505", message: "duplicate key value violates unique constraint" };
    const prisma = { code: "P2002", message: "Unique constraint failed on the fields" };
    const mysql = { code: "ER_DUP_ENTRY", errno: 1062, message: "Duplicate entry" };
    const sqlite = { code: "SQLITE_CONSTRAINT_UNIQUE", message: "UNIQUE constraint failed" };
    const mongo = { code: 11000, message: "E11000 duplicate key error" };

    expect(isLikelyUniqueViolationError(pg)).toBe(true);
    expect(isLikelyUniqueViolationError(prisma)).toBe(true);
    expect(isLikelyUniqueViolationError(mysql)).toBe(true);
    expect(isLikelyUniqueViolationError(sqlite)).toBe(true);
    expect(isLikelyUniqueViolationError(mongo)).toBe(true);
  });

  it("walks nested error containers", () => {
    const nested = {
      original: {
        parent: {
          cause: {
            code: "23505",
          },
        },
      },
    };
    expect(isLikelyUniqueViolationError(nested)).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isLikelyUniqueViolationError(new Error("timeout"))).toBe(false);
    expect(isLikelyUniqueViolationError({ code: "ECONNRESET" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Reserved name categories
// ---------------------------------------------------------------------------
describe("reserved name categories", () => {
  it("works with flat array (backwards compat)", async () => {
    const guard = createNamespaceGuard(
      { reserved: ["admin"], sources: defaultSources },
      createMockAdapter({})
    );

    const result = await guard.check("admin");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("reserved");
      expect(result.category).toBe("default");
    }
  });

  it("works with Set (backwards compat)", async () => {
    const guard = createNamespaceGuard(
      { reserved: new Set(["admin"]), sources: defaultSources },
      createMockAdapter({})
    );

    const result = await guard.check("admin");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("reserved");
      expect(result.category).toBe("default");
    }
  });

  it("blocks names from categorized record", async () => {
    const guard = createNamespaceGuard(
      {
        reserved: {
          system: ["admin", "api"],
          brand: ["oncor"],
        },
        sources: defaultSources,
      },
      createMockAdapter({})
    );

    const r1 = await guard.check("admin");
    expect(r1.available).toBe(false);
    if (!r1.available) {
      expect(r1.reason).toBe("reserved");
      expect(r1.category).toBe("system");
    }

    const r2 = await guard.check("oncor");
    expect(r2.available).toBe(false);
    if (!r2.available) {
      expect(r2.reason).toBe("reserved");
      expect(r2.category).toBe("brand");
    }
  });

  it("returns per-category messages", async () => {
    const guard = createNamespaceGuard(
      {
        reserved: {
          system: ["admin"],
          brand: ["oncor"],
        },
        sources: defaultSources,
        messages: {
          reserved: {
            system: "That's a system route.",
            brand: "That's a protected brand.",
          },
        },
      },
      createMockAdapter({})
    );

    const r1 = await guard.check("admin");
    if (!r1.available) expect(r1.message).toBe("That's a system route.");

    const r2 = await guard.check("oncor");
    if (!r2.available) expect(r2.message).toBe("That's a protected brand.");
  });

  it("falls back to default message for unknown category", async () => {
    const guard = createNamespaceGuard(
      {
        reserved: {
          system: ["admin"],
          misc: ["foo-bar"],
        },
        sources: defaultSources,
        messages: {
          reserved: {
            system: "System route.",
          },
        },
      },
      createMockAdapter({})
    );

    // "misc" has no custom message, falls back to default
    const result = await guard.check("foo-bar");
    if (!result.available) {
      expect(result.message).toBe("That name is reserved. Try another one.");
    }
  });

  it("uses string message for all categories", async () => {
    const guard = createNamespaceGuard(
      {
        reserved: {
          system: ["admin"],
          brand: ["oncor"],
        },
        sources: defaultSources,
        messages: { reserved: "Nope, can't use that." },
      },
      createMockAdapter({})
    );

    const r1 = await guard.check("admin");
    if (!r1.available) expect(r1.message).toBe("Nope, can't use that.");

    const r2 = await guard.check("oncor");
    if (!r2.available) expect(r2.message).toBe("Nope, can't use that.");
  });

  it("validateFormat works with categories", () => {
    const guard = createNamespaceGuard(
      {
        reserved: { system: ["admin"] },
        sources: defaultSources,
        messages: { reserved: { system: "System route." } },
      },
      createMockAdapter({})
    );

    expect(guard.validateFormat("admin")).toBe("System route.");
    expect(guard.validateFormat("sarah")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Async validators
// ---------------------------------------------------------------------------
describe("validators", () => {
  it("passes when validator returns null", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        validators: [async () => null],
      },
      createMockAdapter({})
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(true);
  });

  it("rejects when validator returns failure", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        validators: [
          async () => ({ available: false as const, message: "Profanity detected" }),
        ],
      },
      createMockAdapter({})
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("invalid");
      expect(result.message).toBe("Profanity detected");
    }
  });

  it("stops at first rejecting validator", async () => {
    const second = vi.fn(async () => null);
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        validators: [
          async () => ({ available: false as const, message: "Blocked" }),
          second,
        ],
      },
      createMockAdapter({})
    );

    await guard.check("sarah");
    expect(second).not.toHaveBeenCalled();
  });

  it("runs all validators when all pass", async () => {
    const adapter = createMockAdapter({});
    const first = vi.fn(async () => null);
    const second = vi.fn(async () => null);
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        validators: [first, second],
      },
      adapter
    );

    await guard.check("sarah");
    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
    // DB check should also have run
    expect(adapter.findOne).toHaveBeenCalled();
  });

  it("receives normalized value", async () => {
    const validator = vi.fn(async () => null);
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        validators: [validator],
      },
      createMockAdapter({})
    );

    await guard.check("  @Sarah  ");
    expect(validator).toHaveBeenCalledWith("sarah");
  });

  it("runs before DB checks", async () => {
    const adapter = createMockAdapter({});
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        validators: [
          async () => ({ available: false as const, message: "Blocked" }),
        ],
      },
      adapter
    );

    await guard.check("sarah");
    // Validator rejected, so DB should never be queried
    expect(adapter.findOne).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------
describe("suggestions", () => {
  it("does not include suggestions when not configured", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestions).toBeUndefined();
    }
  });

  it("generates default suggestions for taken slugs", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: {},
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBe(3);
      // Default strategy is ["sequential", "random-digits"], so first suggestion is sequential
      expect(result.suggestions![0]).toBe("sarah-1");
      // All suggestions should match the format pattern
      for (const s of result.suggestions!) {
        expect(s).toMatch(/^[a-z0-9][a-z0-9-]{1,29}$/);
      }
    }
  });

  it("uses custom generator", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: {
          generate: (id) => [`${id}-io`, `${id}-app`, `${id}-hq`],
        },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestions).toEqual(["sarah-io", "sarah-app", "sarah-hq"]);
    }
  });

  it("filters out taken suggestions", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { strategy: "sequential" },
      },
      createMockAdapter({
        user: {
          sarah: { id: "u1" },
          "sarah-1": { id: "u2" },
          "sarah-2": { id: "u3" },
        },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      // sarah-1 and sarah-2 are taken, so compact and later variants are used
      expect(result.suggestions).toEqual(["sarah1", "sarah2", "sarah-3"]);
    }
  });

  it("filters out reserved suggestions", async () => {
    const guard = createNamespaceGuard(
      {
        reserved: ["sarah-1"],
        sources: defaultSources,
        suggest: { strategy: "sequential" },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      // sarah-1 is reserved, so it's skipped; compact variants fill in
      expect(result.suggestions).toEqual(["sarah1", "sarah-2", "sarah2"]);
    }
  });

  it("respects max limit", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { max: 1 },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestions!.length).toBe(1);
    }
  });

  it("does not suggest for invalid or reserved reasons", async () => {
    const guard = createNamespaceGuard(
      {
        reserved: ["admin"],
        sources: defaultSources,
        suggest: {},
      },
      createMockAdapter({})
    );

    const r1 = await guard.check("!!!");
    if (!r1.available) expect(r1.suggestions).toBeUndefined();

    const r2 = await guard.check("admin");
    if (!r2.available) expect(r2.suggestions).toBeUndefined();
  });

  it("returns no suggestions field when all candidates are taken", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: {
          generate: (id) => [`${id}-1`],
          max: 3,
        },
      },
      createMockAdapter({
        user: {
          sarah: { id: "u1" },
          "sarah-1": { id: "u2" },
        },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestions).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Case-insensitive matching
// ---------------------------------------------------------------------------
describe("caseInsensitive option", () => {
  it("passes caseInsensitive option to adapter", async () => {
    const adapter = createMockAdapter({});
    const guard = createNamespaceGuard(
      { sources: defaultSources, caseInsensitive: true },
      adapter
    );

    await guard.check("test-slug");

    expect(adapter.findOne).toHaveBeenCalledWith(
      defaultSources[0],
      "test-slug",
      { caseInsensitive: true }
    );
    expect(adapter.findOne).toHaveBeenCalledWith(
      defaultSources[1],
      "test-slug",
      { caseInsensitive: true }
    );
  });

  it("does not pass options when caseInsensitive is not set", async () => {
    const adapter = createMockAdapter({});
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      adapter
    );

    await guard.check("test-slug");

    expect(adapter.findOne).toHaveBeenCalledWith(
      defaultSources[0],
      "test-slug",
      undefined
    );
  });

  it("detects collisions with case-insensitive matching", async () => {
    const findOne = vi.fn(async (source: NamespaceSource, value: string) => {
      // Simulate case-insensitive DB match
      if (source.name === "user" && value === "sarah") {
        return { id: "u1" };
      }
      return null;
    });

    const guard = createNamespaceGuard(
      { sources: defaultSources, caseInsensitive: true },
      { findOne }
    );

    const result = await guard.check("Sarah"); // normalizes to "sarah"
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("taken");
    }
  });
});

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------
describe("cache", () => {
  it("caches adapter results on subsequent calls", async () => {
    const adapter = createMockAdapter({
      user: { sarah: { id: "u1" } },
    });
    const guard = createNamespaceGuard(
      { sources: defaultSources, cache: { ttl: 5000 } },
      adapter
    );

    await guard.check("sarah");
    await guard.check("sarah");

    // Should only call adapter once per source for the same value
    // First check: 2 calls (user + organization), second check: 0 (cached)
    expect(adapter.findOne).toHaveBeenCalledTimes(2);
  });

  it("does not cache when cache is not configured", async () => {
    const adapter = createMockAdapter({
      user: { sarah: { id: "u1" } },
    });
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      adapter
    );

    await guard.check("sarah");
    await guard.check("sarah");

    // Without cache, adapter is called every time
    expect(adapter.findOne).toHaveBeenCalledTimes(4);
  });

  it("clearCache resets cached entries", async () => {
    const adapter = createMockAdapter({
      user: { sarah: { id: "u1" } },
    });
    const guard = createNamespaceGuard(
      { sources: defaultSources, cache: { ttl: 5000 } },
      adapter
    );

    await guard.check("sarah");
    guard.clearCache();
    await guard.check("sarah");

    // 2 calls for first check + 2 calls after cache clear
    expect(adapter.findOne).toHaveBeenCalledTimes(4);
  });

  it("clearCache is a no-op when cache is not configured", () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({})
    );

    // Should not throw
    guard.clearCache();
  });

  it("expires cached entries after TTL", async () => {
    vi.useFakeTimers();
    try {
      const adapter = createMockAdapter({
        user: { sarah: { id: "u1" } },
      });
      const guard = createNamespaceGuard(
        { sources: defaultSources, cache: { ttl: 3000 } },
        adapter
      );

      await guard.check("sarah");
      expect(adapter.findOne).toHaveBeenCalledTimes(2); // user + organization

      // Within TTL - should use cache
      await guard.check("sarah");
      expect(adapter.findOne).toHaveBeenCalledTimes(2);

      // Advance past TTL
      vi.advanceTimersByTime(3001);

      // After TTL - should call adapter again
      await guard.check("sarah");
      expect(adapter.findOne).toHaveBeenCalledTimes(4); // 2 fresh calls
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Batch checking (checkMany)
// ---------------------------------------------------------------------------
describe("checkMany", () => {
  it("returns results for all identifiers", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({})
    );

    const results = await guard.checkMany(["sarah", "bob"]);
    expect(results.sarah.available).toBe(true);
    expect(results.bob.available).toBe(true);
  });

  it("handles mix of available and unavailable", async () => {
    const guard = createNamespaceGuard(
      { reserved: ["admin"], sources: defaultSources },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const results = await guard.checkMany(["sarah", "admin", "bob"]);
    expect(results.sarah.available).toBe(false);
    expect(results.admin.available).toBe(false);
    expect(results.bob.available).toBe(true);
  });

  it("passes scope through", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const results = await guard.checkMany(["sarah"], { id: "u1" });
    expect(results.sarah.available).toBe(true);
  });

  it("returns empty object for empty array", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({})
    );

    const results = await guard.checkMany([]);
    expect(results).toEqual({});
  });

  it("includes suggestions when skipSuggestions is false", async () => {
    const guard = createNamespaceGuard(
      {
        reserved: ["admin"],
        sources: defaultSources,
        suggest: { strategy: "sequential", max: 2 },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const results = await guard.checkMany(
      ["sarah", "bob"],
      {},
      { skipSuggestions: false }
    );
    expect(results.sarah.available).toBe(false);
    if (!results.sarah.available) {
      expect(results.sarah.suggestions).toBeDefined();
      expect(results.sarah.suggestions!.length).toBeGreaterThan(0);
    }
    expect(results.bob.available).toBe(true);
  });

  it("skips suggestions by default", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { strategy: "sequential", max: 2 },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const results = await guard.checkMany(["sarah"]);
    expect(results.sarah.available).toBe(false);
    if (!results.sarah.available) {
      expect(results.sarah.suggestions).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// createPredicateValidator
// ---------------------------------------------------------------------------
describe("createPredicateValidator", () => {
  it("wraps sync predicates", async () => {
    const validator = createPredicateValidator((value) => value === "blocked");
    expect(await validator("blocked")).toEqual({
      available: false,
      message: "That name is not allowed.",
    });
    expect(await validator("clean")).toBeNull();
  });

  it("wraps async predicates", async () => {
    const validator = createPredicateValidator(async (value) => value.includes("bad"));
    expect(await validator("mybadname")).not.toBeNull();
    expect(await validator("safe-name")).toBeNull();
  });

  it("supports custom transform and message", async () => {
    const validator = createPredicateValidator((value) => value === "evil", {
      transform: (value) => value.toLowerCase(),
      message: "Custom block.",
    });
    expect(await validator("EVIL")).toEqual({
      available: false,
      message: "Custom block.",
    });
  });

  it("works as a validator in createNamespaceGuard", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        validators: [
          createPredicateValidator((value) => value === "taken-by-filter", {
            message: "Blocked by external filter.",
          }),
        ],
      },
      createMockAdapter({})
    );

    const blocked = await guard.check("taken-by-filter");
    expect(blocked.available).toBe(false);
    if (!blocked.available) {
      expect(blocked.reason).toBe("invalid");
      expect(blocked.message).toBe("Blocked by external filter.");
    }

    const allowed = await guard.check("safe-name");
    expect(allowed.available).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createProfanityValidator
// ---------------------------------------------------------------------------
describe("createProfanityValidator", () => {
  it("rejects exact match", async () => {
    const validator = createProfanityValidator(["badword"]);
    const result = await validator("badword");
    expect(result).toEqual({ available: false, message: "That name is not allowed." });
  });

  it("rejects substring match by default", async () => {
    const validator = createProfanityValidator(["evil"]);
    const result = await validator("myevilname");
    expect(result).toEqual({ available: false, message: "That name is not allowed." });
  });

  it("skips substring check when checkSubstrings is false", async () => {
    const validator = createProfanityValidator(["evil"], { checkSubstrings: false });
    const result = await validator("myevilname");
    expect(result).toBeNull();
  });

  it("matches case-insensitively", async () => {
    const validator = createProfanityValidator(["BadWord"]);
    expect(await validator("badword")).not.toBeNull();
    expect(await validator("BADWORD")).not.toBeNull();
  });

  it("returns null for clean values", async () => {
    const validator = createProfanityValidator(["badword", "offensive"]);
    expect(await validator("hello")).toBeNull();
    expect(await validator("my-cool-slug")).toBeNull();
  });

  it("rejects substitution-based profanity evasion by default", async () => {
    const validator = createProfanityValidator(["shit"]);
    expect(await validator("sh1t")).not.toBeNull();
    expect(await validator("5h1t")).not.toBeNull();
    expect(await validator("s-h.i_t")).not.toBeNull();
  });

  it("rejects unicode confusable profanity evasion by default", async () => {
    const validator = createProfanityValidator(["shit"]);
    // Cyrillic і (U+0456)
    expect(await validator("sh\u0456t")).not.toBeNull();
  });

  it("supports basic mode for lowercase-only matching", async () => {
    const validator = createProfanityValidator(["shit"], { mode: "basic" });
    expect(await validator("shit")).not.toBeNull();
    expect(await validator("sh1t")).toBeNull();
  });

  it("uses minSubstringLength to reduce over-matching", async () => {
    const strict = createProfanityValidator(["bad"]);
    const permissive = createProfanityValidator(["bad"], {
      minSubstringLength: 3,
    });

    expect(await strict("mybadname")).toBeNull();
    expect(await permissive("mybadname")).not.toBeNull();
  });

  it("still checks exact matches for short words", async () => {
    const validator = createProfanityValidator(["bad"]);
    expect(await validator("bad")).not.toBeNull();
  });

  it("supports aggressive substitute profile for broader matches", async () => {
    const balanced = createProfanityValidator(["boob"], {
      variantProfile: "balanced",
    });
    const aggressive = createProfanityValidator(["boob"], {
      variantProfile: "aggressive",
    });

    expect(await balanced("8oo8")).toBeNull();
    expect(await aggressive("8oo8")).not.toBeNull();
  });

  it("uses custom message", async () => {
    const validator = createProfanityValidator(["nope"], { message: "Try again." });
    const result = await validator("nope");
    expect(result).toEqual({ available: false, message: "Try again." });
  });

  it("works as a validator in createNamespaceGuard", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        validators: [createProfanityValidator(["offensive"])],
      },
      createMockAdapter({})
    );

    const result = await guard.check("offensive");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("invalid");
      expect(result.message).toBe("That name is not allowed.");
    }
  });

  it("blocks obfuscated profanity when used as a guard validator", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        validators: [createProfanityValidator(["shit"])],
      },
      createMockAdapter({})
    );

    const result = await guard.check("5h1t");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("invalid");
      expect(result.message).toBe("That name is not allowed.");
    }
  });
});

// ---------------------------------------------------------------------------
// Cache stats
// ---------------------------------------------------------------------------
describe("cacheStats", () => {
  it("returns zeros initially", () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources, cache: { ttl: 5000 } },
      createMockAdapter({})
    );

    expect(guard.cacheStats()).toEqual({ size: 0, hits: 0, misses: 0 });
  });

  it("tracks misses on first call", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources, cache: { ttl: 5000 } },
      createMockAdapter({})
    );

    await guard.check("sarah");
    // 2 sources = 2 misses
    expect(guard.cacheStats().misses).toBe(2);
    expect(guard.cacheStats().hits).toBe(0);
  });

  it("tracks hits on cached calls", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources, cache: { ttl: 5000 } },
      createMockAdapter({})
    );

    await guard.check("sarah");
    await guard.check("sarah");
    // First call: 2 misses; second call: 2 hits
    expect(guard.cacheStats().misses).toBe(2);
    expect(guard.cacheStats().hits).toBe(2);
  });

  it("reports correct cache size", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources, cache: { ttl: 5000 } },
      createMockAdapter({})
    );

    await guard.check("sarah");
    // 2 sources = 2 cached entries
    expect(guard.cacheStats().size).toBe(2);
  });

  it("clearCache resets stats", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources, cache: { ttl: 5000 } },
      createMockAdapter({})
    );

    await guard.check("sarah");
    guard.clearCache();
    expect(guard.cacheStats()).toEqual({ size: 0, hits: 0, misses: 0 });
  });

  it("returns zeros when cache is not enabled", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({})
    );

    await guard.check("sarah");
    expect(guard.cacheStats()).toEqual({ size: 0, hits: 0, misses: 0 });
  });
});

// ---------------------------------------------------------------------------
// Smarter default suggestions
// ---------------------------------------------------------------------------
describe("sequential strategy", () => {
  it("includes both hyphenated and compact variants", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { strategy: "sequential", max: 6 },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestions).toEqual([
        "sarah-1", "sarah1", "sarah-2", "sarah2", "sarah-3", "sarah3",
      ]);
    }
  });

  it("generates truncated suggestions near max length", async () => {
    // Pattern allows max 5 chars
    const guard = createNamespaceGuard(
      {
        sources: [{ name: "user", column: "handle", scopeKey: "id" }],
        pattern: /^[a-z0-9-]{2,5}$/,
        suggest: { strategy: "sequential", max: 5 },
      },
      createMockAdapter({
        user: { abcde: { id: "u1" } },
      })
    );

    const result = await guard.check("abcde");
    expect(result.available).toBe(false);
    if (!result.available) {
      // "abcde" is 5 chars (max), so "abcde-1" (7) and "abcde1" (6) exceed limit
      // Truncated variants: "abcd1", "abcd2", etc.
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.every((s) => s.length <= 5)).toBe(true);
    }
  });

  it("custom generator still overrides defaults", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: {
          generate: (id) => [`${id}-x`, `${id}-y`],
        },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestions).toEqual(["sarah-x", "sarah-y"]);
    }
  });

  it("skips suggestions that don't match the pattern", async () => {
    // Pattern that forbids hyphens
    const guard = createNamespaceGuard(
      {
        sources: [{ name: "user", column: "handle", scopeKey: "id" }],
        pattern: /^[a-z0-9]{2,30}$/,
        suggest: { strategy: "sequential", max: 3 },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      // "sarah-1" etc. contain hyphens, so only compact variants pass the pattern
      expect(result.suggestions).toEqual(["sarah1", "sarah2", "sarah3"]);
    }
  });
});

// ---------------------------------------------------------------------------
// Validator error handling
// ---------------------------------------------------------------------------
describe("validator error handling", () => {
  it("catches validator errors and returns invalid result", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        validators: [
          async () => { throw new Error("External API failed"); },
        ],
      },
      createMockAdapter({})
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("invalid");
      expect(result.message).toBe("External API failed");
    }
  });

  it("catches non-Error throws", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        validators: [
          async () => { throw "string error"; },
        ],
      },
      createMockAdapter({})
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("invalid");
      expect(result.message).toBe("Validation failed.");
    }
  });
});

// ---------------------------------------------------------------------------
// Cache race condition
// ---------------------------------------------------------------------------
describe("cache deduplication", () => {
  it("deduplicates concurrent calls for the same key", async () => {
    let callCount = 0;
    const adapter: NamespaceAdapter = {
      findOne: vi.fn(async () => {
        callCount++;
        // Simulate async delay
        await new Promise((r) => setTimeout(r, 10));
        return null;
      }),
    };

    const guard = createNamespaceGuard(
      {
        sources: [{ name: "user", column: "handle" }],
        cache: { ttl: 5000 },
      },
      adapter
    );

    // Fire two checks in parallel for the same slug
    const [r1, r2] = await Promise.all([
      guard.check("sarah"),
      guard.check("sarah"),
    ]);

    expect(r1.available).toBe(true);
    expect(r2.available).toBe(true);
    // Should only call adapter once since the second call reuses the pending promise
    expect(adapter.findOne).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Empty sources
// ---------------------------------------------------------------------------
describe("edge cases", () => {
  it("returns available when sources array is empty", async () => {
    const guard = createNamespaceGuard(
      { sources: [] },
      createMockAdapter({})
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(true);
  });

  it("scope key mismatch is silently ignored", async () => {
    const sources: NamespaceSource[] = [
      { name: "user", column: "handle", scopeKey: "userId" },
    ];

    const guard = createNamespaceGuard(
      { sources },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    // Passing wrong scope key - ownership check is skipped, collision detected
    const result = await guard.check("sarah", { wrongKey: "u1" });
    expect(result.available).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suggestion strategies
// ---------------------------------------------------------------------------
describe("suggestion strategies", () => {
  it("sequential strategy produces hyphenated and compact variants", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { strategy: "sequential", max: 4 },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestions).toEqual(["sarah-1", "sarah1", "sarah-2", "sarah2"]);
    }
  });

  it("random-digits strategy produces numeric suffixed candidates", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { strategy: "random-digits", max: 3 },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBe(3);
      for (const s of result.suggestions!) {
        expect(s).toMatch(/^sarah-\d{3,4}$/);
      }
    }
  });

  it("suffix-words strategy produces word-suffixed candidates", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { strategy: "suffix-words", max: 3 },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBe(3);
      // First 3 suffix words are "dev", "io", "app"
      expect(result.suggestions).toEqual(["sarah-dev", "sarah-io", "sarah-app"]);
    }
  });

  it("short-random strategy produces 3-char alphanumeric suffixes", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { strategy: "short-random", max: 3 },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBe(3);
      for (const s of result.suggestions!) {
        expect(s).toMatch(/^sarah-[a-z0-9]{3}$/);
      }
    }
  });

  it("scramble strategy produces character transpositions", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { strategy: "scramble", max: 10 },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestions).toBeDefined();
      // "sarah" has 4 adjacent swap positions, all produce unique results
      // s↔a = "asrah", a↔r = "sraha"... etc.
      for (const s of result.suggestions!) {
        expect(s).not.toBe("sarah");
        expect(s.length).toBe(5); // same length as input
      }
    }
  });

  it("array composition interleaves candidates round-robin", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { strategy: ["sequential", "suffix-words"], max: 4 },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBe(4);
      // Interleaved: first sequential, first suffix-word, second sequential, second suffix-word
      expect(result.suggestions![0]).toBe("sarah-1"); // sequential
      expect(result.suggestions![1]).toBe("sarah-dev"); // suffix-words
      expect(result.suggestions![2]).toBe("sarah1"); // sequential
      expect(result.suggestions![3]).toBe("sarah-io"); // suffix-words
    }
  });

  it("custom function strategy works", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: {
          strategy: (id) => [`${id}-custom1`, `${id}-custom2`],
        },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestions).toEqual(["sarah-custom1", "sarah-custom2"]);
    }
  });

  it("legacy generate callback still works", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: {
          generate: (id) => [`${id}-legacy1`, `${id}-legacy2`],
        },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestions).toEqual(["sarah-legacy1", "sarah-legacy2"]);
    }
  });

  it("generate takes priority over strategy when both specified", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: {
          strategy: "suffix-words",
          generate: (id) => [`${id}-override`],
        },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestions).toEqual(["sarah-override"]);
    }
  });
});

// ---------------------------------------------------------------------------
// Optimized suggestion pipeline
// ---------------------------------------------------------------------------
describe("optimized suggestion pipeline", () => {
  it("skips reserved names without DB call", async () => {
    const adapter = createMockAdapter({
      user: { sarah: { id: "u1" } },
    });

    const guard = createNamespaceGuard(
      {
        reserved: ["sarah-1", "sarah1", "sarah-2"],
        sources: defaultSources,
        suggest: { strategy: "sequential", max: 1 },
      },
      adapter
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      // First 3 candidates are reserved, so sarah2 should be the first suggestion
      expect(result.suggestions).toEqual(["sarah2"]);
    }
  });

  it("skips format-invalid candidates without DB call", async () => {
    // Pattern forbids hyphens
    const adapter = createMockAdapter({
      user: { sarah: { id: "u1" } },
    });

    const guard = createNamespaceGuard(
      {
        sources: [{ name: "user", column: "handle", scopeKey: "id" }],
        pattern: /^[a-z0-9]{2,30}$/,
        suggest: { strategy: "sequential", max: 2 },
      },
      adapter
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      // Hyphenated variants are filtered out by pattern check; only compact pass
      expect(result.suggestions).toEqual(["sarah1", "sarah2"]);
      // DB calls: 1 for "sarah" collision check + 2 for suggestions that passed sync filter
      // Without optimization, all candidates would hit the DB
      const findOneCalls = (adapter.findOne as ReturnType<typeof vi.fn>).mock.calls;
      // The adapter should only have been called for the original check + valid candidates
      expect(findOneCalls.length).toBeLessThanOrEqual(3);
    }
  });

  it("runs validators before DB check in suggestions", async () => {
    const adapter = createMockAdapter({
      user: { sarah: { id: "u1" } },
    });

    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { strategy: "sequential", max: 1 },
        validators: [
          async (value) =>
            value.includes("1")
              ? { available: false, message: "No ones" }
              : null,
        ],
      },
      adapter
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      // sarah-1, sarah1 contain "1" so rejected by validator
      // sarah-2 is the first valid candidate
      expect(result.suggestions).toEqual(["sarah-2"]);
    }
  });

  it("validates only a batch at a time, not all candidates", async () => {
    let validatorCalls = 0;
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { strategy: "sequential", max: 2 },
        validators: [
          async () => {
            validatorCalls++;
            return null;
          },
        ],
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    await guard.check("sarah");
    // Progressive pipeline: first batch of 2 candidates validated + DB-checked.
    // If both pass, no more batches needed. At most ~4 validator calls (2 batches).
    // Old approach would validate ALL ~18 candidates.
    expect(validatorCalls).toBeLessThanOrEqual(6);
  });

  it("checks DB candidates in parallel within a batch", async () => {
    const callTimestamps: number[] = [];
    const adapter: NamespaceAdapter = {
      findOne: vi.fn(async () => {
        callTimestamps.push(Date.now());
        await new Promise((r) => setTimeout(r, 20));
        return null;
      }),
    };

    const guard = createNamespaceGuard(
      {
        sources: [{ name: "user", column: "handle" }],
        suggest: { strategy: "sequential", max: 3 },
      },
      adapter
    );

    // Make "taken" exist in DB
    (adapter.findOne as ReturnType<typeof vi.fn>).mockImplementation(
      async (_source: NamespaceSource, value: string) => {
        await new Promise((r) => setTimeout(r, 20));
        return value === "taken" ? { id: "u1" } : null;
      }
    );

    const start = Date.now();
    const result = await guard.check("taken");
    const elapsed = Date.now() - start;

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestions).toBeDefined();
      // With batched parallel, should be significantly faster than sequential
      // 3 parallel DB checks per batch × 20ms ≈ 40-60ms per batch
      // Sequential would be 3 × 20ms per candidate = 60ms minimum
      expect(elapsed).toBeLessThan(300);
    }
  });
});

// ---------------------------------------------------------------------------
// Similar strategy
// ---------------------------------------------------------------------------
describe("similar strategy", () => {
  it("generates edit-distance-1 deletions", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { strategy: "similar", max: 20 },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available && result.suggestions) {
      // Deletions of "sarah": "arah", "srah", "saah", "sarh", "sara"
      expect(result.suggestions).toContain("arah");
      expect(result.suggestions).toContain("sara");
    }
  });

  it("generates keyboard-adjacent substitutions", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { strategy: "similar", max: 50 },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    if (!result.available && result.suggestions) {
      // 's' neighbors: a,d,w,z → "aarah", "darah", "warah", "zarah"
      expect(result.suggestions).toContain("darah");
      expect(result.suggestions).toContain("warah");
    }
  });

  it("generates prefix and suffix additions", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { strategy: "similar", max: 50 },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    if (!result.available && result.suggestions) {
      expect(result.suggestions).toContain("thesarah");
      expect(result.suggestions).toContain("mysarah");
      expect(result.suggestions).toContain("sarahx");
      expect(result.suggestions).toContain("saraho");
    }
  });

  it("respects pattern constraints", async () => {
    // Pattern forbids digits
    const guard = createNamespaceGuard(
      {
        sources: [{ name: "user", column: "handle" }],
        pattern: /^[a-z-]{2,30}$/,
        suggest: { strategy: "similar", max: 50 },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    if (!result.available && result.suggestions) {
      for (const s of result.suggestions) {
        expect(s).toMatch(/^[a-z-]{2,30}$/);
      }
    }
  });

  it("handles short identifiers without crashing", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { strategy: "similar", max: 10 },
      },
      createMockAdapter({
        user: { ab: { id: "u1" } },
      })
    );

    const result = await guard.check("ab");
    expect(result.available).toBe(false);
    // Deletions of "ab" produce "a" and "b" which fail min-length 2
    // But substitutions and prefix/suffix additions should still work
    if (!result.available && result.suggestions) {
      for (const s of result.suggestions) {
        expect(s).toMatch(/^[a-z0-9][a-z0-9-]{1,29}$/);
      }
    }
  });

  it("handles identifiers at max length", async () => {
    const guard = createNamespaceGuard(
      {
        sources: [{ name: "user", column: "handle" }],
        pattern: /^[a-z]{2,5}$/,
        suggest: { strategy: "similar", max: 50 },
      },
      createMockAdapter({
        user: { abcde: { id: "u1" } },
      })
    );

    const result = await guard.check("abcde");
    if (!result.available && result.suggestions) {
      for (const s of result.suggestions) {
        expect(s.length).toBeLessThanOrEqual(5);
        expect(s.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("composes with other strategies via array", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { strategy: ["similar", "sequential"], max: 4 },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    if (!result.available) {
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBe(4);
    }
  });

  it("produces no duplicates", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { strategy: "similar", max: 100 },
      },
      createMockAdapter({
        user: { aaa: { id: "u1" } },
      })
    );

    const result = await guard.check("aaa");
    if (!result.available && result.suggestions) {
      const unique = new Set(result.suggestions);
      expect(unique.size).toBe(result.suggestions.length);
    }
  });
});

// ---------------------------------------------------------------------------
// Profanity validator optimizations
// ---------------------------------------------------------------------------
describe("profanity validator optimizations", () => {
  it("handles special regex characters in word list", async () => {
    const validator = createProfanityValidator(["bad.word", "test(ing)"]);
    // Should match exact, not as regex patterns
    expect(await validator("bad.word")).not.toBeNull();
    expect(await validator("badxword")).toBeNull(); // "." should not match any char
    expect(await validator("test(ing)")).not.toBeNull();
  });

  it("handles large word lists efficiently", async () => {
    const words = Array.from({ length: 1000 }, (_, i) => `word${i}`);
    const validator = createProfanityValidator(words);
    expect(await validator("word500")).not.toBeNull();
    expect(await validator("containsword999inside")).not.toBeNull();
    expect(await validator("clean-name")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// LRU cache behavior
// ---------------------------------------------------------------------------
describe("LRU cache eviction", () => {
  it("promotes recently accessed entries", async () => {
    const adapter = createMockAdapter({});
    const guard = createNamespaceGuard(
      {
        sources: [{ name: "user", column: "handle" }],
        cache: { ttl: 60000 },
      },
      adapter
    );

    // First access: cache miss
    await guard.check("slug-a");
    // Second access: cache miss
    await guard.check("slug-b");
    // Re-access slug-a: should be a cache hit (LRU promotes it)
    await guard.check("slug-a");

    const stats = guard.cacheStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Composed strategy deduplication
// ---------------------------------------------------------------------------
describe("composed strategy deduplication", () => {
  it("removes duplicates when composing named strategies", async () => {
    // Use two strategies that might produce overlapping candidates
    // "sequential" produces sarah-1, sarah1, sarah-2, sarah2, ...
    // "suffix-words" produces sarah-dev, sarah-io, ...
    // Round-robin interleave should have no duplicates
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { strategy: ["sequential", "suffix-words"], max: 6 },
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );

    const result = await guard.check("sarah");
    if (!result.available && result.suggestions) {
      const unique = new Set(result.suggestions);
      expect(unique.size).toBe(result.suggestions.length);
    }
  });
});

// ---------------------------------------------------------------------------
// normalize() with NFKC
// ---------------------------------------------------------------------------
describe("normalize with NFKC", () => {
  it("normalizes full-width characters to ASCII", () => {
    expect(normalize("\uff48\uff45\uff4c\uff4c\uff4f")).toBe("hello");
  });

  it("normalizes ligatures", () => {
    expect(normalize("\ufb01nance")).toBe("finance");
  });

  it("normalizes superscripts", () => {
    expect(normalize("x\u2075")).toBe("x5");
  });

  it("normalizes combining characters to precomposed form", () => {
    expect(normalize("caf\u0065\u0301")).toBe("caf\u00e9");
  });

  it("is a no-op for plain ASCII", () => {
    expect(normalize("hello-world")).toBe("hello-world");
  });

  it("respects unicode: false option", () => {
    const result = normalize("\uff48ello", { unicode: false });
    expect(result).not.toBe("hello");
  });
});

// ---------------------------------------------------------------------------
// createHomoglyphValidator
// ---------------------------------------------------------------------------
describe("createHomoglyphValidator", () => {
  it("rejects Cyrillic а in admin", async () => {
    const validator = createHomoglyphValidator();
    const result = await validator("\u0430dmin");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("confused");
  });

  it("rejects Greek ο in bob", async () => {
    const validator = createHomoglyphValidator();
    const result = await validator("b\u03bfb");
    expect(result).not.toBeNull();
  });

  it("passes pure ASCII input", async () => {
    const validator = createHomoglyphValidator();
    expect(await validator("hello")).toBeNull();
    expect(await validator("admin")).toBeNull();
    expect(await validator("test-123")).toBeNull();
  });

  it("uses custom message", async () => {
    const validator = createHomoglyphValidator({ message: "No spoofing!" });
    const result = await validator("\u0430dmin");
    expect(result!.message).toBe("No spoofing!");
  });

  it("supports additional mappings", async () => {
    // Use a char not in the built-in map to test additional mappings
    const validator = createHomoglyphValidator({
      additionalMappings: { "\u2603": "x" },
    });
    const result = await validator("te\u2603t");
    expect(result).not.toBeNull();
  });

  it("rejects mixed Cyrillic+Latin when rejectMixedScript is true", async () => {
    const validator = createHomoglyphValidator({ rejectMixedScript: true });
    // Cyrillic б (not in confusable map) + Latin text
    const result = await validator("hel\u0431o");
    expect(result).not.toBeNull();
  });

  it("allows pure Cyrillic without confusable chars when rejectMixedScript is true", async () => {
    const validator = createHomoglyphValidator({ rejectMixedScript: true });
    // "мид" - all Cyrillic, none in confusable map (м=U+043C, и=U+0438, д=U+0434)
    const result = await validator("\u043c\u0438\u0434");
    expect(result).toBeNull();
  });

  it("allows pure Latin when rejectMixedScript is true", async () => {
    const validator = createHomoglyphValidator({ rejectMixedScript: true });
    expect(await validator("hello")).toBeNull();
  });

  // New script category tests (TR39 expansion)
  it("rejects Armenian հ (ho) as confusable with Latin h", async () => {
    const validator = createHomoglyphValidator();
    const result = await validator("\u0570ello"); // Armenian ho + "ello"
    expect(result).not.toBeNull();
  });

  it("rejects Cherokee Ꭺ (go) as confusable with Latin a", async () => {
    const validator = createHomoglyphValidator();
    const result = await validator("\u13AAdmin"); // Cherokee A + "dmin"
    expect(result).not.toBeNull();
  });

  it("rejects IPA ɑ (alpha) as confusable with Latin a", async () => {
    const validator = createHomoglyphValidator();
    const result = await validator("\u0251dmin"); // IPA alpha + "dmin"
    expect(result).not.toBeNull();
  });

  it("rejects IPA ɡ (script g) as confusable with Latin g", async () => {
    const validator = createHomoglyphValidator();
    const result = await validator("lo\u0261in"); // "lo" + IPA script g + "in"
    expect(result).not.toBeNull();
  });

  it("rejects Greek uppercase Α as confusable with Latin a", async () => {
    const validator = createHomoglyphValidator();
    const result = await validator("\u0391dmin"); // Greek Alpha + "dmin"
    expect(result).not.toBeNull();
  });

  it("rejects Canadian Syllabics ᕼ as confusable with Latin h", async () => {
    const validator = createHomoglyphValidator();
    const result = await validator("\u157Cello"); // Canadian Syllabics H + "ello"
    expect(result).not.toBeNull();
  });

  it("rejects Latin small capital ᴀ as confusable with Latin a", async () => {
    const validator = createHomoglyphValidator();
    const result = await validator("\u1D00dmin"); // Latin small cap A + "dmin"
    expect(result).not.toBeNull();
  });

  it("rejects Latin small capital ᴛ as confusable with Latin t", async () => {
    const validator = createHomoglyphValidator();
    const result = await validator("admin\u1D1B"); // "admin" + Latin small cap T
    expect(result).not.toBeNull();
  });

  it("IPA confusables caught even without rejectMixedScript", async () => {
    // IPA chars are Latin-script, so mixed-script detection won't help -
    // only the confusable map catches them
    const validator = createHomoglyphValidator({ rejectMixedScript: false });
    const result = await validator("\u0251dmin"); // IPA alpha looks like "admin"
    expect(result).not.toBeNull();
  });

  it("rejects mixed Armenian+Latin when rejectMixedScript is true", async () => {
    const validator = createHomoglyphValidator({ rejectMixedScript: true });
    // Armenian ի (U+056B, not in confusable map) + Latin text
    const result = await validator("hel\u056Bo");
    expect(result).not.toBeNull();
  });

  it("rejects mixed Cherokee+Latin when rejectMixedScript is true", async () => {
    const validator = createHomoglyphValidator({ rejectMixedScript: true });
    // Cherokee Ꮃ (U+13B3, in confusable map as "w") is caught by map,
    // but Cherokee Ꮊ (U+13CA, not in map) + Latin = mixed script
    const result = await validator("hel\u13CAo");
    expect(result).not.toBeNull();
  });

  // --- Expanded mixed-script regex: all new script ranges ---

  it("rejects mixed Hebrew+Latin when rejectMixedScript is true", async () => {
    const validator = createHomoglyphValidator({ rejectMixedScript: true });
    // Hebrew Alef (U+05D0, not in confusable map) + Latin
    const result = await validator("hel\u05D0o");
    expect(result).not.toBeNull();
  });

  it("rejects mixed Arabic+Latin when rejectMixedScript is true", async () => {
    const validator = createHomoglyphValidator({ rejectMixedScript: true });
    // Arabic Ba (U+0628, not in confusable map) + Latin
    const result = await validator("hel\u0628o");
    expect(result).not.toBeNull();
  });

  it("rejects mixed Devanagari+Latin when rejectMixedScript is true", async () => {
    const validator = createHomoglyphValidator({ rejectMixedScript: true });
    // Devanagari Ka (U+0915) + Latin
    const result = await validator("hel\u0915o");
    expect(result).not.toBeNull();
  });

  it("rejects mixed Thai+Latin when rejectMixedScript is true", async () => {
    const validator = createHomoglyphValidator({ rejectMixedScript: true });
    // Thai Ko Kai (U+0E01) + Latin
    const result = await validator("hel\u0E01o");
    expect(result).not.toBeNull();
  });

  it("rejects mixed Myanmar+Latin when rejectMixedScript is true", async () => {
    const validator = createHomoglyphValidator({ rejectMixedScript: true });
    // Myanmar Ka (U+1000, but U+1004 is in confusable map - use U+1001)
    const result = await validator("hel\u1001o");
    expect(result).not.toBeNull();
  });

  it("rejects mixed Georgian+Latin when rejectMixedScript is true", async () => {
    const validator = createHomoglyphValidator({ rejectMixedScript: true });
    // Georgian An (U+10A0) + Latin
    const result = await validator("hel\u10A0o");
    expect(result).not.toBeNull();
  });

  it("rejects mixed Ethiopic+Latin when rejectMixedScript is true", async () => {
    const validator = createHomoglyphValidator({ rejectMixedScript: true });
    // Ethiopic Ha (U+1210) + Latin
    const result = await validator("hel\u1210o");
    expect(result).not.toBeNull();
  });

  it("rejects mixed Runic+Latin when rejectMixedScript is true", async () => {
    const validator = createHomoglyphValidator({ rejectMixedScript: true });
    // Runic Fehu (U+16A0) + Latin
    const result = await validator("hel\u16A0o");
    expect(result).not.toBeNull();
  });

  it("rejects mixed Khmer+Latin when rejectMixedScript is true", async () => {
    const validator = createHomoglyphValidator({ rejectMixedScript: true });
    // Khmer Ka (U+1780) + Latin
    const result = await validator("hel\u1780o");
    expect(result).not.toBeNull();
  });

  it("rejects mixed Coptic+Latin when rejectMixedScript is true", async () => {
    const validator = createHomoglyphValidator({ rejectMixedScript: true });
    // Coptic Alfa (U+2C80, not in map - U+2C82 is) + Latin
    const result = await validator("hel\u2C80o");
    expect(result).not.toBeNull();
  });

  it("rejects mixed Tifinagh+Latin when rejectMixedScript is true", async () => {
    const validator = createHomoglyphValidator({ rejectMixedScript: true });
    // Tifinagh Ya (U+2D30) + Latin
    const result = await validator("hel\u2D30o");
    expect(result).not.toBeNull();
  });

  it("rejects mixed Lisu+Latin when rejectMixedScript is true", async () => {
    const validator = createHomoglyphValidator({ rejectMixedScript: true });
    // Lisu A (U+A4D5, not in map) + Latin
    const result = await validator("hel\uA4D5o");
    expect(result).not.toBeNull();
  });

  it("rejects mixed Bamum+Latin when rejectMixedScript is true", async () => {
    const validator = createHomoglyphValidator({ rejectMixedScript: true });
    // Bamum A (U+A6A0) + Latin
    const result = await validator("hel\uA6A0o");
    expect(result).not.toBeNull();
  });

  // --- Negative: non-confusable non-Latin chars pass without rejectMixedScript ---

  it("allows non-confusable non-Latin chars when rejectMixedScript is false", async () => {
    const validator = createHomoglyphValidator({ rejectMixedScript: false });
    // Hebrew Alef (U+05D0) is not in confusable map - should pass
    expect(await validator("\u05D0")).toBeNull();
    // Arabic Ba (U+0628) is not in confusable map - should pass
    expect(await validator("\u0628")).toBeNull();
    // Devanagari Ka (U+0915) is not in confusable map - should pass
    expect(await validator("\u0915")).toBeNull();
    // Thai Ko Kai (U+0E01) is not in confusable map - should pass
    expect(await validator("\u0E01")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createInvisibleCharacterValidator
// ---------------------------------------------------------------------------
describe("createInvisibleCharacterValidator", () => {
  it("rejects default-ignorable characters (zero-width space)", async () => {
    const validator = createInvisibleCharacterValidator();
    const result = await validator("pay\u200Bpal");
    expect(result).not.toBeNull();
    expect(result?.message).toContain("invisible");
  });

  it("rejects bidi controls by default", async () => {
    const validator = createInvisibleCharacterValidator();
    const result = await validator("abc\u202Edef");
    expect(result).not.toBeNull();
  });

  it("supports custom message", async () => {
    const validator = createInvisibleCharacterValidator({
      message: "No invisible chars.",
    });
    const result = await validator("a\u200Db");
    expect(result?.message).toBe("No invisible chars.");
  });

  it("can allow default-ignorables when configured", async () => {
    const validator = createInvisibleCharacterValidator({
      rejectDefaultIgnorables: false,
      rejectBidiControls: true,
    });
    expect(await validator("pay\u200Bpal")).toBeNull();
    expect(await validator("abc\u202Edef")).not.toBeNull();
  });

  it("can allow bidi controls when both checks are disabled", async () => {
    const validator = createInvisibleCharacterValidator({
      rejectDefaultIgnorables: false,
      rejectBidiControls: false,
    });
    expect(await validator("abc\u202Edef")).toBeNull();
    expect(await validator("a\u200Db")).toBeNull();
  });

  it("does not reject combining marks by default", async () => {
    const validator = createInvisibleCharacterValidator();
    expect(await validator("e\u0301clair")).toBeNull();
  });

  it("can reject combining marks when enabled", async () => {
    const validator = createInvisibleCharacterValidator({
      rejectCombiningMarks: true,
    });
    const result = await validator("e\u0301clair");
    expect(result).not.toBeNull();
  });

  it("can allow combining marks explicitly when enabled checks are disabled", async () => {
    const validator = createInvisibleCharacterValidator({
      rejectDefaultIgnorables: true,
      rejectBidiControls: true,
      rejectCombiningMarks: false,
    });
    expect(await validator("e\u0301clair")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CONFUSABLE_MAP export
// ---------------------------------------------------------------------------
describe("CONFUSABLE_MAP", () => {
  it("is exported and contains expected mappings", () => {
    // Cyrillic
    expect(CONFUSABLE_MAP["\u0430"]).toBe("a");
    expect(CONFUSABLE_MAP["\u0441"]).toBe("c");
    // Greek
    expect(CONFUSABLE_MAP["\u03b1"]).toBe("a");
    expect(CONFUSABLE_MAP["\u0391"]).toBe("a"); // Greek uppercase Alpha
    // Armenian
    expect(CONFUSABLE_MAP["\u0570"]).toBe("h");
    // Cherokee
    expect(CONFUSABLE_MAP["\u13aa"]).toBe("a");
    // IPA
    expect(CONFUSABLE_MAP["\u0251"]).toBe("a");
    // Latin small capitals (supplemental - not in TR39)
    expect(CONFUSABLE_MAP["\u1d00"]).toBe("a");
    expect(CONFUSABLE_MAP["\u1d1b"]).toBe("t");
    // Canadian Syllabics
    expect(CONFUSABLE_MAP["\u157c"]).toBe("h");
    // Coptic
    expect(CONFUSABLE_MAP["\u2c82"]).toBe("b");
    expect(CONFUSABLE_MAP["\u2c9e"]).toBe("o");
    // Lisu
    expect(CONFUSABLE_MAP["\ua4d0"]).toBe("b");
    expect(CONFUSABLE_MAP["\ua4f3"]).toBe("o");
    // Bamum
    expect(CONFUSABLE_MAP["\ua6df"]).toBe("v");
    // Georgian
    expect(CONFUSABLE_MAP["\u10e7"]).toBe("y");
    expect(CONFUSABLE_MAP["\u10ff"]).toBe("o");
    // Hebrew
    expect(CONFUSABLE_MAP["\u05c0"]).toBe("l");
    expect(CONFUSABLE_MAP["\u05e1"]).toBe("o");
    // Arabic
    expect(CONFUSABLE_MAP["\u0647"]).toBe("o");
    expect(CONFUSABLE_MAP["\u0627"]).toBe("l");
    // Tifinagh
    expect(CONFUSABLE_MAP["\u2d54"]).toBe("o");
    expect(CONFUSABLE_MAP["\u2d5d"]).toBe("x");
    // Runic
    expect(CONFUSABLE_MAP["\u16c1"]).toBe("l");
    expect(CONFUSABLE_MAP["\u16b7"]).toBe("x");
    // Khmer
    expect(CONFUSABLE_MAP["\u17e0"]).toBe("o");
    // Total count - full TR39 + supplemental
    expect(Object.keys(CONFUSABLE_MAP).length).toBeGreaterThanOrEqual(600);
  });

  // --- NFKC-conflict exclusions: entries removed because NFKC maps to a different letter ---

  it("excludes U+017F Long S (TR39 says f, NFKC says s)", () => {
    expect(CONFUSABLE_MAP["\u017f"]).toBeUndefined();
  });

  it("excludes U+2110 Script Capital I (TR39 says l, NFKC says i)", () => {
    expect(CONFUSABLE_MAP["\u2110"]).toBeUndefined();
  });

  it("excludes U+2111 Fraktur Capital I (TR39 says l, NFKC says i)", () => {
    expect(CONFUSABLE_MAP["\u2111"]).toBeUndefined();
  });

  it("excludes U+2160 Roman Numeral I (TR39 says l, NFKC says i)", () => {
    expect(CONFUSABLE_MAP["\u2160"]).toBeUndefined();
  });

  it("excludes U+FF29 Fullwidth Latin I (TR39 says l, NFKC says i)", () => {
    expect(CONFUSABLE_MAP["\uff29"]).toBeUndefined();
  });

  it("excludes Mathematical Bold/Italic/Script I variants (NFKC → i, not l)", () => {
    // All 11 Mathematical I variants: TR39 maps to "l" but NFKC normalizes to "i"
    const mathI = [
      "\u{1D408}", "\u{1D43C}", "\u{1D470}", "\u{1D4D8}", "\u{1D540}",
      "\u{1D574}", "\u{1D5A8}", "\u{1D5DC}", "\u{1D610}", "\u{1D644}",
      "\u{1D678}",
    ];
    for (const ch of mathI) {
      expect(CONFUSABLE_MAP[ch]).toBeUndefined();
    }
  });

  it("excludes Mathematical digit 0 variants (NFKC → 0, not o)", () => {
    const mathZero = [
      "\u{1D7CE}", "\u{1D7D8}", "\u{1D7E2}", "\u{1D7EC}", "\u{1D7F6}",
      "\u{1FBF0}",
    ];
    for (const ch of mathZero) {
      expect(CONFUSABLE_MAP[ch]).toBeUndefined();
    }
  });

  it("excludes Mathematical digit 1 variants (NFKC → 1, not l)", () => {
    const mathOne = [
      "\u{1D7CF}", "\u{1D7D9}", "\u{1D7E3}", "\u{1D7ED}", "\u{1D7F7}",
      "\u{1FBF1}",
    ];
    for (const ch of mathOne) {
      expect(CONFUSABLE_MAP[ch]).toBeUndefined();
    }
  });

  // --- NFKC pipeline integration: excluded chars still get caught by normalize ---

  it("NFKC-excluded chars are still handled by the normalize pipeline", () => {
    // U+017F Long S → NFKC → "s" (not "f" as TR39 says)
    expect("\u017f".normalize("NFKC").toLowerCase()).toBe("s");
    // U+2160 Roman Numeral I → NFKC → "i"
    expect("\u2160".normalize("NFKC").toLowerCase()).toBe("i");
    // U+FF29 Fullwidth I → NFKC → "i"
    expect("\uff29".normalize("NFKC").toLowerCase()).toBe("i");
    // U+1D7CE Mathematical Bold 0 → NFKC → "0"
    expect("\u{1D7CE}".normalize("NFKC").toLowerCase()).toBe("0");
    // U+1D7CF Mathematical Bold 1 → NFKC → "1"
    expect("\u{1D7CF}".normalize("NFKC").toLowerCase()).toBe("1");
  });

  it("normalize() correctly handles NFKC-excluded chars end-to-end", () => {
    // Long S in a slug → normalize should produce "s", not "f"
    expect(normalize("te\u017ft")).toBe("test");
    // Fullwidth I → should become "i"
    expect(normalize("\uff29nbox")).toBe("inbox");
    // Mathematical Bold 0 → should become "0"
    expect(normalize("user\u{1D7CE}")).toBe("user0");
  });
});

// ---------------------------------------------------------------------------
// CONFUSABLE_MAP_FULL export
// ---------------------------------------------------------------------------
describe("CONFUSABLE_MAP_FULL", () => {
  it("contains all TR39 single-char mappings plus supplemental", () => {
    expect(Object.keys(CONFUSABLE_MAP_FULL).length).toBeGreaterThanOrEqual(1300);
  });

  it("is a superset of CONFUSABLE_MAP", () => {
    for (const [key, value] of Object.entries(CONFUSABLE_MAP)) {
      expect(CONFUSABLE_MAP_FULL[key]).toBe(value);
    }
  });

  it("contains NFKC-conflict entries that CONFUSABLE_MAP excludes", () => {
    // Long S: TR39 says "f" (visual), NFKC says "s" (semantic)
    expect(CONFUSABLE_MAP_FULL["\u017f"]).toBe("f");
    // Script Capital I → l
    expect(CONFUSABLE_MAP_FULL["\u2110"]).toBe("l");
    // Fraktur Capital I → l
    expect(CONFUSABLE_MAP_FULL["\u2111"]).toBe("l");
    // Roman Numeral I → l
    expect(CONFUSABLE_MAP_FULL["\u2160"]).toBe("l");
    // Fullwidth Latin Capital I → l
    expect(CONFUSABLE_MAP_FULL["\uff29"]).toBe("l");
    // Mathematical Bold Digit Zero → o
    expect(CONFUSABLE_MAP_FULL["\u{1D7CE}"]).toBe("o");
    // Mathematical Bold Digit One → l
    expect(CONFUSABLE_MAP_FULL["\u{1D7CF}"]).toBe("l");
  });

  it("contains NFKC-redundant entries (where NFKC agrees with TR39)", () => {
    // Mathematical Bold Small A → a (NFKC also maps to "a")
    expect(CONFUSABLE_MAP_FULL["\u{1D41A}"]).toBe("a");
    // Fullwidth Latin Small A → a
    expect(CONFUSABLE_MAP_FULL["\uff41"]).toBe("a");
    // Fullwidth Latin Small C → c
    expect(CONFUSABLE_MAP_FULL["\uff43"]).toBe("c");
  });

  it("contains supplemental entries (Latin small capitals)", () => {
    expect(CONFUSABLE_MAP_FULL["\u1d00"]).toBe("a");
    expect(CONFUSABLE_MAP_FULL["\u1d05"]).toBe("d");
    expect(CONFUSABLE_MAP_FULL["\u1d07"]).toBe("e");
    expect(CONFUSABLE_MAP_FULL["\u1d0a"]).toBe("j");
    expect(CONFUSABLE_MAP_FULL["\u1d0b"]).toBe("k");
    expect(CONFUSABLE_MAP_FULL["\u1d0d"]).toBe("m");
    expect(CONFUSABLE_MAP_FULL["\u1d18"]).toBe("p");
    expect(CONFUSABLE_MAP_FULL["\u1d1b"]).toBe("t");
  });

  it("all values are lowercase Latin letters or digits", () => {
    for (const value of Object.values(CONFUSABLE_MAP_FULL)) {
      expect(value).toMatch(/^[a-z0-9]$/);
    }
  });
});

// ---------------------------------------------------------------------------
// allowPurelyNumeric
// ---------------------------------------------------------------------------
describe("allowPurelyNumeric", () => {
  it("rejects purely numeric when allowPurelyNumeric is false", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources, allowPurelyNumeric: false },
      createMockAdapter({})
    );
    const result = await guard.check("123456");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("invalid");
      expect(result.message).toBe("Identifiers cannot be purely numeric.");
    }
  });

  it("rejects numeric-with-hyphens when allowPurelyNumeric is false", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources, allowPurelyNumeric: false },
      createMockAdapter({})
    );
    const result = await guard.check("12-34");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("invalid");
    }
  });

  it("allows alphanumeric identifiers even when allowPurelyNumeric is false", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources, allowPurelyNumeric: false },
      createMockAdapter({})
    );
    const result = await guard.check("abc123");
    expect(result.available).toBe(true);
  });

  it("allows purely numeric by default", async () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources },
      createMockAdapter({})
    );
    const result = await guard.check("123456");
    expect(result.available).toBe(true);
  });

  it("uses custom purelyNumeric message", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        allowPurelyNumeric: false,
        messages: { purelyNumeric: "No numbers only!" },
      },
      createMockAdapter({})
    );
    const result = await guard.check("123456");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.message).toBe("No numbers only!");
    }
  });

  it("validateFormat respects allowPurelyNumeric", () => {
    const guard = createNamespaceGuard(
      { sources: defaultSources, allowPurelyNumeric: false },
      createMockAdapter({})
    );
    expect(guard.validateFormat("123456")).toBe(
      "Identifiers cannot be purely numeric."
    );
    expect(guard.validateFormat("abc123")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Anti-spoofing integration
// ---------------------------------------------------------------------------
describe("anti-spoofing integration", () => {
  it("NFKC normalization blocks full-width reserved names", async () => {
    const guard = createNamespaceGuard(
      { reserved: ["admin"], sources: defaultSources },
      createMockAdapter({})
    );
    // Full-width "admin" → NFKC → "admin" → reserved
    const result = await guard.check(
      "\uff41\uff44\uff4d\uff49\uff4e"
    );
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("reserved");
    }
  });

  it("normalizeUnicode: false disables NFKC", async () => {
    const guard = createNamespaceGuard(
      {
        reserved: ["admin"],
        sources: defaultSources,
        normalizeUnicode: false,
        pattern: /^.{2,30}$/,
      },
      createMockAdapter({})
    );
    // Full-width "admin" without NFKC stays as full-width chars
    const result = await guard.check(
      "\uff41\uff44\uff4d\uff49\uff4e"
    );
    // Should NOT match "admin" reserved name since NFKC is off
    if (!result.available) {
      expect(result.reason).not.toBe("reserved");
    }
  });

  it("homoglyph validator works in suggestion pipeline", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { strategy: "sequential", max: 2 },
        validators: [createHomoglyphValidator()],
      },
      createMockAdapter({
        user: { sarah: { id: "u1" } },
      })
    );
    // Clean slug that is taken - suggestions should still work
    const result = await guard.check("sarah");
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// skeleton()
// ---------------------------------------------------------------------------
describe("skeleton", () => {
  it("lowercases ASCII input", () => {
    expect(skeleton("Hello")).toBe("hello");
  });

  it("passes through plain ASCII unchanged", () => {
    expect(skeleton("paypal")).toBe("paypal");
  });

  it("maps Cyrillic confusables to Latin", () => {
    // Cyrillic а (U+0430) and о (U+043E)
    expect(skeleton("\u0430\u043e")).toBe("ao");
  });

  it("maps Greek confusables to Latin", () => {
    // Greek alpha (U+03B1) and omicron (U+03BF)
    expect(skeleton("\u03b1\u03bf")).toBe("ao");
  });

  it("produces merged skeleton for mixed Latin + Cyrillic", () => {
    // p + Cyrillic а + yp + Cyrillic а + l
    expect(skeleton("p\u0430yp\u0430l")).toBe("paypal");
  });

  it("strips zero-width space (U+200B)", () => {
    expect(skeleton("pay\u200Bpal")).toBe("paypal");
  });

  it("strips ZWNJ (U+200C) and ZWJ (U+200D)", () => {
    expect(skeleton("pa\u200Cy\u200Dpal")).toBe("paypal");
  });

  it("strips soft hyphen (U+00AD)", () => {
    expect(skeleton("pay\u00ADpal")).toBe("paypal");
  });

  it("strips LRM (U+200E) and RLM (U+200F)", () => {
    expect(skeleton("pay\u200Epal\u200F")).toBe("paypal");
  });

  it("strips BOM (U+FEFF)", () => {
    expect(skeleton("\uFEFFpaypal")).toBe("paypal");
  });

  it("strips variation selectors (U+FE00-FE0F)", () => {
    expect(skeleton("a\uFE0Fb")).toBe("ab");
  });

  it("applies NFD decomposition", () => {
    // e-acute (U+00E9) decomposes to e + combining acute
    expect(skeleton("\u00e9")).toBe("e\u0301");
  });

  it("uses CONFUSABLE_MAP_FULL by default: Long S maps to f", () => {
    // Long S (U+017F) -> "f" in TR39
    expect(skeleton("\u017f")).toBe("f");
  });

  it("handles Mathematical Bold Small A (SMP char)", () => {
    // U+1D41A -> "a" in CONFUSABLE_MAP_FULL
    expect(skeleton("\u{1d41a}")).toBe("a");
  });

  it("accepts custom map option", () => {
    // With CONFUSABLE_MAP (NFKC-filtered), Long S is not in the map
    // so it stays as Long S, which lowercases to Long S (or s via NFD)
    const result = skeleton("\u017f", { map: CONFUSABLE_MAP });
    // Long S is not in CONFUSABLE_MAP, so it passes through unchanged
    // NFD of Long S is still Long S, lowercase of Long S is still Long S
    expect(result).toBe("\u017f");
  });

  it("returns empty string for empty input", () => {
    expect(skeleton("")).toBe("");
  });

  it("returns empty string for string of only ignorables", () => {
    expect(skeleton("\u200B\u200C\u200D\uFEFF")).toBe("");
  });

  it("handles SMP chars correctly in mixed input", () => {
    // Mathematical Bold Capital A (U+1D400) -> "a" in CONFUSABLE_MAP_FULL
    expect(skeleton("\u{1d400}bc")).toBe("abc");
  });

  it("works with empty custom map (no substitutions)", () => {
    expect(skeleton("\u0430\u043e", { map: {} })).toBe("\u0430\u043e");
  });

  it("handles input already in NFD form", () => {
    // Pre-decomposed e + combining acute should produce same result
    expect(skeleton("e\u0301")).toBe("e\u0301");
    expect(skeleton("\u00e9")).toBe("e\u0301");
  });

  it("strips Tag characters (U+E0000-E0FFF)", () => {
    expect(skeleton("a\u{E0001}b")).toBe("ab");
  });

  it("strips Hangul fillers (U+115F, U+1160, U+FFA0)", () => {
    expect(skeleton("a\u115Fb\u1160c\uFFA0d")).toBe("abcd");
  });

  it("handles multiple consecutive ignorables", () => {
    expect(skeleton("a\u200B\u200C\u200D\u00ADb")).toBe("ab");
  });

  it("handles Armenian confusables", () => {
    // Armenian Small Letter Ini (U+056B) -> "h" in CONFUSABLE_MAP_FULL
    const armenianH = CONFUSABLE_MAP_FULL["\u056B"];
    if (armenianH) {
      expect(skeleton("\u056B")).toBe(armenianH);
    }
  });
});

// ---------------------------------------------------------------------------
// areConfusable()
// ---------------------------------------------------------------------------
describe("areConfusable", () => {
  it("identical strings are confusable", () => {
    expect(areConfusable("hello", "hello")).toBe(true);
  });

  it("case-different strings are confusable", () => {
    expect(areConfusable("Hello", "hello")).toBe(true);
  });

  it("detects Cyrillic/Latin confusable pair", () => {
    // Cyrillic р (U+0440) looks like Latin p
    expect(areConfusable("paypal", "\u0440aypal")).toBe(true);
  });

  it("detects Greek/Latin confusable pair", () => {
    // Greek omicron (U+03BF) looks like Latin o
    expect(areConfusable("bob", "b\u03bfb")).toBe(true);
  });

  it("non-confusable strings return false", () => {
    expect(areConfusable("hello", "world")).toBe(false);
  });

  it("detects zero-width insertion as confusable", () => {
    expect(areConfusable("paypal", "pay\u200Bpal")).toBe(true);
  });

  it("passes custom map option through", () => {
    // With default (CONFUSABLE_MAP_FULL), Long S maps to "f"
    expect(areConfusable("\u017f", "f")).toBe(true);
    // With CONFUSABLE_MAP, Long S is not mapped, so not confusable with "f"
    expect(areConfusable("\u017f", "f", { map: CONFUSABLE_MAP })).toBe(false);
  });

  it("empty strings are confusable", () => {
    expect(areConfusable("", "")).toBe(true);
  });

  it("detects classic google spoofing", () => {
    // Cyrillic о (U+043E) for both o's
    expect(areConfusable("google", "g\u043e\u043egle")).toBe(true);
  });

  it("is symmetric", () => {
    expect(areConfusable("paypal", "\u0440aypal")).toBe(true);
    expect(areConfusable("\u0440aypal", "paypal")).toBe(true);
    expect(areConfusable("hello", "world")).toBe(false);
    expect(areConfusable("world", "hello")).toBe(false);
  });

  it("detects soft-hyphen insertion as confusable", () => {
    expect(areConfusable("admin", "ad\u00ADmin")).toBe(true);
  });

  it("detects BOM-prefixed string as confusable", () => {
    expect(areConfusable("test", "\uFEFFtest")).toBe(true);
  });

  it("treats different scripts as non-confusable when no mapping exists", () => {
    // CJK character has no confusable mapping to Latin
    expect(areConfusable("hello", "\u4e16\u754c")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// confusableDistance()
// ---------------------------------------------------------------------------
describe("confusableDistance", () => {
  it("returns zero distance for identical strings", () => {
    const result = confusableDistance("paypal", "paypal");
    expect(result.distance).toBe(0);
    expect(result.similarity).toBe(1);
    expect(result.chainDepth).toBe(0);
    expect(result.skeletonEqual).toBe(true);
  });

  it("captures cross-script confusable substitutions", () => {
    const result = confusableDistance("paypal", "\u0440\u0430ypal"); // Cyrillic р, а
    expect(result.skeletonEqual).toBe(true);
    expect(result.crossScriptCount).toBeGreaterThanOrEqual(2);
    expect(result.chainDepth).toBeGreaterThanOrEqual(2);
    expect(result.distance).toBeGreaterThan(0);
    expect(result.distance).toBeLessThan(1.5);
  });

  it("treats default-ignorable insertions as low-cost edits", () => {
    const result = confusableDistance("paypal", "pay\u200Bpal");
    expect(result.skeletonEqual).toBe(true);
    expect(result.ignorableCount).toBeGreaterThanOrEqual(1);
    expect(result.distance).toBeLessThan(0.2);
    expect(result.similarity).toBeGreaterThan(0.95);
  });

  it("tracks NFKC/TR39 divergence signals for Long S", () => {
    const result = confusableDistance("\u017f", "f");
    expect(result.skeletonEqual).toBe(true);
    expect(result.divergenceCount).toBeGreaterThanOrEqual(1);
    expect(result.chainDepth).toBeGreaterThanOrEqual(1);
  });

  it("supports map overrides for NFKC-first pipelines", () => {
    const result = confusableDistance("\u017f", "f", { map: CONFUSABLE_MAP });
    expect(result.skeletonEqual).toBe(false);
    expect(result.divergenceCount).toBe(0);
    expect(result.distance).toBeGreaterThanOrEqual(1);
  });

  describe("with visual weights", () => {
    // Minimal weight graph for testing
    const testWeights = {
      // Cyrillic а -> Latin a: TR39 pair with measured low cost
      "\u0430": { a: { danger: 1, stableDanger: 1, cost: 0, xidContinue: true, idnaPvalid: true } },
      // Novel pair not in TR39: Gothic giba (U+10332) -> x
      "\ud800\udf32": { x: { danger: 0.94, stableDanger: 0.88, cost: 0.12, xidContinue: true } },
      // A pair only valid in identifiers, not domains
      "\u0261": { g: { danger: 1, stableDanger: 0.8, cost: 0.2, xidContinue: true, idnaPvalid: false } },
    };

    it("uses measured cost for TR39 pairs when weights are provided", () => {
      // Without weights: hardcoded 0.35 base + 0.2 cross-script = 0.55
      const without = confusableDistance("\u0430", "a");
      // With weights: measured cost 0 + 0.2 cross-script = 0.2
      const withW = confusableDistance("\u0430", "a", { weights: testWeights });
      expect(withW.distance).toBeLessThan(without.distance);
      expect(withW.skeletonEqual).toBe(true);
    });

    it("recognizes novel pairs via visual-weight reason", () => {
      // Without weights: Gothic U+10332 vs x = cost 1 (unknown pair)
      const without = confusableDistance("\ud800\udf32", "x");
      expect(without.distance).toBeGreaterThanOrEqual(1);
      // With weights: uses measured cost 0.12
      const withW = confusableDistance("\ud800\udf32", "x", { weights: testWeights });
      expect(withW.distance).toBeLessThan(1);
      const visualStep = withW.steps.find(s => s.reason === "visual-weight");
      expect(visualStep).toBeDefined();
      expect(visualStep!.cost).toBe(0.12);
    });

    it("falls back to hardcoded cost when weight is missing", () => {
      // Pair not in weights: should behave exactly like no-weights
      const without = confusableDistance("paypal", "\u0440\u0430ypal");
      const withW = confusableDistance("paypal", "\u0440\u0430ypal", { weights: testWeights });
      // Cyrillic а has a weight, but р does not, so р still uses hardcoded
      // Both should have same skeleton equality
      expect(withW.skeletonEqual).toBe(without.skeletonEqual);
    });

    it("returns identical results when weights are empty", () => {
      const without = confusableDistance("paypal", "\u0440\u0430ypal");
      const withEmpty = confusableDistance("paypal", "\u0440\u0430ypal", { weights: {} });
      expect(withEmpty.distance).toBe(without.distance);
      expect(withEmpty.similarity).toBe(without.similarity);
    });

    it("filters by identifier context", () => {
      // With 'identifier' context, xidContinue=true weights apply
      const result = confusableDistance("\u0261", "g", {
        weights: testWeights,
        context: "identifier",
      });
      expect(result.distance).toBeLessThan(1);
    });

    it("filters by domain context", () => {
      // With 'domain' context, idnaPvalid=false weight is skipped
      const result = confusableDistance("\u0261", "g", {
        weights: testWeights,
        context: "domain",
      });
      // ɡ (U+0261) maps to 'g' via TR39 so confusable-substitution still fires
      // but the weight has idnaPvalid=false so measured cost is NOT used
      expect(result.distance).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// NFKC/TR39 divergence vectors
// ---------------------------------------------------------------------------
describe("NFKC/TR39 divergence vectors", () => {
  it("exports a stable built-in divergence corpus", () => {
    expect(NFKC_TR39_DIVERGENCE_VECTORS.length).toBeGreaterThanOrEqual(30);
    const longS = NFKC_TR39_DIVERGENCE_VECTORS.find(
      (row) => row.codePoint === "U+017F"
    );
    expect(longS).toBeDefined();
    expect(longS?.tr39).toBe("f");
    expect(longS?.nfkc).toBe("s");
  });

  it("derives no divergences from the NFKC-filtered map", () => {
    const filtered = deriveNfkcTr39DivergenceVectors(CONFUSABLE_MAP);
    expect(filtered).toHaveLength(0);
  });

  it("keeps divergence vectors sorted by code point", () => {
    const cps = NFKC_TR39_DIVERGENCE_VECTORS.map((row) =>
      Number.parseInt(row.codePoint.slice(2), 16)
    );
    const sorted = [...cps].sort((a, b) => a - b);
    expect(cps).toEqual(sorted);
  });

  it("exports the named composability suite aliases", () => {
    expect(COMPOSABILITY_VECTOR_SUITE).toBe("nfkc-tr39-divergence-v1");
    expect(COMPOSABILITY_VECTORS_COUNT).toBe(COMPOSABILITY_VECTORS.length);
    expect(COMPOSABILITY_VECTORS).toEqual(NFKC_TR39_DIVERGENCE_VECTORS);
  });
});

// ---------------------------------------------------------------------------
// checkRisk()
// ---------------------------------------------------------------------------
describe("checkRisk", () => {
  const guard = createNamespaceGuard(
    {
      reserved: ["admin", "support", "paypal"],
      sources: defaultSources,
    },
    createMockAdapter({})
  );

  it("blocks exact protected target matches", () => {
    const result = guard.checkRisk("admin");
    expect(result.score).toBe(100);
    expect(result.action).toBe("block");
    expect(result.level).toBe("high");
    expect(result.matches[0]?.target).toBe("admin");
  });

  it("flags confusable spoofing against protected targets", () => {
    const result = guard.checkRisk("\u0440\u0430ypal", { protect: ["paypal"] });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.action).toBe("block");
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].target).toBe("paypal");
    expect(result.matches[0].skeletonEqual).toBe(true);
    expect(result.reasons.some((r) => r.code === "confusable-target")).toBe(true);
  });

  it("warns on invisible-character insertion with threshold control", () => {
    const result = guard.checkRisk("pay\u200Bpal", {
      protect: ["paypal"],
      warnThreshold: 40,
      blockThreshold: 85,
    });
    expect(result.action).toBe("block");
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.reasons.some((r) => r.code === "invisible-character")).toBe(true);
  });

  it("can disable reserved-name inclusion in protected targets", () => {
    const enabled = guard.checkRisk("adm\u0456n"); // Cyrillic і
    const disabled = guard.checkRisk("adm\u0456n", { includeReserved: false });
    expect(enabled.matches.some((m) => m.target === "admin")).toBe(true);
    expect(disabled.matches.some((m) => m.target === "admin")).toBe(false);
  });

  it("respects custom policy thresholds", () => {
    const strict = guard.checkRisk("paypa1", {
      protect: ["paypal"],
      warnThreshold: 30,
      blockThreshold: 60,
    });
    const lenient = guard.checkRisk("paypa1", {
      protect: ["paypal"],
      warnThreshold: 90,
      blockThreshold: 98,
    });

    expect(strict.action === "warn" || strict.action === "block").toBe(true);
    expect(lenient.action).toBe("allow");
  });
});

// ---------------------------------------------------------------------------
// enforceRisk()
// ---------------------------------------------------------------------------
describe("enforceRisk", () => {
  const guard = createNamespaceGuard(
    {
      reserved: ["admin", "paypal"],
      sources: defaultSources,
    },
    createMockAdapter({})
  );

  it("allows non-block identifiers under default fail mode", () => {
    const result = guard.enforceRisk("teamspace", { protect: ["paypal"] });
    expect(result.allowed).toBe(true);
    expect(result.action === "allow" || result.action === "warn").toBe(true);
  });

  it("denies block-level identifiers by default", () => {
    const result = guard.enforceRisk("\u0440\u0430ypal", { protect: ["paypal"] });
    expect(result.allowed).toBe(false);
    expect(result.action).toBe("block");
    expect(result.message).toContain("protected name");
  });

  it("can fail on warn-level identifiers", () => {
    const result = guard.enforceRisk("paypa1", {
      protect: ["paypal"],
      warnThreshold: 70,
      blockThreshold: 95,
      failOn: "warn",
    });
    expect(result.action).toBe("warn");
    expect(result.allowed).toBe(false);
  });

  it("supports custom deny messages", () => {
    const result = guard.enforceRisk("\u0440\u0430ypal", {
      protect: ["paypal"],
      messages: { block: "Use a less-confusable handle." },
    });
    expect(result.allowed).toBe(false);
    expect(result.message).toBe("Use a less-confusable handle.");
  });
});

// ---------------------------------------------------------------------------
// createNamespaceGuardWithProfile()
// ---------------------------------------------------------------------------
describe("createNamespaceGuardWithProfile", () => {
  it("applies profile defaults for normalization and numeric policy", async () => {
    const guard = createNamespaceGuardWithProfile(
      "consumer-handle",
      {
        sources: defaultSources,
      },
      createMockAdapter({})
    );

    // consumer-handle profile defaults to allowPurelyNumeric: false
    const numeric = await guard.check("1234");
    expect(numeric.available).toBe(false);
    if (!numeric.available) {
      expect(numeric.reason).toBe("invalid");
    }
  });

  it("uses profile risk defaults when checkRisk options are omitted", () => {
    const guard = createNamespaceGuardWithProfile(
      "developer-id",
      {
        reserved: ["paypal"],
        sources: defaultSources,
      },
      createMockAdapter({})
    );

    const result = guard.checkRisk("paypa1", { protect: ["paypal"] });
    expect(result.score).toBeGreaterThanOrEqual(NAMESPACE_PROFILES["developer-id"].risk.warnThreshold);
    expect(result.action === "warn" || result.action === "block").toBe(true);
  });

  it("allows explicit config to override profile defaults", async () => {
    const guard = createNamespaceGuardWithProfile(
      "consumer-handle",
      {
        sources: defaultSources,
        allowPurelyNumeric: true,
      },
      createMockAdapter({})
    );

    const numeric = await guard.check("1234");
    expect(numeric.available).toBe(true);
  });
});
