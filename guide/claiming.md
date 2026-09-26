# Claiming names

Checking that a name is free and then saving it are two separate steps, and someone else can take the name between them. This page covers `claim()`, which does both, and the unique index that makes it safe.

## Why checking first isn't enough

Two people submit `sarah` a few milliseconds apart. Both checks run before either write, so both are told the name is free, and both writes go ahead. Without a unique index you now have two users called `sarah`. With one, the database refuses the second write, and your code gets an error it has to turn into a message.

You need both halves:

- a unique index on the name's canonical form, so the database refuses a duplicate whatever your code does
- `claim()`, which checks the name, runs your write, and turns the database's refusal into an ordinary "taken" result

The check still earns its place. It gives a clear reason for a name that is invalid, reserved or passes for a protected name, and it saves a write that would fail.

## Claim a name

`guard.claim(name, write, options?)` runs the same checks as `assertClaimable()`, then calls `write` with the name's canonical form. Store that value: it's trimmed, NFKC-normalised and lowercase, so `Sarah`, ` sarah ` and `ｓａｒａｈ` all give `sarah`.

```ts run
// A stand-in for a users table with a unique index on handle_canonical
const handles = new Set(["sarah"]);
const adapter = { findOne: async (source, value) => (handles.has(value) ? { id: "u1" } : null) };
const insertUser = async (canonical) => {
  if (handles.has(canonical)) throw Object.assign(new Error("duplicate key"), { code: "23505" });
  handles.add(canonical);
  return { id: "u2", handleCanonical: canonical };
};

const guard = createNamespaceGuardWithProfile("consumer-handle", {
  reserved: ["admin"],
  sources: [{ name: "user", column: "handle_canonical", scopeKey: "id" }],
}, adapter);

await guard.claim("  Tom ", insertUser); // → { claimed: true, normalized: "tom", value: { id: "u2", handleCanonical: "tom" } }
await guard.claim("sarah", insertUser);  // → { claimed: false, reason: "unavailable", message: "That name is already in use." }
await guard.claim("admin", insertUser);  // → { claimed: false, message: "That name is reserved. Try another one." }
```

The result has one of two shapes:

| Field | Claimed | Not claimed |
|---|---|---|
| `claimed` | `true` | `false` |
| `normalized` | the canonical form | the canonical form |
| `value` | what your write returned | not set |
| `reason` | not set | always `"unavailable"` |
| `message` | not set | a message you can show |

`reason` is `"unavailable"` whatever the cause: a bad format, a reserved name, a validator, a taken name, a lookalike of a protected name, or a write that lost the race. The message says which. `claim()` doesn't generate suggestions; to offer some after a refusal, call `check()` for the same name (see [Suggestions](suggestions.md)).

### When the write loses the race

If your write throws, `claim()` asks whether the error is a unique-constraint violation. If it is, you get `claimed: false` with the same message as a taken name, or your `takenMessage`. Any other error is thrown again, so a lost connection isn't reported as a taken name.

```ts run
const adapter = { findOne: async () => null }; // the check sees a free name
const guard = createNamespaceGuardWithProfile("consumer-handle", {
  sources: [{ name: "user", column: "handle_canonical" }],
}, adapter);

// Someone else's insert landed first, so this one fails on the unique index
const lostTheRace = async () => { throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" }); };
const offline = async () => { throw new Error("connection refused"); };

(await guard.claim("zoe", lostTheRace)).message; // → "That name is already in use."
(await guard.claim("zoe", lostTheRace, { takenMessage: "Someone took that name a moment ago." })).message; // → "Someone took that name a moment ago."
await guard.claim("zoe", offline).catch((e) => e.message); // → "connection refused"
```

### Options

