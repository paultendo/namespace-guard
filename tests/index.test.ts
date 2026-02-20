import { describe, it, expect, vi } from "vitest";
import {
  normalize,
  createNamespaceGuard,
  createProfanityValidator,
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

    // Pass "42" as string — should match the numeric 42 via String()
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
      expect(result.suggestions).toEqual(["sarah-1", "sarah1", "sarah-2"]);
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
        suggest: {},
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
        suggest: {},
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
    const validator = createProfanityValidator(["bad"]);
    const result = await validator("mybadname");
    expect(result).toEqual({ available: false, message: "That name is not allowed." });
  });

  it("skips substring check when checkSubstrings is false", async () => {
    const validator = createProfanityValidator(["bad"], { checkSubstrings: false });
    const result = await validator("mybadname");
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
describe("smarter default suggestions", () => {
  it("includes both hyphenated and compact variants", async () => {
    const guard = createNamespaceGuard(
      {
        sources: defaultSources,
        suggest: { max: 6 },
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
        suggest: { max: 5 },
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
});
