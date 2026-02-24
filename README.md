# namespace-guard

[![npm version](https://img.shields.io/npm/v/namespace-guard.svg)](https://www.npmjs.com/package/namespace-guard)
[![bundle size](https://img.shields.io/bundlephobia/minzip/namespace-guard)](https://bundlephobia.com/package/namespace-guard)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**[Live Demo](https://paultendo.github.io/namespace-guard/)** - try it in your browser | **[Blog Post](https://paultendo.github.io/posts/namespace-guard-launch/)** - why this exists

**Check slug/handle claimability across multiple database tables, with reserved-name and anti-spoofing protection.**

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
5. Isn't confusable with protected names (anti-impersonation)

This library handles all of that in one guard call.

## Installation

```bash
npm install namespace-guard
```

## Quick Start

```typescript
import { createNamespaceGuardWithProfile } from "namespace-guard";
import { createPrismaAdapter } from "namespace-guard/adapters/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// One-liner-ready guard with practical defaults
const guard = createNamespaceGuardWithProfile(
  "consumer-handle",
  {
    reserved: ["admin", "api", "settings", "dashboard", "login", "signup"],
    sources: [
      { name: "user", column: "handle", scopeKey: "id" },
      { name: "organization", column: "slug", scopeKey: "id" },
    ],
  },
  createPrismaAdapter(prisma)
);

// One-liner: format/reserved/taken + anti-spoofing policy
await guard.assertClaimable("acme-corp");
// throws on failure, otherwise safe to create
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
| CLI | `check`, `risk`, `calibrate`, `recommend`, `drift` | None |

## Adapters

### Prisma

```typescript
import { PrismaClient } from "@prisma/client";
import { createPrismaAdapter } from "namespace-guard/adapters/prisma";

const prisma = new PrismaClient();
const adapter = createPrismaAdapter(prisma);
```

### Drizzle

> **Note:** The Drizzle adapter uses `db.query` (the relational query API). Make sure your Drizzle client is set up with `drizzle(client, { schema })` so that `db.query.<tableName>` is available.

```typescript
import { eq } from "drizzle-orm";
import { createDrizzleAdapter } from "namespace-guard/adapters/drizzle";
import { db } from "./db";
import { users, organizations } from "./schema";

// Pass eq directly, or use { eq, ilike } for case-insensitive support
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

### Raw SQL (pg, mysql2, better-sqlite3, etc.)

The raw adapter generates PostgreSQL-style SQL (`$1` placeholders, double-quoted identifiers). For pg this works directly. For MySQL or SQLite, translate the parameter syntax in your executor wrapper.

```typescript
import { Pool } from "pg";
import { createRawAdapter } from "namespace-guard/adapters/raw";

const pool = new Pool();
const adapter = createRawAdapter((sql, params) => pool.query(sql, params));
```

**MySQL2 wrapper** (translates `$1` to `?` and `"col"` to `` `col` ``):

```typescript
import mysql from "mysql2/promise";
import { createRawAdapter } from "namespace-guard/adapters/raw";

const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
const adapter = createRawAdapter(async (sql, params) => {
  const mysqlSql = sql.replace(/\$\d+/g, "?").replace(/"/g, "`");
  const [rows] = await pool.execute(mysqlSql, params);
  return { rows: rows as Record<string, unknown>[] };
});
```

**better-sqlite3 wrapper** (translates `$1` to `?` and strips identifier quotes):

```typescript
import Database from "better-sqlite3";
import { createRawAdapter } from "namespace-guard/adapters/raw";

const db = new Database("app.db");
const adapter = createRawAdapter(async (sql, params) => {
  const sqliteSql = sql.replace(/\$\d+/g, "?").replace(/"/g, "");
  const rows = db.prepare(sqliteSql).all(...params);
  return { rows: rows as Record<string, unknown>[] };
});
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

You can also use a single string message for all categories, or mix - categories without a specific message fall back to the default.

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

Use `createProfanityValidator` for a turnkey profanity filter - supply your own word list:

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

No words are bundled - use any word list you like (e.g., the `bad-words` npm package, your own list, or an external API wrapped in a custom validator).

### Built-in Homoglyph Validator

Prevent spoofing attacks where visually similar characters from any Unicode script are substituted for Latin letters (e.g., Cyrillic "а" for Latin "a" in "admin"). Note: with the default ASCII-only pattern (`[a-z0-9-]`), non-Latin characters are already rejected by the format check. The homoglyph validator is most useful when your `pattern` allows Unicode characters, or as defense-in-depth alongside `rejectMixedScript`:

```typescript
import { createNamespaceGuard, createHomoglyphValidator } from "namespace-guard";

const guard = createNamespaceGuard({
  sources: [/* ... */],
  validators: [
    createHomoglyphValidator(),
  ],
}, adapter);
```

Options:

```typescript
createHomoglyphValidator({
  message: "Custom rejection message.",       // optional
  additionalMappings: { "\u0261": "g" },      // extend the built-in map
  rejectMixedScript: true,                    // also reject Latin + non-Latin script mixing
})
```

The built-in `CONFUSABLE_MAP` contains 613 character pairs generated from [Unicode TR39 confusables.txt](https://unicode.org/reports/tr39/) plus supplemental Latin small capitals. It covers Cyrillic, Greek, Armenian, Cherokee, IPA, Coptic, Lisu, Canadian Syllabics, Georgian, and 20+ other scripts. The map is exported for inspection or extension, and is regenerable for new Unicode versions with `npx tsx scripts/generate-confusables.ts`.

#### CONFUSABLE_MAP_FULL

For standalone use without NFKC normalization, `CONFUSABLE_MAP_FULL` (~1,400 entries) includes every single-character-to-Latin mapping from TR39 with no NFKC filtering. This is the right map when your pipeline does not run NFKC before confusable detection, which is the case for most real-world systems: TR39's skeleton algorithm uses NFD, Chromium's IDN spoof checker uses NFD, Rust's `confusable_idents` lint runs on NFC, and django-registration applies the confusable map to raw input with no normalization at all.

```typescript
import { CONFUSABLE_MAP_FULL } from "namespace-guard";

// Contains everything in CONFUSABLE_MAP, plus:
// - ~766 entries where NFKC agrees with TR39 (mathematical alphanumerics, fullwidth forms)
// - 31 entries where TR39 and NFKC disagree on the target letter
CONFUSABLE_MAP_FULL["\u017f"]; // "f" (Long S: TR39 visual mapping)
CONFUSABLE_MAP_FULL["\u{1D41A}"]; // "a" (Mathematical Bold Small A)
```

#### `skeleton()` and `areConfusable()`

The TR39 Section 4 skeleton algorithm computes a normalized form of a string for confusable comparison. Two strings that look alike will produce the same skeleton. This is the same algorithm used by ICU's SpoofChecker, Chromium's IDN spoof checker, and the Rust compiler's `confusable_idents` lint.

```typescript
import { skeleton, areConfusable, CONFUSABLE_MAP } from "namespace-guard";

// Compute skeletons for comparison
skeleton("paypal");           // "paypal"
skeleton("\u0440\u0430ypal"); // "paypal" (Cyrillic р and а)
skeleton("pay\u200Bpal");     // "paypal" (zero-width space stripped)
skeleton("\u017f");            // "f"      (Long S via TR39 visual mapping)

// Compare two strings directly
areConfusable("paypal", "\u0440\u0430ypal"); // true
areConfusable("google", "g\u043e\u043egle"); // true  (Cyrillic о)
areConfusable("hello", "world");             // false

// Use CONFUSABLE_MAP for NFKC-first pipelines
skeleton("\u017f", { map: CONFUSABLE_MAP }); // "\u017f" (Long S not in filtered map)
```

By default, `skeleton()` uses `CONFUSABLE_MAP_FULL` (the complete TR39 map), which matches the NFD-based pipeline specified by TR39. Pass `{ map: CONFUSABLE_MAP }` if your pipeline runs NFKC normalization before calling `skeleton()`.

### How the anti-spoofing pipeline works

Most confusable-detection libraries apply a character map in isolation. namespace-guard uses a three-stage pipeline where each stage is aware of the others:

```
Input  →  NFKC normalize  →  Confusable map  →  Mixed-script reject
           (stage 1)          (stage 2)           (stage 3)
```

**Stage 1: NFKC normalization** collapses full-width characters (`Ｉ` → `I`), ligatures (`ﬁ` → `fi`), superscripts, and other Unicode compatibility forms to their canonical equivalents. This runs first, before any confusable check.

**Stage 2: Confusable map** catches characters that survive NFKC but visually mimic Latin letters - Cyrillic `а` for `a`, Greek `ο` for `o`, Cherokee `Ꭺ` for `A`, and 600+ others from the Unicode Consortium's [confusables.txt](https://unicode.org/Public/security/latest/confusables.txt).

**Stage 3: Mixed-script rejection** (`rejectMixedScript: true`) blocks identifiers that mix Latin with non-Latin scripts (Hebrew, Arabic, Devanagari, Thai, Georgian, Ethiopic, etc.) even if the specific characters aren't in the confusable map. This catches novel homoglyphs that the map doesn't cover.

#### Why NFKC-aware filtering matters

The key insight: TR39's confusables.txt and NFKC normalization sometimes disagree. For example, Unicode says capital `I` (U+0049) is confusable with lowercase `l` - visually true in many fonts. But NFKC maps Mathematical Bold `𝐈` (U+1D408) to `I`, not `l`. If you naively ship the TR39 mapping (`𝐈` → `l`), the confusable check will never see that character - NFKC already converted it to `I` in stage 1.

We found 31 entries where this happens:

| Character | TR39 says | NFKC says | Winner |
|-----------|-----------|-----------|--------|
| `ſ` Long S (U+017F) | `f` | `s` | NFKC (`s` is correct) |
| `Ⅰ` Roman Numeral I (U+2160) | `l` | `i` | NFKC (`i` is correct) |
| `Ｉ` Fullwidth I (U+FF29) | `l` | `i` | NFKC (`i` is correct) |
| `𝟎` Math Bold 0 (U+1D7CE) | `o` | `0` | NFKC (`0` is correct) |
| 11 Mathematical I variants | `l` | `i` | NFKC |
| 12 Mathematical 0/1 variants | `o`/`l` | `0`/`1` | NFKC |

These entries are unreachable in any pipeline that runs NFKC first - NFKC has already transformed the character before the confusable map sees it. In a non-NFKC pipeline (which is what TR39 specifies), these entries are correct visual judgments. The generate script (`scripts/generate-confusables.ts`) produces both `CONFUSABLE_MAP` (NFKC-filtered) and `CONFUSABLE_MAP_FULL` (unfiltered) so you can match the map to your normalization strategy.

## Unicode Normalization

By default, `normalize()` applies [NFKC normalization](https://unicode.org/reports/tr15/) before lowercasing. This collapses full-width characters, ligatures, superscripts, and other Unicode compatibility forms to their canonical equivalents:

```typescript
normalize("ｈｅｌｌｏ");  // "hello" (full-width → ASCII)
normalize("\ufb01nance"); // "finance" (ﬁ ligature → fi)
```

NFKC is a no-op for ASCII input and matches what ENS, GitHub, and Unicode IDNA standards mandate. To opt out:

```typescript
const guard = createNamespaceGuard({
  sources: [/* ... */],
  normalizeUnicode: false,
}, adapter);
```

## Rejecting Purely Numeric Identifiers

Twitter/X blocks purely numeric handles. Enable this with `allowPurelyNumeric: false`:

```typescript
const guard = createNamespaceGuard({
  sources: [/* ... */],
  allowPurelyNumeric: false,
  messages: {
    purelyNumeric: "Handles cannot be all numbers.", // optional custom message
  },
}, adapter);

await guard.check("123456"); // { available: false, reason: "invalid", message: "Handles cannot be all numbers." }
await guard.check("abc123"); // available (has letters)
```

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

Combine multiple strategies - candidates are interleaved round-robin:

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

Suggestions are verified against format, reserved names, validators, and database collisions using a progressive batched pipeline. Only available suggestions are returned.

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
# ✗ admin - That name is reserved. Try another one.

npx namespace-guard check "a"
# ✗ a - Use 2-30 lowercase letters, numbers, or hyphens.

# Risk scoring against protected targets
npx namespace-guard risk paуpal --protect paypal
# ⛔ paуpal — risk 100/100 (block)
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

### Risk command options

```bash
# Warn/block thresholds (0-100)
npx namespace-guard risk paypa1 --protect paypal --warn-threshold 45 --block-threshold 80

# Fail CI on warn or block (default fail mode is block only)
npx namespace-guard risk paypa1 --protect paypal --fail-on warn

# JSON output for automation
npx namespace-guard risk paуpal --protect paypal --json
```

### Calibrate command

Use labeled examples to recommend warn/block thresholds for your namespace:

```json
[
  { "identifier": "paуpal", "label": "malicious", "target": "paypal" },
  { "identifier": "teamspace", "label": "benign", "target": "paypal" }
]
```

```bash
npx namespace-guard calibrate ./risk-dataset.json
npx namespace-guard calibrate ./risk-dataset.json --json

# Cost-aware calibration (optimize expected harm, not just F1)
npx namespace-guard calibrate ./risk-dataset.json \
  --cost-block-benign 8 \
  --cost-warn-benign 1 \
  --cost-allow-malicious 12 \
  --cost-warn-malicious 3 \
  --malicious-prior 0.05
```

### Recommend command

Run calibration + drift together and get a ready-to-paste risk config plus CI gate command:

```bash
npx namespace-guard recommend ./risk-dataset.json
npx namespace-guard recommend ./risk-dataset.json --json
```

This is the fastest onboarding path when you already have labeled examples.  
It calibrates thresholds from your dataset, then derives CI gate budgets from the built-in NFKC/TR39 divergence corpus.

### Drift command

Quantify composability drift between TR39-full mapping (`CONFUSABLE_MAP_FULL`) and NFKC-filtered mapping (`CONFUSABLE_MAP`):

```bash
# Built-in NFKC/TR39 divergence corpus
npx namespace-guard drift

# Your own dataset (same shape as calibrate)
npx namespace-guard drift ./risk-dataset.json --json
```

### CI drift gate

Use the included drift gate script to fail CI if drift metrics exceed your budget:

```bash
# Build first so dist/cli.js exists
npm run build

# Fail when drift exceeds these limits
npm run ci:drift-gate -- \
  --max-action-flips 29 \
  --max-average-score-delta 95 \
  --max-abs-score-delta 100
```

GitHub Actions workflow is included at `.github/workflows/drift-gate.yml`.

## API Reference

### `createNamespaceGuard(config, adapter)`

Creates a guard instance with your configuration and database adapter.

**Returns:** `NamespaceGuard` instance

---

### `createNamespaceGuardWithProfile(profile, config, adapter)`

Create a guard with practical profile defaults, then apply your explicit config overrides.

Built-in profiles:
- `consumer-handle`
- `org-slug`
- `developer-id`

Each profile sets defaults for:
- `pattern`
- `normalizeUnicode`
- `allowPurelyNumeric`
- `risk` thresholds (`warnThreshold`, `blockThreshold`, etc.)

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

### `guard.checkMany(identifiers, scope?, options?)`

Check multiple identifiers in parallel. Suggestions are skipped by default for performance.

**Parameters:**
- `identifiers` - Array of slugs/handles to check
- `scope` - Optional ownership scope applied to all checks
- `options` - Optional `{ skipSuggestions?: boolean }` (default: `true`)

Pass `{ skipSuggestions: false }` to include suggestions for taken identifiers.

**Returns:** `Record<string, CheckResult>`

---

### `guard.checkRisk(identifier, options?)`

Score spoofing/confusability risk against protected targets using weighted confusable distance + chain depth.

**Parameters:**
- `identifier` - Candidate slug/handle to assess
- `options` - Optional:
  - `protect?: string[]` additional high-value targets to compare against
  - `includeReserved?: boolean` include configured reserved names as protected targets (default: `true`)
  - `warnThreshold?: number` threshold for `action: "warn"` (default: `45`)
  - `blockThreshold?: number` threshold for `action: "block"` (default: `70`)
  - `maxMatches?: number` number of top matches to return (default: `3`)
  - `map?: Record<string, string>` custom confusable map

**Returns:** `{ score, level, action, reasons, matches, ... }`

---

### `guard.enforceRisk(identifier, options?)`

Apply a deny policy on top of risk scoring.

**Options:**
- All `checkRisk` options
- `failOn?: "block" | "warn"` (`"block"` default)
- `messages?: { warn?: string; block?: string }`
- If `protect` is omitted, uses `config.risk.protect`, then falls back to `DEFAULT_PROTECTED_TOKENS`

**Returns:** `{ allowed, action, message?, risk }`

---

### `guard.assertAvailable(identifier, scope?)`

Same as `check()`, but throws an `Error` if not available.

---

### `guard.assertClaimable(identifier, scope?, options?)`

One-liner guard for production claim checks.

Runs:
- `check()` (format/reserved/validators/database)
- `enforceRisk()` (confusable risk policy)

Throws an `Error` if the identifier should not be claimed.

---

### `guard.validateFormat(identifier)`

Validate format, purely-numeric restriction, and reserved name status without querying the database.

**Returns:** Error message string if invalid or reserved, `null` if OK.

---

### `guard.validateFormatOnly(identifier)`

Validate only the identifier's format and purely-numeric restriction. Does not check reserved names or query the database. Useful for instant client-side feedback on input shape.

**Returns:** Error message string if the format is invalid, `null` if OK.

---

### `guard.normalize(identifier)`

Convenience re-export of the standalone `normalize()` function. Note: always applies NFKC normalization regardless of the guard's `normalizeUnicode` setting. Use `normalize(id, { unicode: false })` directly if you need to skip NFKC.

---

### `guard.clearCache()`

Clear the in-memory cache and reset hit/miss counters. No-op if caching is not enabled.

---

### `guard.cacheStats()`

Get cache performance statistics.

**Returns:** `{ size: number; hits: number; misses: number }`

---

### `normalize(identifier, options?)`

Utility function to normalize identifiers. Trims whitespace, applies NFKC Unicode normalization (by default), lowercases, and strips leading `@` symbols. Pass `{ unicode: false }` to skip NFKC.

```typescript
import { normalize } from "namespace-guard";

normalize("  @Sarah  "); // "sarah"
normalize("ACME-Corp"); // "acme-corp"
```

---

### `confusableDistance(a, b, options?)`

Compute weighted confusable distance between two strings.

Outputs:
- `distance` (lower means closer)
- `similarity` (`0..1`)
- `chainDepth` (number of non-trivial edit steps)
- `crossScriptCount`, `ignorableCount`, `divergenceCount`
- `steps` (explainable shortest-path operations)
- `skeletonEqual` / `normalizedEqual`

---

### `deriveNfkcTr39DivergenceVectors(map?)`

Derive the composability regression corpus: characters where TR39 mapping and NFKC lowercase disagree.

### `NFKC_TR39_DIVERGENCE_VECTORS`

Built-in divergence vectors derived from `CONFUSABLE_MAP_FULL`, useful for drift and pipeline regression tests.

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
    ttl: 5000,     // milliseconds (default: 5000)
    maxSize: 1000, // max cached entries before LRU eviction (default: 1000)
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
      await guard.assertClaimable(input.slug, { id: ctx.user.id });
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
  createNamespaceGuardWithProfile,
  createProfanityValidator,
  createHomoglyphValidator,
  skeleton,
  areConfusable,
  confusableDistance,
  deriveNfkcTr39DivergenceVectors,
  NAMESPACE_PROFILES,
  DEFAULT_PROTECTED_TOKENS,
  NFKC_TR39_DIVERGENCE_VECTORS,
  CONFUSABLE_MAP,
  CONFUSABLE_MAP_FULL,
  normalize,
  type NamespaceConfig,
  type NamespaceSource,
  type NamespaceAdapter,
  type NamespaceGuard,
  type CheckResult,
  type FindOneOptions,
  type OwnershipScope,
  type SuggestStrategyName,
  type SkeletonOptions,
  type CheckManyOptions,
  type CheckRiskOptions,
  type RiskCheckResult,
  type AssertClaimableOptions,
  type EnforceRiskOptions,
  type EnforceRiskResult,
  type RiskReason,
  type RiskMatch,
  type RiskLevel,
  type RiskAction,
  type NamespaceProfileName,
  type NamespaceProfilePreset,
  type ConfusableDistanceOptions,
  type ConfusableDistanceResult,
  type ConfusableDistanceStep,
  type NfkcTr39DivergenceVector,
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