| Option | Default | What it does |
|---|---|---|
| `scope` | none | the owner's IDs, so they can keep their own name (see [below](#let-people-keep-their-own-name)) |
| `isUniqueViolation` | `isLikelyUniqueViolationError` | decides whether a write error means the name was taken |
| `takenMessage` | "That name is already in use." | the message when the write loses the race |
| `failOn`, `messages`, `protect` and the other risk options | as for `enforceRisk()` | how lookalikes of protected names are treated; see [Protect names](protect-names.md) |

> **Note** `claim()` and `assertClaimable()` also refuse names that pass for a protected name. If you haven't set `risk.protect`, they protect a built-in list, `DEFAULT_PROTECTED_TOKENS`: `admin`, `administrator`, `support`, `help`, `security`, `billing`, `payments`, `staff`, `moderator`, `root`, `system`, `api`, `www`, `mail` and `login`. Setting `risk.protect` replaces that list. Lookalikes of your reserved names are refused too, unless you set `includeReserved: false`.

## Store a canonical column

Keep two columns: the name as the person typed it, for display, and its canonical form, for uniqueness. Put a unique index on the canonical column and point the source's `column` at it.

```ts title="In your app"
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handleCanonical", scopeKey: "id" }],
}, createPrismaAdapter(prisma));

const result = await guard.claim(input.handle, (canonical) =>
  prisma.user.create({ data: { handle: input.handle, handleCanonical: canonical } })
);
if (!result.claimed) return { error: result.message };
```

The guard looks names up by their canonical form. If the column holds names as typed, a lookup for `sarah` misses a stored `Sarah`, and a unique index on it lets both in. On the canonical column an exact match finds it, and the index refuses the duplicate.

The canonical form is `normalize(raw)`. If you set `normalizeUnicode: false`, it's `normalize(raw, { unicode: false })`. The value `claim()` passes to your write always matches the guard's settings, so prefer it.

### Add it to an existing table

1. Add the canonical column, allowing nulls.
2. Write it on every create and update: the value `claim()` passes to your write, or `normalize(raw)`.
3. Backfill existing rows in batches with `normalize()`.
4. Find names that collide once normalised, and resolve them.
5. Add the unique index, then make the column non-null.
6. Point `sources[].column` at the canonical column.

For step 4, in SQL:

```sql
SELECT handle_canonical, COUNT(*)
FROM users
GROUP BY handle_canonical
HAVING COUNT(*) > 1;
```

Or run `npx namespace-guard audit-canonical users.json` on a JSON export of your names; see [CLI](cli.md). On PostgreSQL the whole change looks like this:

```sql
ALTER TABLE users ADD COLUMN handle_canonical text;
-- backfill from your app with normalize(), then resolve duplicates
CREATE UNIQUE INDEX users_handle_canonical_uidx ON users (handle_canonical);
ALTER TABLE users ALTER COLUMN handle_canonical SET NOT NULL;
```

### Each adapter

| Adapter | Unique index on the canonical column |
|---|---|
| Prisma | `handleCanonical String? @unique`, then `prisma migrate dev` |
| Drizzle | `uniqueIndex("users_handle_canonical_uidx").on(table.handleCanonical)`, then `drizzle-kit generate` and `drizzle-kit migrate` |
| Kysely | `db.schema.createIndex("users_handle_canonical_uidx").on("users").column("handle_canonical").unique()` in a migration |
| Knex | `table.unique(["handle_canonical"])` in a migration |
| TypeORM | `@Index({ unique: true })` on the column, or a `TableIndex` with `isUnique: true` in a migration |
| MikroORM | `@Property({ unique: true })`, then `mikro-orm migration:create` |
| Sequelize | `queryInterface.addIndex("Users", ["handleCanonical"], { unique: true })` in a migration |
| Mongoose | `unique: true` on the schema path, then `Model.init()` to build the index |
| Raw SQL | `CREATE UNIQUE INDEX` on the column |

[Adapters](adapters.md) has the full setup for each.

## Names shared by several tables

When users and organisations share one namespace, each table's unique index only refuses duplicates within that table. If someone claims `acme` as a user while someone else claims it as an organisation, both checks find the name free, and both inserts succeed, one in each table.

