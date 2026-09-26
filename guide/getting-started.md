# Getting started

Install namespace-guard, tell it where your names live, and check a name. This page takes about five minutes.

## Install

```bash
npm install namespace-guard
```

It has no dependencies and runs anywhere JavaScript does: Node, Bun, Deno, edge runtimes and the browser.

## Make three decisions

**Which kind of name.** A profile sets sensible defaults for length, characters and numbers. Pick the closest and override what you need.

| Profile | For | Length | Numbers only |
|---|---|---|---|
| `consumer-handle` | public usernames | 2 to 30 | refused |
| `org-slug` | team and workspace URLs | 2 to 40 | refused |
| `developer-id` | package names, internal IDs | 2 to 50 | allowed |

**Where names live.** Every table that shares the namespace: if `yourapp.com/acme` could be a user or an organisation, both tables are sources, and a name must be free in all of them.

**What to protect.** Names that nobody should be able to imitate: your brand, your staff, your biggest customers. namespace-guard refuses names that pass for these, such as `rnicrosoft` for `microsoft`.

## Check a name

This example uses a stand-in adapter so it runs on this page; in your app you pass your ORM's adapter instead (see [Adapters](adapters.md)).

```ts run
import { createNamespaceGuardWithProfile } from "namespace-guard";

// A stand-in for your database: one user called sarah
const adapter = { findOne: async (source, value) => (value === "sarah" ? { id: "u1" } : null) };

const guard = createNamespaceGuardWithProfile("consumer-handle", {
  reserved: ["admin", "api", "settings", "login", "help"],
  sources: [
    { name: "user", column: "handle", scopeKey: "id" },
    { name: "organization", column: "slug", scopeKey: "id" },
  ],
  risk: { protect: ["microsoft", "paypal"] },
}, adapter);

await guard.check("my-new-app");      // → { available: true }
await guard.check("sarah");           // → { available: false, reason: "taken" }
await guard.check("admin");           // → { available: false, reason: "reserved" }
await guard.check("a");               // → { available: false, reason: "invalid" }
```

`check()` answers whether a name is free. It doesn't score lookalikes of your protected names, because that's a judgement you may want to show differently. `assertClaimable()` does both, and throws with a message you can show:

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuardWithProfile("consumer-handle", {
  sources: [{ name: "user", column: "handle", scopeKey: "id" }],
  risk: { protect: ["microsoft", "paypal"] },
}, adapter);

const blocked = await guard.assertClaimable("rnicrosoft").then(() => "claimable", (e) => e.message);
blocked;   // → "Identifier is too confusable with a protected name. Closest protected target: \"microsoft\"."
await guard.assertClaimable("my-new-app").then(() => "claimable"); // → "claimable"
```

## Claim it

Checking and then writing leaves a gap in which someone else can take the name. `claim()` checks, runs your write, and turns a unique-constraint error from your database into a clean "taken" result:

```ts title="In your app"
const result = await guard.claim(input.handle, async (canonical) => {
  return prisma.user.create({ data: { handle: input.handle, handleCanonical: canonical } });
});

if (!result.claimed) return { error: result.message };
```

`canonical` is the form to store and index: lowercase, NFKC-normalised. With a unique index on it, two people can't end up with `Sarah` and `sarah`. [Claiming names](claiming.md) covers this in full.

## Add the Unicode checks

The profiles only accept lowercase ASCII, which already refuses most tricks. If you allow Unicode names, or want a second layer in case the pattern changes, add the validators:

```ts title="In your app"
import {
  createNamespaceGuardWithProfile,
  createHomoglyphValidator,
  createInvisibleCharacterValidator,
} from "namespace-guard";

const guard = createNamespaceGuardWithProfile("consumer-handle", {
  sources: [/* ... */],
  validators: [
    createInvisibleCharacterValidator(),                   // zero-width joiners, direction overrides
    createHomoglyphValidator({ rejectMixedScript: true }), // аdmin with a Cyrillic а
  ],
}, adapter);
```

## Next

- [How a name is checked](how-it-works.md): the order of the checks, and which call runs which.
- [Protect names](protect-names.md): what counts as passing for a protected name, and how to tune it.
- [Adapters](adapters.md): Prisma, Drizzle, Kysely, Knex, TypeORM, MikroORM, Sequelize, Mongoose and raw SQL.
