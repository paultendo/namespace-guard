# namespace-guard

[![npm version](https://img.shields.io/npm/v/namespace-guard.svg)](https://www.npmjs.com/package/namespace-guard)
[![bundle size](https://img.shields.io/bundlephobia/minzip/namespace-guard)](https://bundlephobia.com/package/namespace-guard)
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
| ORM agnostic | Prisma, Drizzle, Kysely, Knex, TypeORM, MikroORM, Sequelize, Mongoose, raw SQL | Tied to your ORM |
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

### TypeORM

```typescript
import { DataSource } from "typeorm";
import { createTypeORMAdapter } from "namespace-guard/adapters/typeorm";
import { User, Organization } from "./entities";

const dataSource = new DataSource({ /* ... */ });
const adapter = createTypeORMAdapter(dataSource, { user: User, organization: Organization });
```

### MikroORM

```typescript
import { MikroORM } from "@mikro-orm/core";
import { createMikroORMAdapter } from "namespace-guard/adapters/mikro-orm";
import { User, Organization } from "./entities";

const orm = await MikroORM.init(config);
const adapter = createMikroORMAdapter(orm.em, { user: User, organization: Organization });
```

### Sequelize

```typescript
import { createSequelizeAdapter } from "namespace-guard/adapters/sequelize";
import { User, Organization } from "./models";

const adapter = createSequelizeAdapter({ user: User, organization: Organization });
```

### Mongoose

```typescript
import { createMongooseAdapter } from "namespace-guard/adapters/mongoose";
import { User, Organization } from "./models";

// Note: Mongoose sources typically use idColumn: "_id"
const adapter = createMongooseAdapter({ user: User, organization: Organization });
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

### Built-in Profanity Validator

Use `createProfanityValidator` for a turnkey profanity filter — supply your own word list:

```typescript
import { createNamespaceGuard, createProfanityValidator } from "namespace-guard";

const guard = createNamespaceGuard({
  sources: [/* ... */],
  validators: [
    createProfanityValidator(["badword", "offensive", "slur"], {
      message: "Please choose an appropriate name.", // optional custom message
      checkSubstrings: true,                         // default: true
    }),
  ],
}, adapter);
```

No words are bundled — use any word list you like (e.g., the `bad-words` npm package, your own list, or an external API wrapped in a custom validator).

## Conflict Suggestions

When a slug is taken, automatically suggest available alternatives using pluggable strategies:

```typescript
const guard = createNamespaceGuard({
  sources: [/* ... */],
  suggest: {
    // Named strategy (default: ["sequential", "random-digits"])
    strategy: "suffix-words",
    // Max suggestions to return (default: 3)
    max: 3,
  },
}, adapter);

const result = await guard.check("acme-corp");
// {
//   available: false,
//   reason: "taken",
//   message: "That name is already in use.",
//   source: "organization",
//   suggestions: ["acme-corp-dev", "acme-corp-io", "acme-corp-app"]
// }
```

### Built-in Strategies

| Strategy | Example Output | Description |
|----------|---------------|-------------|
| `"sequential"` | `sarah-1`, `sarah1`, `sarah-2` | Hyphenated and compact numeric suffixes |
| `"random-digits"` | `sarah-4821`, `sarah-1037` | Random 3-4 digit suffixes |
| `"suffix-words"` | `sarah-dev`, `sarah-hq`, `sarah-app` | Common word suffixes |
| `"short-random"` | `sarah-x7k`, `sarah-m2p` | Short 3-char alphanumeric suffixes |
| `"scramble"` | `asrah`, `sarha` | Adjacent character transpositions |
| `"similar"` | `sara`, `darah`, `thesarah` | Edit-distance-1 mutations (deletions, keyboard-adjacent substitutions, prefix/suffix) |

### Composing Strategies

Combine multiple strategies — candidates are interleaved round-robin:

```typescript
suggest: {
  strategy: ["random-digits", "suffix-words"],
  max: 4,
}
// → ["sarah-4821", "sarah-dev", "sarah-1037", "sarah-io"]
```

### Custom Strategy Function

Pass a function that returns candidate slugs:

```typescript
suggest: {
  strategy: (identifier) => [
    `${identifier}-io`,
    `${identifier}-app`,
    `the-real-${identifier}`,
  ],
}
```

Suggestions are verified against format, reserved names, validators, and database collisions using an optimized three-phase pipeline. Only available suggestions are returned.

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

## Case-Insensitive Matching

By default, slug lookups are case-sensitive. Enable case-insensitive matching to catch collisions regardless of stored casing:

```typescript
const guard = createNamespaceGuard({
  sources: [/* ... */],
  caseInsensitive: true,
}, adapter);
```

Each adapter handles this differently:
- **Prisma**: Uses `mode: "insensitive"` on the where clause
- **Drizzle**: Uses `ilike` instead of `eq` (pass `ilike` to the adapter: `createDrizzleAdapter(db, tables, { eq, ilike })`)
- **Kysely**: Uses `ilike` operator
- **Knex**: Uses `LOWER()` in a raw where clause
- **TypeORM**: Uses `ILike` (pass it to the adapter: `createTypeORMAdapter(dataSource, entities, ILike)`)
- **MikroORM**: Uses `$ilike` operator
- **Sequelize**: Uses `LOWER()` via Sequelize helpers (pass `{ where: Sequelize.where, fn: Sequelize.fn, col: Sequelize.col }`)
- **Mongoose**: Uses collation `{ locale: "en", strength: 2 }`
- **Raw SQL**: Wraps both sides in `LOWER()`

## Caching

Enable in-memory caching to reduce database calls during rapid checks (e.g., live form validation, suggestion generation):

```typescript
const guard = createNamespaceGuard({
  sources: [/* ... */],
  cache: {
    ttl: 5000, // milliseconds (default: 5000)
  },
}, adapter);

// Manually clear the cache after writes
guard.clearCache();

// Monitor cache performance
const stats = guard.cacheStats();
// { size: 12, hits: 48, misses: 12 }
```

## Framework Integration

### Next.js (Server Actions)

```typescript
// lib/guard.ts
import { createNamespaceGuard } from "namespace-guard";
import { createPrismaAdapter } from "namespace-guard/adapters/prisma";
import { prisma } from "./db";

export const guard = createNamespaceGuard({
  reserved: ["admin", "api", "settings"],
  sources: [
    { name: "user", column: "handle", scopeKey: "id" },
    { name: "organization", column: "slug", scopeKey: "id" },
  ],
  suggest: {},
}, createPrismaAdapter(prisma));

// app/signup/actions.ts
"use server";

import { guard } from "@/lib/guard";

export async function checkHandle(handle: string) {
  return guard.check(handle);
}

export async function createUser(handle: string, email: string) {
  const result = await guard.check(handle);
  if (!result.available) return { error: result.message };

  const user = await prisma.user.create({
    data: { handle: guard.normalize(handle), email },
  });
  return { user };
}
```

### Express Middleware

```typescript
import express from "express";
import { guard } from "./lib/guard";

const app = express();

// Reusable middleware
function validateSlug(req, res, next) {
  const slug = req.body.handle || req.body.slug;
  if (!slug) return res.status(400).json({ error: "Slug is required" });

  guard.check(slug, { id: req.user?.id }).then((result) => {
    if (!result.available) return res.status(409).json(result);
    req.normalizedSlug = guard.normalize(slug);
    next();
  });
}

app.post("/api/users", validateSlug, async (req, res) => {
  const user = await db.user.create({ handle: req.normalizedSlug, ... });
  res.json({ user });
});
```

### tRPC

```typescript
import { z } from "zod";
import { router, protectedProcedure } from "./trpc";
import { guard } from "./lib/guard";

export const namespaceRouter = router({
  check: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input, ctx }) => {
      return guard.check(input.slug, { id: ctx.user.id });
    }),

  claim: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await guard.assertAvailable(input.slug, { id: ctx.user.id });
      return ctx.db.user.update({
        where: { id: ctx.user.id },
        data: { handle: guard.normalize(input.slug) },
      });
    }),
});
```

## TypeScript

Full TypeScript support with exported types:

```typescript
import {
  createNamespaceGuard,
  createProfanityValidator,
  normalize,
  type NamespaceConfig,
  type NamespaceSource,
  type NamespaceAdapter,
  type NamespaceGuard,
  type CheckResult,
  type FindOneOptions,
  type OwnershipScope,
  type SuggestStrategyName,
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