The fix is one more table that holds every claimed name, with the canonical form as its key. Each write inserts into it, in the same transaction as the user or organisation, so whichever insert comes second fails on its key and `claim()` reports the name as taken.

```ts run
// Two tables, each unique on its own, and a stand-in for a shared names table
const users = new Set(), orgs = new Set(), names = new Set();
const adapter = { findOne: async (source, value) => ((source.name === "user" ? users : orgs).has(value) ? { id: "x" } : null) };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle_canonical" }, { name: "organization", column: "slug_canonical" }],
}, adapter);
const duplicate = () => Object.assign(new Error("duplicate key"), { code: "23505" });
const insertInto = (table, shared) => async (canonical) => {
  if (shared?.has(canonical) || table.has(canonical)) throw duplicate();
  shared?.add(canonical);
  table.add(canonical);
  return canonical;
};

// Both claims check before either writes: without the names table, both get the name
const apart = await Promise.all([guard.claim("acme", insertInto(users)), guard.claim("acme", insertInto(orgs))]);
apart.map((r) => r.claimed); // → [true, true]

// With it, the second insert fails on its key
const shared = await Promise.all([guard.claim("nova", insertInto(users, names)), guard.claim("nova", insertInto(orgs, names))]);
shared.map((r) => r.claimed); // → [true, false]
shared[1].message;            // → "That name is already in use."
```

In PostgreSQL the table needs only the name and who holds it:

```sql
CREATE TABLE names (
  canonical text PRIMARY KEY,
  kind text NOT NULL,       -- 'user' or 'organization'
  owner_id text NOT NULL
);
```

And the write inserts into both, in one transaction:

```ts title="In your app"
const result = await guard.claim(input.slug, (canonical) =>
  prisma.$transaction(async (tx) => {
    await tx.name.create({ data: { canonical, kind: "organization", ownerId: org.id } });
    return tx.organization.update({ where: { id: org.id }, data: { slug: input.slug, slugCanonical: canonical } });
  }),
  { scope: { orgId: org.id } }
);
```

On a rename, delete the old row from `names` in the same transaction, and skip the insert when the canonical form hasn't changed. When an account is deleted, you can keep its row so the name can't be reused.

## Recognise a unique violation

`claim()` uses `isLikelyUniqueViolationError(error)` unless you pass your own test. It returns `true` for:

- the codes Postgres `23505`, Prisma `P2002`, MySQL `ER_DUP_ENTRY` or errno `1062`, SQLite `SQLITE_CONSTRAINT_UNIQUE` or `SQLITE_CONSTRAINT_PRIMARYKEY` (or the plain `SQLITE_CONSTRAINT` with "unique" in the message), and MongoDB `11000`
- a message containing "duplicate key", "unique constraint", "unique violation", "already exists" or "E11000", in any case

It also looks inside `cause`, `parent`, `original` and `meta`, where ORMs keep the driver's error. Use it on its own when you write in a transaction of your own and want the same test.

```ts run
isLikelyUniqueViolationError({ code: "23505" });                                        // → true
isLikelyUniqueViolationError({ message: "Query failed", cause: { code: "23505" } });     // → true
isLikelyUniqueViolationError(new Error("E11000 duplicate key error collection: users")); // → true
isLikelyUniqueViolationError(new Error("NOT NULL constraint failed: users.handle"));    // → false
isLikelyUniqueViolationError(new Error("connection timed out"));                         // → false
```

> **Careful** A message with "already exists" in it counts, whatever it's about. If your database or ORM uses that phrase for other errors, pass `isUniqueViolation` with a test of your own: `guard.claim(name, write, { isUniqueViolation: (e) => e?.code === "23505" })`.

## Let people keep their own name

When someone saves their profile without changing their handle, the check finds their own row and says the name is taken. Pass their ID as a scope, and a row that belongs to them doesn't count.

