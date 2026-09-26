# Adapters

An adapter is how namespace-guard asks your database whether a name is in use. There is one for each of nine ORMs and query builders, each at its own import path, so your bundle carries only the one you use. The ORM is an optional peer dependency: namespace-guard uses the client you already have and installs nothing.

## Pick an adapter

| ORM | Import from | Create with | `name` is | `column` is |
|---|---|---|---|---|
| [Prisma](#prisma) | `namespace-guard/adapters/prisma` | `createPrismaAdapter(prisma)` | the model's property on the client (`user`) | the field name |
| [Drizzle](#drizzle) | `namespace-guard/adapters/drizzle` | `createDrizzleAdapter(db, tables, eq)` | the table's key in your schema (`users`) | the column's key on the table object |
| [Kysely](#kysely) | `namespace-guard/adapters/kysely` | `createKyselyAdapter(db)` | the table, as your `Database` type names it | the column, likewise |
| [Knex](#knex) | `namespace-guard/adapters/knex` | `createKnexAdapter(knex)` | the table name | the column name |
| [TypeORM](#typeorm) | `namespace-guard/adapters/typeorm` | `createTypeORMAdapter(dataSource, entities)` | the entity's key in `entities` | the entity property |
| [MikroORM](#mikroorm) | `namespace-guard/adapters/mikro-orm` | `createMikroORMAdapter(orm.em, entities)` | the entity's key in `entities` | the entity property |
| [Sequelize](#sequelize) | `namespace-guard/adapters/sequelize` | `createSequelizeAdapter(models)` | the model's key in `models` | the model attribute |
| [Mongoose](#mongoose) | `namespace-guard/adapters/mongoose` | `createMongooseAdapter(models)` | the model's key in `models` | the schema path |
| [Raw SQL](#raw-sql) | `namespace-guard/adapters/raw` | `createRawAdapter(execute)` | the table name | the column name |

The core package, `namespace-guard`, has the guard itself. You pass it the adapter:

```ts title="Any adapter"
import { createNamespaceGuardWithProfile } from "namespace-guard";

export const guard = createNamespaceGuardWithProfile("consumer-handle", {
  reserved: ["admin", "api", "settings"],
  sources: [
    { name: "user", column: "handleCanonical", scopeKey: "id" },
    { name: "organization", column: "slugCanonical", scopeKey: "id" },
  ],
}, adapter);
```

## What an adapter is asked

For each name it checks, the guard calls the adapter's `findOne(source, value, options)` once per source, in parallel. `value` is the name after normalising: trimmed, NFKC-normalised, lowercased, without a leading `@`. The adapter looks for one row whose `column` equals `value` and returns it, or `null`. It selects only the id column, never the whole row.

```ts run
const calls = [];
const adapter = {
  findOne: async (source, value, options) => {
    calls.push([source.name, source.column, value, options]);
    return null;
  },
};
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handleCanonical", scopeKey: "id" }],
  caseInsensitive: true,
}, adapter);

await guard.check("  @Sarah ");
calls[0]; // → ["user", "handleCanonical", "sarah", { caseInsensitive: true }]
```

Each source has four fields:

| Field | What it is | Default |
|---|---|---|
| `name` | how the adapter finds the table (see the table above) | required |
| `column` | the column that holds the name | required |
| `idColumn` | the primary key | `"id"` |
| `scopeKey` | the key in the ownership scope you pass to `check()` or `claim()`: a row whose `idColumn` equals `scope[scopeKey]` belongs to the caller, so it doesn't count as taken | none |

`scopeKey` names a key in the scope object, not a column. With one table, use `scopeKey: "id"` and `guard.check(name, { id: user.id })`. When two tables share the namespace, give each its own key, such as `userId` and `orgId`, and pass the ones that apply: `guard.check(name, { userId: user.id, orgId: org.id })`. The ids are compared as strings, so a numeric id matches `"42"`.

> **Note** Mongoose keeps a document's id in `_id`. When `idColumn` is unset, the Mongoose adapter looks up `_id` and returns it as `id` too, so ownership works whether or not you set `idColumn: "_id"`. (Before 0.23 it had to be set, or a person editing their own profile was told their name was taken.)

## Case-insensitive matching

The guard lowercases a name before it queries, so an exact match finds `sarah` only if the column holds `sarah`. If the column holds names as people typed them (`Sarah`), set `caseInsensitive: true` in the config, and each adapter compares without case:

| Adapter | What it sends | Also pass to the adapter |
|---|---|---|
| Prisma | `{ equals: value, mode: "insensitive" }` | |
| Drizzle | `ilike(column, value)` | `{ eq, ilike }` in place of `eq` |
| Kysely | `.where(column, "ilike", value)` | |
| Knex | `.whereRaw("LOWER(??) = LOWER(?)", [column, value])` | |
| TypeORM | `ILike(value)` | `ILike` as the third argument |
| MikroORM | `{ [column]: { $ilike: value } }` | |
| Sequelize | `where(fn("LOWER", col(column)), value.toLowerCase())` | `{ where, fn, col }` from Sequelize |
| Mongoose | the query with collation `{ locale: "en", strength: 2 }` | |
| Raw SQL | `LOWER("column") = LOWER($1)` | |

Drizzle, TypeORM and Sequelize throw if `caseInsensitive` is on and the extra argument is missing.

`ILIKE` is a PostgreSQL operator, and Prisma's `mode` works on PostgreSQL and MongoDB. On another database, check what your ORM makes of them, or store a canonical column (below): it holds the lowercase form, so an exact match is already case-insensitive and you can leave `caseInsensitive` off.

> **Note** `_` and `%` are wildcards in `ILIKE`. The adapters escape them, so if your pattern allows `_`, `a_b` finds only `a_b`, not `axb`. (Before 0.23 they didn't, and `a_b` was reported as taken when `axb` existed.)

## Store a canonical column

The setup that holds up is a second column with each name's canonical form, and a unique index on it. The guard checks that column, and the index stops two people claiming the same name at the same moment: [`claim()`](claiming.md) turns the index's error into a "taken" result. It recognises the duplicate-key errors of PostgreSQL (`23505`), MySQL (`ER_DUP_ENTRY`, errno 1062), SQLite (`SQLITE_CONSTRAINT`), Prisma (`P2002`) and MongoDB (11000), including when an ORM wraps them in `cause`, `parent`, `original` or `meta`.

On a table that already has names:

1. Look for existing names that collide once normalised: export them and run `npx namespace-guard audit-canonical users.json` (see [CLI](cli.md)). Resolve any it finds.
2. Add the canonical column, nullable, with a unique index. PostgreSQL, MySQL and SQLite let a unique index hold any number of nulls.
3. Write it on every create and update. `claim()` passes the canonical form to your write; elsewhere, use `normalize(handle)`.
4. Backfill the existing rows in batches with `normalize()`.
5. Make the column required.
6. Point `column` in your sources at it.

```ts title="Writing both columns"
import { normalize } from "namespace-guard";

// In claim(), the canonical form is passed to your write
await guard.claim(input.handle, (canonical) =>
  db.user.create({ data: { handle: input.handle, handleCanonical: canonical } }),
);

// Anywhere else a handle changes
await db.user.update({
  where: { id },
  data: { handle: input.handle, handleCanonical: normalize(input.handle) },
});
```

Keep `handle` for display. Each section below shows the migration for that ORM and the source that points at the new column.

## Prisma

```ts title="Prisma"
import { createPrismaAdapter } from "namespace-guard/adapters/prisma";
import { prisma } from "./db"; // your PrismaClient

const adapter = createPrismaAdapter(prisma);
```

`name` is the model's property on the client: model `User` is `prisma.user`, so `name: "user"`. `column` is the field name in your schema, not a `@map`ped database name. The adapter calls `findFirst` with a `select` of the id and scope fields. For `caseInsensitive` it adds `mode: "insensitive"`, which Prisma supports on PostgreSQL and MongoDB.

**Canonical column.**

```prisma title="schema.prisma"
model User {
  id              String  @id @default(cuid())
  handle          String
  handleCanonical String? @unique
}
```

```bash
npx prisma migrate dev --name add_handle_canonical
```

After the backfill, change `String?` to `String` and migrate again. Then use `{ name: "user", column: "handleCanonical", scopeKey: "id" }`.

## Drizzle

```ts title="Drizzle"
import { eq } from "drizzle-orm";
import { createDrizzleAdapter } from "namespace-guard/adapters/drizzle";
import { db } from "./db"; // drizzle(client, { schema })
import { users, organizations } from "./schema";

const adapter = createDrizzleAdapter(db, { users, organizations }, eq);
```

The adapter uses Drizzle's relational queries (`db.query.users.findFirst`), so create the client with your schema: `drizzle(client, { schema })`. `name` is the table's key in both `db.query` and the tables object you pass (`users`). `column` is the key on the table object (`handleCanonical`), not the SQL name (`handle_canonical`). If `db.query` or the tables object has no such table, or the table has no such column, the adapter throws an error that names it.

For `caseInsensitive`, pass `{ eq, ilike }` from `drizzle-orm` as the third argument.

**Canonical column.**

```ts title="schema.ts"
import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  handle: text("handle").notNull(),
  handleCanonical: text("handle_canonical"),
}, (table) => [uniqueIndex("users_handle_canonical_uidx").on(table.handleCanonical)]);
```

```bash
npx drizzle-kit generate --name add-handle-canonical
npx drizzle-kit migrate
```

After the backfill, add `.notNull()` and generate again. Then use `{ name: "users", column: "handleCanonical", scopeKey: "id" }`.

## Kysely

```ts title="Kysely"
import { createKyselyAdapter } from "namespace-guard/adapters/kysely";
import { db } from "./db"; // your Kysely<Database>

const adapter = createKyselyAdapter(db);
```

`name` and `column` are the table and column as your `Database` type names them. The adapter runs `selectFrom(name).select([...]).where(column, "=", value).limit(1).executeTakeFirst()`. For `caseInsensitive` it uses the `ilike` operator, which is PostgreSQL's.

**Canonical column.**

```ts title="Migration"
import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("users").addColumn("handle_canonical", "varchar(255)").execute();
  await db.schema.createIndex("users_handle_canonical_uidx")
    .on("users").column("handle_canonical").unique().execute();
}
```

After the backfill, add `NOT NULL` in a second migration. Then use `{ name: "users", column: "handle_canonical", scopeKey: "id" }`.

## Knex

```ts title="Knex"
import knex from "knex";
import { createKnexAdapter } from "namespace-guard/adapters/knex";

const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
const adapter = createKnexAdapter(db);
```

`name` and `column` are the table and column names. The adapter runs `knex(name).select([...]).where(column, value).first()`. For `caseInsensitive` it uses `LOWER()` on both sides, which works on any database Knex supports.

**Canonical column.**

```ts title="Migration"
export async function up(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.string("handle_canonical", 255);
    table.unique(["handle_canonical"], { indexName: "users_handle_canonical_uidx" });
  });
}
```

After the backfill, make it `.notNullable().alter()` in a second migration. Then use `{ name: "users", column: "handle_canonical", scopeKey: "id" }`.

## TypeORM

```ts title="TypeORM"
import { createTypeORMAdapter } from "namespace-guard/adapters/typeorm";
import { dataSource } from "./data-source";
import { User, Organization } from "./entities";

const adapter = createTypeORMAdapter(dataSource, { user: User, organization: Organization });
```

`name` is the entity's key in the object you pass (`user`), and `column` is the entity property (`handleCanonical`), not the column's database name. The adapter calls `dataSource.getRepository(entity).findOne({ where, select })`. For `caseInsensitive`, pass TypeORM's `ILike` as the third argument: `createTypeORMAdapter(dataSource, entities, ILike)`.

**Canonical column.**

```ts title="Entity"
import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("user")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255 })
  handle!: string;

  @Index("IDX_user_handle_canonical_unique", { unique: true })
  @Column({ name: "handle_canonical", type: "varchar", length: 255, nullable: true })
  handleCanonical!: string | null;
}
```

Generate a migration from the entity with the TypeORM CLI, or write one with `queryRunner.addColumn()` and `queryRunner.createIndex()`. After the backfill, drop `nullable: true` and migrate again. Then use `{ name: "user", column: "handleCanonical", scopeKey: "id" }`.

## MikroORM

```ts title="MikroORM"
import { createMikroORMAdapter } from "namespace-guard/adapters/mikro-orm";
import { orm } from "./db"; // await MikroORM.init(config)
import { User, Organization } from "./entities";

const adapter = createMikroORMAdapter(orm.em, { user: User, organization: Organization });
```

`name` is the entity's key in the object you pass, and `column` is the entity property. The adapter calls `em.findOne(entity, { [column]: value }, { fields })`. For `caseInsensitive` it uses `$ilike`.

MikroORM refuses queries on its global `EntityManager` outside a request context. Pass `orm.em` and run requests inside `RequestContext` (MikroORM's middleware does this), and the adapter's queries go to that request's fork.

**Canonical column.**

```ts title="Entity"
import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity()
export class User {
  @PrimaryKey()
  id!: string;

  @Property()
  handle!: string;

  @Property({ fieldName: "handle_canonical", length: 255, nullable: true, unique: true })
  handleCanonical?: string;
}
```

```bash
npx mikro-orm migration:create
npx mikro-orm migration:up
```

After the backfill, drop `nullable: true` and create another migration. Then use `{ name: "user", column: "handleCanonical", scopeKey: "id" }`.

## Sequelize

```ts title="Sequelize"
import { Sequelize } from "sequelize";
import { createSequelizeAdapter } from "namespace-guard/adapters/sequelize";
import { User, Organization } from "./models";

const adapter = createSequelizeAdapter({ user: User, organization: Organization });

// With caseInsensitive: true, pass Sequelize's helpers too
const insensitive = createSequelizeAdapter(
  { user: User, organization: Organization },
  { where: Sequelize.where, fn: Sequelize.fn, col: Sequelize.col },
);
```

`name` is the model's key in the object you pass, and `column` is the model attribute. The adapter calls `Model.findOne({ where, attributes, raw: true })`. The case-insensitive query goes through `Sequelize.col()`, which takes the database column name: if your model maps the attribute to another field (`underscored: true`), that query needs the field name.

**Canonical column.**

```ts title="Migration"
export async function up(queryInterface, Sequelize) {
  await queryInterface.addColumn("Users", "handleCanonical", {
    type: Sequelize.DataTypes.STRING(255),
    allowNull: true,
  });
  await queryInterface.addIndex("Users", ["handleCanonical"], {
    name: "users_handle_canonical_uidx",
    unique: true,
  });
}
```

Add `handleCanonical` to the model definition too. After the backfill, set `allowNull: false` with `changeColumn`. Then use `{ name: "user", column: "handleCanonical", scopeKey: "id" }`.

## Mongoose

```ts title="Mongoose"
import { createMongooseAdapter } from "namespace-guard/adapters/mongoose";
import { User, Organization } from "./models";

const adapter = createMongooseAdapter({ user: User, organization: Organization });

// Sources: idColumn defaults to _id for this adapter
const sources = [
  { name: "user", column: "handleCanonical", idColumn: "_id", scopeKey: "_id" },
  { name: "organization", column: "slugCanonical", idColumn: "_id", scopeKey: "_id" },
];
```

`name` is the model's key in the object you pass, and `column` is the schema path. The adapter calls `Model.findOne(conditions, projection).lean()`. For `caseInsensitive` it adds the collation `{ locale: "en", strength: 2 }`, which compares without case. Pass the scope as a string: `{ _id: String(user._id) }`.

**Canonical column.** A MongoDB unique index counts a missing field as null, and allows only one, so limit the index to documents that have the field until the backfill is done:

```ts title="Schema"
import { Schema, model } from "mongoose";

const userSchema = new Schema({
  handle: { type: String, required: true },
  handleCanonical: { type: String },
});
userSchema.index(
  { handleCanonical: 1 },
  { unique: true, partialFilterExpression: { handleCanonical: { $type: "string" } } },
);

export const User = model("User", userSchema);
```

Build the index with `await User.createIndexes()`. After the backfill, add `required: true` to `handleCanonical`.

## Raw SQL

```ts title="PostgreSQL (pg)"
import { Pool } from "pg";
import { createRawAdapter } from "namespace-guard/adapters/raw";

const pool = new Pool();
const adapter = createRawAdapter((sql, params) => pool.query(sql, params));
```

You pass a function that runs a query and resolves to `{ rows }`. `name` and `column` are the table and column names. The adapter writes PostgreSQL SQL, with double-quoted identifiers and `$1` placeholders:

```sql
SELECT "id" FROM "users" WHERE "handle_canonical" = $1 LIMIT 1
-- with caseInsensitive
SELECT "id" FROM "users" WHERE LOWER("handle") = LOWER($1) LIMIT 1
```

Table and column names must be letters, digits and underscores, not starting with a digit; anything else throws before a query runs. That rules out a schema prefix (`public.users`): set the schema with `search_path`, or write your own adapter. Quoted names are case-sensitive in PostgreSQL, so `name: "Users"` finds only a table created as `"Users"`.

For MySQL and SQLite, translate the placeholders in your function:

```ts title="MySQL (mysql2)"
import mysql from "mysql2/promise";
import { createRawAdapter } from "namespace-guard/adapters/raw";

const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
const adapter = createRawAdapter(async (sql, params) => {
  // $1 to ?, and "name" to `name`
  const [rows] = await pool.execute(sql.replace(/\$\d+/g, "?").replace(/"/g, "`"), params);
  return { rows: rows as Record<string, unknown>[] };
});
```

```ts title="SQLite (better-sqlite3)"
import Database from "better-sqlite3";
import { createRawAdapter } from "namespace-guard/adapters/raw";

const db = new Database("app.db");
const adapter = createRawAdapter(async (sql, params) => {
  // $1 to ?; SQLite accepts double-quoted names as they are
  return { rows: db.prepare(sql.replace(/\$\d+/g, "?")).all(...params) as Record<string, unknown>[] };
});
```

**Canonical column** (PostgreSQL):

```sql
ALTER TABLE users ADD COLUMN handle_canonical text;
CREATE UNIQUE INDEX users_handle_canonical_uidx ON users (handle_canonical);
-- backfill from application code with normalize(), then:
ALTER TABLE users ALTER COLUMN handle_canonical SET NOT NULL;
```

Then use `{ name: "users", column: "handle_canonical", scopeKey: "id" }`.

## Write your own adapter

An adapter is an object with one method. Write one for a database or client without a built-in adapter, or to query something other than a table: a search index, a list of names held by another service.

```ts title="As namespace-guard declares it"
type NamespaceAdapter = {
  findOne: (
    source: NamespaceSource,
    value: string,
    options?: FindOneOptions,
  ) => Promise<Record<string, unknown> | null>;
};

type FindOneOptions = { caseInsensitive?: boolean };
```

Import the types to type yours: `import type { NamespaceAdapter } from "namespace-guard"`.

What `findOne` has to do:

- Find one record in the place `source.name` stands for, whose `source.column` equals `value`. `value` is already normalised.
- Return `null` if there isn't one. Return the record if there is, with at least its `source.idColumn` (default `"id"`) so the guard can check ownership.
- Compare without case when `options.caseInsensitive` is true. The guard passes it when the config sets `caseInsensitive: true`.
- Throw only for real failures. The error reaches whoever called `check()` or `claim()`; the guard doesn't catch it.

This one keeps names in memory, and runs on this page:

```ts run
const tables = {
  user: [{ id: "u1", handle: "sarah" }],
  organization: [{ id: "o1", slug: "acme" }],
};

const memoryAdapter = {
  async findOne(source, value, options) {
    const same = options?.caseInsensitive
      ? (stored) => String(stored).toLowerCase() === value.toLowerCase()
      : (stored) => stored === value;
    const row = (tables[source.name] ?? []).find((r) => same(r[source.column]));
    if (!row) return null;
    const id = source.idColumn ?? "id";
    return { [id]: row[id] };
  },
};

const guard = createNamespaceGuard({
  sources: [
    { name: "user", column: "handle", scopeKey: "id" },
    { name: "organization", column: "slug", scopeKey: "id" },
  ],
}, memoryAdapter);

await guard.check("acme");                // → { available: false, reason: "taken", source: "organization" }
await guard.check("sarah", { id: "u1" }); // → { available: true }
await guard.check("sarah", { id: "u2" }); // → { available: false, reason: "taken", source: "user" }
await guard.check("new-name");            // → { available: true }
```

## Cache lookups

While someone types a name, the same lookups repeat. The `cache` option keeps each adapter result in memory for a while:

```ts run
let queries = 0;
const adapter = { findOne: async () => { queries++; return null; } };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle", scopeKey: "id" }],
  cache: { ttl: 5000, maxSize: 1000 },
}, adapter);

await guard.check("sarah");
await guard.check("sarah");
await guard.check("Sarah");  // the same name once normalised
queries;                     // → 1
guard.cacheStats();          // → { size: 1, hits: 2, misses: 1 }
guard.clearCache();
guard.cacheStats();          // → { size: 0, hits: 0, misses: 0 }
```

| Option | What it does | Default |
|---|---|---|
| `ttl` | how long a result is kept, in milliseconds | `5000` |
| `maxSize` | how many results are kept; past this, the least recently used goes first | `1000` |

`cache: {}` turns it on with the defaults. Each result is keyed by source, name and whether the query was case-insensitive. `clearCache()` empties the cache and resets the counts; `cacheStats()` returns `{ size, hits, misses }`, all zero when the cache is off.

Things to know before you turn it on:

- The cache lives in the guard's memory. Each server process, and each serverless instance, has its own.
- `claim()` checks through the cache too, so a name claimed elsewhere in the last `ttl` milliseconds can still look free. The unique index on your canonical column is what catches that; don't rely on the cache without one.
- A lookup that fails is cached like one that succeeds: for `ttl` milliseconds, the same name gets the same error. Call `clearCache()` after a database error if you retry straight away.
- Call `clearCache()` after your own writes if you show `check()` results straight after them.
