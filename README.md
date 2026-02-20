# namespace-guard

[![npm version](https://img.shields.io/npm/v/namespace-guard.svg)](https://www.npmjs.com/package/namespace-guard)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**[Live Demo](https://paultendo.github.io/namespace-guard/)** — try it in your browser

**Check slug/handle uniqueness across multiple database tables with reserved name protection.**

Perfect for multi-tenant apps where usernames, organization slugs, and reserved routes all share one URL namespace - like Twitter (`@username`), GitHub (`github.com/username`), or any SaaS with vanity URLs.

## The Problem

You have a URL structure like `yourapp.com/:slug` that could be:
- A user profile (`/sarah`)
- An organization (`/acme-corp`)
- A reserved route (`/settings`, `/admin`, `/api`)

When someone signs up or creates an org, you need to check that their chosen slug:
1. Isn't already taken by another user
2. Isn't already taken by an organization
3. Isn't a reserved system route
4. Follows your naming rules

This library handles all of that in one call.

## Installation

```bash
npm install namespace-guard
```

## Quick Start

```typescript
import { createNamespaceGuard } from "namespace-guard";
import { createPrismaAdapter } from "namespace-guard/adapters/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Define your namespace rules once
const guard = createNamespaceGuard(
  {
    reserved: ["admin", "api", "settings", "dashboard", "login", "signup"],
    sources: [
      { name: "user", column: "handle", scopeKey: "id" },
      { name: "organization", column: "slug", scopeKey: "id" },
    ],
  },
  createPrismaAdapter(prisma)
);

// Check if a slug is available
const result = await guard.check("acme-corp");

if (result.available) {
  // Create the org
} else {
  // Show error: result.message
  // e.g., "That name is reserved." or "That name is already in use."
}
```

## Why namespace-guard?

| Feature | namespace-guard | DIY Solution |
|---------|-----------------|--------------|
| Multi-table uniqueness | One call | Multiple queries |
| Reserved name blocking | Built-in with categories | Manual list checking |
| Ownership scoping | No false positives on self-update | Easy to forget |
| Format validation | Configurable regex | Scattered validation |
| Conflict suggestions | Auto-suggest alternatives | Not built |
| Async validators | Custom hooks (profanity, etc.) | Manual wiring |
| Batch checking | `checkMany()` | Loop it yourself |
| ORM agnostic | Prisma, Drizzle, Kysely, Knex, raw SQL | Tied to your ORM |
| CLI | `npx namespace-guard check` | None |

## Adapters

### Prisma

```typescript
import { PrismaClient } from "@prisma/client";
import { createPrismaAdapter } from "namespace-guard/adapters/prisma";

const prisma = new PrismaClient();
const adapter = createPrismaAdapter(prisma);
```

### Drizzle

```typescript
import { eq } from "drizzle-orm";
import { createDrizzleAdapter } from "namespace-guard/adapters/drizzle";
import { db } from "./db";
import { users, organizations } from "./schema";

const adapter = createDrizzleAdapter(db, { users, organizations }, eq);
```

### Kysely

```typescript
import { Kysely, PostgresDialect } from "kysely";
import { createKyselyAdapter } from "namespace-guard/adapters/kysely";

const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
const adapter = createKyselyAdapter(db);
```

### Knex

```typescript
import Knex from "knex";
import { createKnexAdapter } from "namespace-guard/adapters/knex";

const knex = Knex({ client: "pg", connection: process.env.DATABASE_URL });
const adapter = createKnexAdapter(knex);
```

### Raw SQL (pg, mysql2, etc.)

```typescript
import { Pool } from "pg";
import { createRawAdapter } from "namespace-guard/adapters/raw";

const pool = new Pool();
const adapter = createRawAdapter((sql, params) => pool.query(sql, params));
```

## Configuration

```typescript
const guard = createNamespaceGuard({
  // Reserved names - flat list, Set, or categorized
  reserved: new Set([
    "admin",
    "api",
    "settings",
    "dashboard",
    "login",
    "signup",
    "help",
    "support",
    "billing",
  ]),

  // Data sources to check for collisions
  // Queries run in parallel for speed
  sources: [
    {
      name: "user",           // Prisma model / Drizzle table / SQL table name
      column: "handle",       // Column containing the slug/handle
      idColumn: "id",         // Primary key column (default: "id")
      scopeKey: "id",         // Key for ownership checks (see below)
    },
    {
      name: "organization",
      column: "slug",
      scopeKey: "id",
    },
    {
      name: "team",
      column: "slug",
      scopeKey: "id",
    },
  ],

  // Validation pattern (default: /^[a-z0-9][a-z0-9-]{1,29}$/)
  // This default requires: 2-30 chars, lowercase alphanumeric + hyphens, can't start with hyphen
  pattern: /^[a-z0-9][a-z0-9-]{2,39}$/,

  // Custom error messages
  messages: {
    invalid: "Use 3-40 lowercase letters, numbers, or hyphens.",
    reserved: "That name is reserved. Please choose another.",
    taken: (sourceName) => `That name is already taken.`,
  },
}, adapter);
```

## Reserved Name Categories

Group reserved names by category with different error messages:

```typescript
const guard = createNamespaceGuard({
  reserved: {
    system: ["admin", "api", "settings", "dashboard"],
    brand: ["oncor", "bandcamp"],
    offensive: ["..."],
  },
  sources: [/* ... */],
  messages: {
    reserved: {
      system: "That's a system route.",
      brand: "That's a protected brand name.",
      offensive: "That name is not allowed.",
    },
  },
}, adapter);

const result = await guard.check("admin");
// { available: false, reason: "reserved", category: "system", message: "That's a system route." }
```

You can also use a single string message for all categories, or mix — categories without a specific message fall back to the default.

## Async Validators

Add custom async checks that run after format/reserved validation but before database queries:

```typescript
const guard = createNamespaceGuard({
  sources: [/* ... */],
  validators: [
    async (identifier) => {
      if (await isProfane(identifier)) {
        return { available: false, message: "That name is not allowed." };
      }
      return null; // pass
    },
    async (identifier) => {
      if (await isTrademarkViolation(identifier)) {
        return { available: false, message: "That name is trademarked." };
      }
      return null;
    },
  ],
}, adapter);
```

Validators run sequentially and stop at the first rejection. They receive the normalized identifier.

## Conflict Suggestions

When a slug is taken, automatically suggest available alternatives:

```typescript
const guard = createNamespaceGuard({
  sources: [/* ... */],
  suggest: {
    // Optional: custom generator (default appends -1 through -9)
    generate: (identifier) => [
      `${identifier}-1`,
      `${identifier}-2`,
      `${identifier}-io`,
      `${identifier}-app`,
      `${identifier}-hq`,
    ],
    // Optional: max suggestions to return (default: 3)
    max: 3,
  },
}, adapter);

const result = await guard.check("acme-corp");
// {
//   available: false,
//   reason: "taken",
//   message: "That name is already in use.",
//   source: "organization",
//   suggestions: ["acme-corp-1", "acme-corp-2", "acme-corp-io"]
// }
```

Suggestions are verified against format, reserved names, and database collisions. Only available suggestions are returned.

## Batch Checking

Check multiple identifiers at once:

```typescript
const results = await guard.checkMany(["sarah", "admin", "acme-corp"]);
// {
//   sarah: { available: true },
//   admin: { available: false, reason: "reserved", ... },
//   "acme-corp": { available: false, reason: "taken", ... }
// }
```

All checks run in parallel. Accepts an optional scope parameter.

## Ownership Scoping

When users update their own slug, you don't want a false "already taken" error:

```typescript
// User with ID "user_123" wants to change handle from "sarah" to "sarah-dev"
// Without scoping, this would error because "sarah-dev" != their current handle

// Pass their ID to exclude their own record from collision detection
const result = await guard.check("sarah-dev", { id: "user_123" });
// Available (unless another user/org has it)
```

The scope object keys map to `scopeKey` in your source config. This lets you check multiple ownership types:

```typescript
// Check if a user OR their org owns this slug
const result = await guard.check("acme", {
  userId: currentUser.id,
  orgId: currentOrg.id,
});
```

## CLI

Validate slugs from the command line:

```bash
# Format + reserved name checking (no database needed)
npx namespace-guard check acme-corp
# ✓ acme-corp is available

npx namespace-guard check admin
# ✗ admin — That name is reserved. Try another one.

npx namespace-guard check "a"
# ✗ a — Use 2-30 lowercase letters, numbers, or hyphens.
```

### With a config file

Create `namespace-guard.config.json`:

```json
{
  "reserved": ["admin", "api", "settings", "dashboard"],
  "pattern": "^[a-z0-9][a-z0-9-]{2,39}$",
  "sources": [
    { "name": "users", "column": "handle" },
    { "name": "organizations", "column": "slug" }
  ]
}
```

Or with categorized reserved names:

```json
{
  "reserved": {
    "system": ["admin", "api", "settings"],
    "brand": ["oncor"]
  }
}
```

```bash
npx namespace-guard check sarah --config ./my-config.json
```

### With database checking

```bash
npx namespace-guard check sarah --database-url postgres://localhost/mydb
```

Requires `pg` to be installed (`npm install pg`).

Exit code 0 = available, 1 = unavailable.

## API Reference

### `createNamespaceGuard(config, adapter)`

Creates a guard instance with your configuration and database adapter.

**Returns:** `NamespaceGuard` instance

---

### `guard.check(identifier, scope?)`

Check if an identifier is available.

**Parameters:**
- `identifier` - The slug/handle to check
- `scope` - Optional ownership scope to exclude own records

**Returns:**
```typescript
// Available
{ available: true }

// Not available
{
  available: false,
  reason: "invalid" | "reserved" | "taken",
  message: string,
  source?: string,       // Which table caused the collision (reason: "taken")
  category?: string,     // Reserved name category (reason: "reserved")
  suggestions?: string[] // Available alternatives (reason: "taken", requires suggest config)
}
```

---

### `guard.checkMany(identifiers, scope?)`

Check multiple identifiers in parallel.

**Returns:** `Record<string, CheckResult>`

---

### `guard.assertAvailable(identifier, scope?)`

Same as `check()`, but throws an `Error` if not available.

---

### `guard.validateFormat(identifier)`

Validate format only (no database queries).

**Returns:** Error message string if invalid, `null` if valid.

---

### `normalize(identifier)`

Utility function to normalize identifiers. Trims whitespace, lowercases, and strips leading `@` symbols.

```typescript
import { normalize } from "namespace-guard";

normalize("  @Sarah  "); // "sarah"
normalize("ACME-Corp"); // "acme-corp"
```

## Real-World Example

Here's how you might use this in a signup flow:

```typescript
// In your API route / server action
async function createUser(handle: string, email: string) {
  // Normalize first
  const normalizedHandle = guard.normalize(handle);

  // Check availability (will also validate format)
  const result = await guard.check(normalizedHandle);

  if (!result.available) {
    return { error: result.message };
  }

  // Safe to create
  const user = await prisma.user.create({
    data: { handle: normalizedHandle, email },
  });

  return { user };
}
```

Or in an update flow with ownership scoping:

```typescript
async function updateUserHandle(userId: string, newHandle: string) {
  const normalized = guard.normalize(newHandle);

  // Pass userId to avoid collision with own current handle
  const result = await guard.check(normalized, { id: userId });

  if (!result.available) {
    return { error: result.message };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { handle: normalized },
  });

  return { success: true };
}
```

## TypeScript

Full TypeScript support with exported types:

```typescript
import type {
  NamespaceConfig,
  NamespaceSource,
  NamespaceAdapter,
  NamespaceGuard,
  CheckResult,
  OwnershipScope,
} from "namespace-guard";
```

## Support

If you find this useful, consider supporting the project:

- [GitHub Sponsors](https://github.com/sponsors/paultendo)
- [Buy me a coffee](https://buymeacoffee.com/paultendo)

## Contributing

Contributions welcome! Please open an issue first to discuss what you'd like to change.

## License

MIT © [Paul Wood FRSA (@paultendo)](https://github.com/paultendo)