Each source names a `scopeKey`: the key to read from the scope object. The guard compares the value under that key with the row's ID column (`idColumn`, `id` by default).

```ts run
const adapter = { findOne: async (source, value) => (value === "sarah" ? { id: "u1" } : null) };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle", scopeKey: "id" }],
}, adapter);

await guard.check("sarah");               // → { available: false, reason: "taken" }
await guard.check("sarah", { id: "u1" }); // → { available: true } (it's her own row)
await guard.check("sarah", { id: "u2" }); // → { available: false, reason: "taken" }
```

With `claim()`, the scope goes in the options, and your write should update the owner's row. The unique index doesn't object to a row keeping its own value.

```ts title="In your app"
const result = await guard.claim(
  input.handle,
  (canonical) => prisma.user.update({
    where: { id: user.id },
    data: { handle: input.handle, handleCanonical: canonical },
  }),
  { scope: { id: user.id } }
);
```

Sources can use different keys, so one scope can say who the person is in each table:

```ts run
const rows = { user: { sarah: { id: "u1" } }, organization: { acme: { id: "o1" }, sarah: { id: "o7" } } };
const adapter = { findOne: async (source, value) => rows[source.name][value] ?? null };
const guard = createNamespaceGuard({
  sources: [
    { name: "user", column: "handle", scopeKey: "userId" },
    { name: "organization", column: "slug", scopeKey: "orgId" },
  ],
}, adapter);

const scope = { userId: "u1", orgId: "o1" };
await guard.check("acme", scope);  // → { available: true } (her organisation's slug)
await guard.check("sarah", scope); // → { available: false, source: "organization" } (another organisation has it)
```

A row in a source without a `scopeKey` always counts, and a scope value that is `null`, `undefined` or empty is ignored.

## assertAvailable or assertClaimable

Both return nothing when the name is fine, and throw an `Error` with a message you can show when it isn't. They differ in what they check:

| Call | Checks | Use it for |
|---|---|---|
| `assertAvailable(name, scope?)` | format, reserved, validators, database | internal tools, or names nobody else sees |
| `assertClaimable(name, scope?, options?)` | the same, then lookalikes of protected names | handlers that throw on bad input, where you write the name yourself |
| `claim(name, write, options?)` | the same as `assertClaimable()`, then your write | the usual case, since it closes the race too |

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuardWithProfile("consumer-handle", {
  sources: [{ name: "user", column: "handle" }],
  risk: { protect: ["paypal"] },
}, adapter);

await guard.assertAvailable("paypa1").then(() => "ok");                   // → "ok"
await guard.assertClaimable("paypa1").then(() => "ok", () => "refused"); // → "refused"
```

`paypa1` is free, so `assertAvailable()` passes it. It passes for `paypal`, so `assertClaimable()` refuses it.

> **Note** `assertAvailable()` and `assertClaimable()` take the scope as their second argument. `claim()` takes it as the `scope` option.

## Check many names at once

`checkMany(names, scope?, options?)` checks a list in parallel and returns a record keyed by each name as you passed it. It runs the same checks as `check()`, so it doesn't score lookalikes of protected names.

```ts run
const adapter = { findOne: async (source, value) => (value === "sarah" ? { id: "u1" } : null) };
const guard = createNamespaceGuard({
  reserved: ["admin"],
  sources: [{ name: "user", column: "handle" }],
  suggest: {},
}, adapter);

const results = await guard.checkMany(["sarah", "admin", "new-team"]);
results.sarah;             // → { available: false, reason: "taken" }
results.admin;             // → { available: false, reason: "reserved" }
results["new-team"];       // → { available: true }
results.sarah.suggestions; // → undefined (skipped by default)
```

Suggestions are skipped unless you pass `{ skipSuggestions: false }` as the third argument, since they cost extra lookups for every taken name. Every name runs its lookups at the same time, one per source, so split a long list into chunks.

Use it for imports, for a form that creates several names at once, or to check a list before a migration.
