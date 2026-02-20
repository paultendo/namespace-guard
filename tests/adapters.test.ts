import { describe, it, expect, vi } from "vitest";
import { createPrismaAdapter } from "../src/adapters/prisma";
import { createDrizzleAdapter } from "../src/adapters/drizzle";
import { createRawAdapter } from "../src/adapters/raw";
import { createKyselyAdapter } from "../src/adapters/kysely";
import { createKnexAdapter } from "../src/adapters/knex";
import { createTypeORMAdapter } from "../src/adapters/typeorm";
import { createMikroORMAdapter } from "../src/adapters/mikro-orm";
import { createSequelizeAdapter } from "../src/adapters/sequelize";
import { createMongooseAdapter } from "../src/adapters/mongoose";
import type { NamespaceSource } from "../src/index";

// ---------------------------------------------------------------------------
// Prisma Adapter
// ---------------------------------------------------------------------------
describe("createPrismaAdapter", () => {
  const source: NamespaceSource = {
    name: "user",
    column: "handle",
    scopeKey: "id",
  };

  it("calls findFirst on the correct model", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "u1" });
    const prisma = { user: { findFirst } };

    const adapter = createPrismaAdapter(prisma);
    const result = await adapter.findOne(source, "sarah");

    expect(findFirst).toHaveBeenCalledWith({
      where: { handle: "sarah" },
      select: { id: true },
    });
    expect(result).toEqual({ id: "u1" });
  });

  it("includes scopeKey in select", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "u1", userId: "u1" });
    const prisma = { user: { findFirst } };

    const sourceWithScope: NamespaceSource = {
      name: "user",
      column: "handle",
      idColumn: "id",
      scopeKey: "userId",
    };

    const adapter = createPrismaAdapter(prisma);
    await adapter.findOne(sourceWithScope, "sarah");

    expect(findFirst).toHaveBeenCalledWith({
      where: { handle: "sarah" },
      select: { id: true, userId: true },
    });
  });

  it("returns null when no match", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = { user: { findFirst } };

    const adapter = createPrismaAdapter(prisma);
    const result = await adapter.findOne(source, "nobody");

    expect(result).toBeNull();
  });

  it("throws when model is not found", async () => {
    const prisma = {};
    const adapter = createPrismaAdapter(prisma as any);

    await expect(adapter.findOne(source, "sarah")).rejects.toThrow(
      'Prisma model "user" not found'
    );
  });

  it("uses custom idColumn", async () => {
    const findFirst = vi.fn().mockResolvedValue({ pk: "u1" });
    const prisma = { user: { findFirst } };

    const sourceCustomId: NamespaceSource = {
      name: "user",
      column: "handle",
      idColumn: "pk",
    };

    const adapter = createPrismaAdapter(prisma);
    await adapter.findOne(sourceCustomId, "sarah");

    expect(findFirst).toHaveBeenCalledWith({
      where: { handle: "sarah" },
      select: { pk: true },
    });
  });

  it("uses case-insensitive mode when option is set", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "u1" });
    const prisma = { user: { findFirst } };

    const adapter = createPrismaAdapter(prisma);
    await adapter.findOne(source, "sarah", { caseInsensitive: true });

    expect(findFirst).toHaveBeenCalledWith({
      where: { handle: { equals: "sarah", mode: "insensitive" } },
      select: { id: true },
    });
  });
});

// ---------------------------------------------------------------------------
// Drizzle Adapter
// ---------------------------------------------------------------------------
describe("createDrizzleAdapter", () => {
  const source: NamespaceSource = {
    name: "users",
    column: "handle",
    scopeKey: "id",
  };

  it("calls findFirst with eq condition", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "u1" });
    const db = { query: { users: { findFirst } } };
    const tables = { users: { handle: "handle_col_ref", id: "id_col_ref" } };
    const eq = vi.fn((col, val) => ({ eq: [col, val] }));

    const adapter = createDrizzleAdapter(db, tables, eq);
    const result = await adapter.findOne(source, "sarah");

    expect(eq).toHaveBeenCalledWith("handle_col_ref", "sarah");
    expect(findFirst).toHaveBeenCalledWith({
      where: { eq: ["handle_col_ref", "sarah"] },
      columns: { id: true },
    });
    expect(result).toEqual({ id: "u1" });
  });

  it("includes scopeKey in columns when different from idColumn", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "u1", orgId: "o1" });
    const db = { query: { users: { findFirst } } };
    const tables = { users: { handle: "handle_col_ref" } };
    const eq = vi.fn((col, val) => ({ eq: [col, val] }));

    const sourceWithScope: NamespaceSource = {
      name: "users",
      column: "handle",
      scopeKey: "orgId",
    };

    const adapter = createDrizzleAdapter(db, tables, eq);
    await adapter.findOne(sourceWithScope, "sarah");

    expect(findFirst).toHaveBeenCalledWith({
      where: { eq: ["handle_col_ref", "sarah"] },
      columns: { id: true, orgId: true },
    });
  });

  it("does not duplicate scopeKey when same as idColumn", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "u1" });
    const db = { query: { users: { findFirst } } };
    const tables = { users: { handle: "handle_col_ref" } };
    const eq = vi.fn((col, val) => ({ eq: [col, val] }));

    const sourceIdScope: NamespaceSource = {
      name: "users",
      column: "handle",
      scopeKey: "id",
    };

    const adapter = createDrizzleAdapter(db, tables, eq);
    await adapter.findOne(sourceIdScope, "sarah");

    expect(findFirst).toHaveBeenCalledWith({
      where: { eq: ["handle_col_ref", "sarah"] },
      columns: { id: true },
    });
  });

  it("returns null when no match", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const db = { query: { users: { findFirst } } };
    const tables = { users: { handle: "handle_col_ref" } };
    const eq = vi.fn();

    const adapter = createDrizzleAdapter(db, tables, eq);
    const result = await adapter.findOne(source, "nobody");

    expect(result).toBeNull();
  });

  it("throws when query handler is not found", async () => {
    const db = { query: {} };
    const tables = { users: { handle: "handle_col_ref" } };
    const eq = vi.fn();

    const adapter = createDrizzleAdapter(db as any, tables, eq);
    await expect(adapter.findOne(source, "sarah")).rejects.toThrow(
      'Drizzle query handler for "users" not found'
    );
  });

  it("throws when table is not found", async () => {
    const findFirst = vi.fn();
    const db = { query: { users: { findFirst } } };
    const tables = {};
    const eq = vi.fn();

    const adapter = createDrizzleAdapter(db, tables, eq);
    await expect(adapter.findOne(source, "sarah")).rejects.toThrow(
      'Table "users" not found'
    );
  });

  it("throws when column is not found in table", async () => {
    const findFirst = vi.fn();
    const db = { query: { users: { findFirst } } };
    const tables = { users: { id: "id_ref" } }; // no "handle" column
    const eq = vi.fn();

    const adapter = createDrizzleAdapter(db, tables, eq);
    await expect(adapter.findOne(source, "sarah")).rejects.toThrow(
      'Column "handle" not found in table "users"'
    );
  });
});

// ---------------------------------------------------------------------------
// Raw SQL Adapter
// ---------------------------------------------------------------------------
describe("createRawAdapter", () => {
  const source: NamespaceSource = {
    name: "users",
    column: "handle",
    scopeKey: "id",
  };

  it("executes correct SQL query", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ id: "u1" }] });
    const adapter = createRawAdapter(execute);

    const result = await adapter.findOne(source, "sarah");

    expect(execute).toHaveBeenCalledWith(
      'SELECT "id" FROM "users" WHERE "handle" = $1 LIMIT 1',
      ["sarah"]
    );
    expect(result).toEqual({ id: "u1" });
  });

  it("includes scopeKey column when different from idColumn", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ rows: [{ id: "u1", orgId: "o1" }] });

    const sourceWithScope: NamespaceSource = {
      name: "users",
      column: "handle",
      scopeKey: "orgId",
    };

    const adapter = createRawAdapter(execute);
    await adapter.findOne(sourceWithScope, "sarah");

    expect(execute).toHaveBeenCalledWith(
      'SELECT "id", "orgId" FROM "users" WHERE "handle" = $1 LIMIT 1',
      ["sarah"]
    );
  });

  it("does not duplicate column when scopeKey equals idColumn", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ id: "u1" }] });

    const sourceIdScope: NamespaceSource = {
      name: "users",
      column: "handle",
      scopeKey: "id",
    };

    const adapter = createRawAdapter(execute);
    await adapter.findOne(sourceIdScope, "sarah");

    expect(execute).toHaveBeenCalledWith(
      'SELECT "id" FROM "users" WHERE "handle" = $1 LIMIT 1',
      ["sarah"]
    );
  });

  it("returns null when no rows", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const adapter = createRawAdapter(execute);

    const result = await adapter.findOne(source, "nobody");
    expect(result).toBeNull();
  });

  it("uses custom idColumn", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ pk: "u1" }] });

    const sourceCustomId: NamespaceSource = {
      name: "users",
      column: "handle",
      idColumn: "pk",
    };

    const adapter = createRawAdapter(execute);
    await adapter.findOne(sourceCustomId, "sarah");

    expect(execute).toHaveBeenCalledWith(
      'SELECT "pk" FROM "users" WHERE "handle" = $1 LIMIT 1',
      ["sarah"]
    );
  });

  it("uses LOWER() for case-insensitive matching", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ id: "u1" }] });
    const adapter = createRawAdapter(execute);

    await adapter.findOne(source, "sarah", { caseInsensitive: true });

    expect(execute).toHaveBeenCalledWith(
      'SELECT "id" FROM "users" WHERE LOWER("handle") = LOWER($1) LIMIT 1',
      ["sarah"]
    );
  });
});

// ---------------------------------------------------------------------------
// Kysely Adapter
// ---------------------------------------------------------------------------
describe("createKyselyAdapter", () => {
  const source: NamespaceSource = {
    name: "users",
    column: "handle",
    scopeKey: "id",
  };

  function createMockKyselyDb(result: Record<string, unknown> | undefined) {
    const builder = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(result),
    };
    const db = { selectFrom: vi.fn().mockReturnValue(builder) };
    return { db, builder };
  }

  it("builds the correct query chain", async () => {
    const { db, builder } = createMockKyselyDb({ id: "u1" });
    const adapter = createKyselyAdapter(db);

    const result = await adapter.findOne(source, "sarah");

    expect(db.selectFrom).toHaveBeenCalledWith("users");
    expect(builder.select).toHaveBeenCalledWith(["id"]);
    expect(builder.where).toHaveBeenCalledWith("handle", "=", "sarah");
    expect(builder.limit).toHaveBeenCalledWith(1);
    expect(result).toEqual({ id: "u1" });
  });

  it("includes scopeKey in select when different from idColumn", async () => {
    const { db, builder } = createMockKyselyDb({ id: "u1", orgId: "o1" });

    const sourceWithScope: NamespaceSource = {
      name: "users",
      column: "handle",
      scopeKey: "orgId",
    };

    const adapter = createKyselyAdapter(db);
    await adapter.findOne(sourceWithScope, "sarah");

    expect(builder.select).toHaveBeenCalledWith(["id", "orgId"]);
  });

  it("does not duplicate scopeKey when same as idColumn", async () => {
    const { db, builder } = createMockKyselyDb({ id: "u1" });

    const adapter = createKyselyAdapter(db);
    await adapter.findOne(source, "sarah");

    expect(builder.select).toHaveBeenCalledWith(["id"]);
  });

  it("returns null when no match (undefined)", async () => {
    const { db } = createMockKyselyDb(undefined);
    const adapter = createKyselyAdapter(db);

    const result = await adapter.findOne(source, "nobody");
    expect(result).toBeNull();
  });

  it("uses custom idColumn", async () => {
    const { db, builder } = createMockKyselyDb({ pk: "u1" });

    const sourceCustomId: NamespaceSource = {
      name: "users",
      column: "handle",
      idColumn: "pk",
    };

    const adapter = createKyselyAdapter(db);
    await adapter.findOne(sourceCustomId, "sarah");

    expect(builder.select).toHaveBeenCalledWith(["pk"]);
  });

  it("uses ilike for case-insensitive matching", async () => {
    const { db, builder } = createMockKyselyDb({ id: "u1" });
    const adapter = createKyselyAdapter(db);

    await adapter.findOne(source, "sarah", { caseInsensitive: true });

    expect(builder.where).toHaveBeenCalledWith("handle", "ilike", "sarah");
  });
});

// ---------------------------------------------------------------------------
// Knex Adapter
// ---------------------------------------------------------------------------
describe("createKnexAdapter", () => {
  const source: NamespaceSource = {
    name: "users",
    column: "handle",
    scopeKey: "id",
  };

  function createMockKnex(result: Record<string, unknown> | undefined) {
    const builder = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      whereRaw: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(result),
    };
    const knex = vi.fn().mockReturnValue(builder) as any;
    return { knex, builder };
  }

  it("builds the correct query chain", async () => {
    const { knex, builder } = createMockKnex({ id: "u1" });
    const adapter = createKnexAdapter(knex);

    const result = await adapter.findOne(source, "sarah");

    expect(knex).toHaveBeenCalledWith("users");
    expect(builder.select).toHaveBeenCalledWith(["id"]);
    expect(builder.where).toHaveBeenCalledWith("handle", "sarah");
    expect(result).toEqual({ id: "u1" });
  });

  it("includes scopeKey in select when different from idColumn", async () => {
    const { knex, builder } = createMockKnex({ id: "u1", orgId: "o1" });

    const sourceWithScope: NamespaceSource = {
      name: "users",
      column: "handle",
      scopeKey: "orgId",
    };

    const adapter = createKnexAdapter(knex);
    await adapter.findOne(sourceWithScope, "sarah");

    expect(builder.select).toHaveBeenCalledWith(["id", "orgId"]);
  });

  it("does not duplicate scopeKey when same as idColumn", async () => {
    const { knex, builder } = createMockKnex({ id: "u1" });

    const adapter = createKnexAdapter(knex);
    await adapter.findOne(source, "sarah");

    expect(builder.select).toHaveBeenCalledWith(["id"]);
  });

  it("returns null when no match (undefined)", async () => {
    const { knex } = createMockKnex(undefined);
    const adapter = createKnexAdapter(knex);

    const result = await adapter.findOne(source, "nobody");
    expect(result).toBeNull();
  });

  it("uses custom idColumn", async () => {
    const { knex, builder } = createMockKnex({ pk: "u1" });

    const sourceCustomId: NamespaceSource = {
      name: "users",
      column: "handle",
      idColumn: "pk",
    };

    const adapter = createKnexAdapter(knex);
    await adapter.findOne(sourceCustomId, "sarah");

    expect(builder.select).toHaveBeenCalledWith(["pk"]);
  });

  it("uses whereRaw with LOWER() for case-insensitive matching", async () => {
    const { knex, builder } = createMockKnex({ id: "u1" });
    const adapter = createKnexAdapter(knex);

    await adapter.findOne(source, "sarah", { caseInsensitive: true });

    expect(builder.whereRaw).toHaveBeenCalledWith(
      'LOWER(??) = LOWER(?)',
      ["handle", "sarah"]
    );
    expect(builder.where).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TypeORM Adapter
// ---------------------------------------------------------------------------
describe("createTypeORMAdapter", () => {
  const source: NamespaceSource = {
    name: "user",
    column: "handle",
    scopeKey: "id",
  };

  function createMockDataSource(result: Record<string, unknown> | null) {
    const findOne = vi.fn().mockResolvedValue(result);
    const repository = { findOne };
    const dataSource = { getRepository: vi.fn().mockReturnValue(repository) };
    return { dataSource, repository, findOne };
  }

  it("calls findOne on the correct repository", async () => {
    const { dataSource, findOne } = createMockDataSource({ id: "u1" });
    const UserEntity = class User {};
    const adapter = createTypeORMAdapter(dataSource, { user: UserEntity });

    const result = await adapter.findOne(source, "sarah");

    expect(dataSource.getRepository).toHaveBeenCalledWith(UserEntity);
    expect(findOne).toHaveBeenCalledWith({
      where: { handle: "sarah" },
      select: { id: true },
    });
    expect(result).toEqual({ id: "u1" });
  });

  it("includes scopeKey in select when different from idColumn", async () => {
    const { dataSource, findOne } = createMockDataSource({ id: "u1", orgId: "o1" });
    const sourceWithScope: NamespaceSource = {
      name: "user",
      column: "handle",
      scopeKey: "orgId",
    };

    const adapter = createTypeORMAdapter(dataSource, { user: class {} });
    await adapter.findOne(sourceWithScope, "sarah");

    expect(findOne).toHaveBeenCalledWith({
      where: { handle: "sarah" },
      select: { id: true, orgId: true },
    });
  });

  it("returns null when no match", async () => {
    const { dataSource } = createMockDataSource(null);
    const adapter = createTypeORMAdapter(dataSource, { user: class {} });

    const result = await adapter.findOne(source, "nobody");
    expect(result).toBeNull();
  });

  it("throws when entity is not found", async () => {
    const { dataSource } = createMockDataSource(null);
    const adapter = createTypeORMAdapter(dataSource, {});

    await expect(adapter.findOne(source, "sarah")).rejects.toThrow(
      'TypeORM entity "user" not found'
    );
  });

  it("uses ILike for case-insensitive matching", async () => {
    const { dataSource, findOne } = createMockDataSource({ id: "u1" });
    const ilike = vi.fn((val: string) => ({ _type: "ilike", _value: val }));
    const adapter = createTypeORMAdapter(dataSource, { user: class {} }, ilike);

    await adapter.findOne(source, "sarah", { caseInsensitive: true });

    expect(ilike).toHaveBeenCalledWith("sarah");
    expect(findOne).toHaveBeenCalledWith({
      where: { handle: { _type: "ilike", _value: "sarah" } },
      select: { id: true },
    });
  });

  it("throws when caseInsensitive used without ILike", async () => {
    const { dataSource } = createMockDataSource({ id: "u1" });
    const adapter = createTypeORMAdapter(dataSource, { user: class {} });

    await expect(
      adapter.findOne(source, "sarah", { caseInsensitive: true })
    ).rejects.toThrow("caseInsensitive requires passing ILike");
  });
});

// ---------------------------------------------------------------------------
// MikroORM Adapter
// ---------------------------------------------------------------------------
describe("createMikroORMAdapter", () => {
  const source: NamespaceSource = {
    name: "user",
    column: "handle",
    scopeKey: "id",
  };

  it("calls em.findOne with correct entity and where", async () => {
    const findOne = vi.fn().mockResolvedValue({ id: "u1" });
    const em = { findOne };
    const UserEntity = class User {};
    const adapter = createMikroORMAdapter(em, { user: UserEntity });

    const result = await adapter.findOne(source, "sarah");

    expect(findOne).toHaveBeenCalledWith(
      UserEntity,
      { handle: "sarah" },
      { fields: ["id"] }
    );
    expect(result).toEqual({ id: "u1" });
  });

  it("includes scopeKey in fields when different from idColumn", async () => {
    const findOne = vi.fn().mockResolvedValue({ id: "u1", orgId: "o1" });
    const em = { findOne };
    const sourceWithScope: NamespaceSource = {
      name: "user",
      column: "handle",
      scopeKey: "orgId",
    };

    const adapter = createMikroORMAdapter(em, { user: class {} });
    await adapter.findOne(sourceWithScope, "sarah");

    expect(findOne).toHaveBeenCalledWith(
      expect.anything(),
      { handle: "sarah" },
      { fields: ["id", "orgId"] }
    );
  });

  it("returns null when no match", async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    const em = { findOne };
    const adapter = createMikroORMAdapter(em, { user: class {} });

    const result = await adapter.findOne(source, "nobody");
    expect(result).toBeNull();
  });

  it("throws when entity is not found", async () => {
    const em = { findOne: vi.fn() };
    const adapter = createMikroORMAdapter(em, {});

    await expect(adapter.findOne(source, "sarah")).rejects.toThrow(
      'MikroORM entity "user" not found'
    );
  });

  it("uses $ilike for case-insensitive matching", async () => {
    const findOne = vi.fn().mockResolvedValue({ id: "u1" });
    const em = { findOne };
    const adapter = createMikroORMAdapter(em, { user: class {} });

    await adapter.findOne(source, "sarah", { caseInsensitive: true });

    expect(findOne).toHaveBeenCalledWith(
      expect.anything(),
      { handle: { $ilike: "sarah" } },
      { fields: ["id"] }
    );
  });
});

// ---------------------------------------------------------------------------
// Sequelize Adapter
// ---------------------------------------------------------------------------
describe("createSequelizeAdapter", () => {
  const source: NamespaceSource = {
    name: "user",
    column: "handle",
    scopeKey: "id",
  };

  it("calls model.findOne with correct where and attributes", async () => {
    const findOne = vi.fn().mockResolvedValue({ id: "u1" });
    const UserModel = { findOne };
    const adapter = createSequelizeAdapter({ user: UserModel });

    const result = await adapter.findOne(source, "sarah");

    expect(findOne).toHaveBeenCalledWith({
      where: { handle: "sarah" },
      attributes: ["id"],
      raw: true,
    });
    expect(result).toEqual({ id: "u1" });
  });

  it("includes scopeKey in attributes when different from idColumn", async () => {
    const findOne = vi.fn().mockResolvedValue({ id: "u1", orgId: "o1" });
    const sourceWithScope: NamespaceSource = {
      name: "user",
      column: "handle",
      scopeKey: "orgId",
    };

    const adapter = createSequelizeAdapter({ user: { findOne } });
    await adapter.findOne(sourceWithScope, "sarah");

    expect(findOne).toHaveBeenCalledWith({
      where: { handle: "sarah" },
      attributes: ["id", "orgId"],
      raw: true,
    });
  });

  it("returns null when no match", async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    const adapter = createSequelizeAdapter({ user: { findOne } });

    const result = await adapter.findOne(source, "nobody");
    expect(result).toBeNull();
  });

  it("throws when model is not found", async () => {
    const adapter = createSequelizeAdapter({});

    await expect(adapter.findOne(source, "sarah")).rejects.toThrow(
      'Sequelize model "user" not found'
    );
  });

  it("uses Sequelize.where/fn/col for case-insensitive matching", async () => {
    const findOne = vi.fn().mockResolvedValue({ id: "u1" });
    const helpers = {
      where: vi.fn((left: unknown, right: unknown) => ({ _where: [left, right] })),
      fn: vi.fn((name: string, ...args: unknown[]) => ({ _fn: name, _args: args })),
      col: vi.fn((name: string) => ({ _col: name })),
    };

    const adapter = createSequelizeAdapter({ user: { findOne } }, helpers);
    await adapter.findOne(source, "Sarah", { caseInsensitive: true });

    expect(helpers.col).toHaveBeenCalledWith("handle");
    expect(helpers.fn).toHaveBeenCalledWith("LOWER", { _col: "handle" });
    expect(helpers.where).toHaveBeenCalledWith(
      { _fn: "LOWER", _args: [{ _col: "handle" }] },
      "sarah"
    );
  });

  it("throws when caseInsensitive used without helpers", async () => {
    const findOne = vi.fn().mockResolvedValue({ id: "u1" });
    const adapter = createSequelizeAdapter({ user: { findOne } });

    await expect(
      adapter.findOne(source, "sarah", { caseInsensitive: true })
    ).rejects.toThrow("caseInsensitive requires passing Sequelize helpers");
  });
});

// ---------------------------------------------------------------------------
// Mongoose Adapter
// ---------------------------------------------------------------------------
describe("createMongooseAdapter", () => {
  const source: NamespaceSource = {
    name: "user",
    column: "handle",
    idColumn: "_id",
    scopeKey: "_id",
  };

  function createMockMongooseModel(result: Record<string, unknown> | null) {
    const lean = vi.fn().mockResolvedValue(result);
    const collation = vi.fn().mockReturnValue({ lean });
    const findOne = vi.fn().mockReturnValue({ lean, collation });
    return { findOne, lean, collation };
  }

  it("calls findOne with correct conditions and projection, uses lean()", async () => {
    const model = createMockMongooseModel({ _id: "u1" });
    const adapter = createMongooseAdapter({ user: model });

    const result = await adapter.findOne(source, "sarah");

    expect(model.findOne).toHaveBeenCalledWith(
      { handle: "sarah" },
      { _id: 1 }
    );
    expect(model.lean).toHaveBeenCalled();
    expect(result).toEqual({ _id: "u1" });
  });

  it("includes scopeKey in projection when different from idColumn", async () => {
    const model = createMockMongooseModel({ _id: "u1", orgId: "o1" });
    const sourceWithScope: NamespaceSource = {
      name: "user",
      column: "handle",
      idColumn: "_id",
      scopeKey: "orgId",
    };

    const adapter = createMongooseAdapter({ user: model });
    await adapter.findOne(sourceWithScope, "sarah");

    expect(model.findOne).toHaveBeenCalledWith(
      { handle: "sarah" },
      { _id: 1, orgId: 1 }
    );
  });

  it("returns null when no match", async () => {
    const model = createMockMongooseModel(null);
    const adapter = createMongooseAdapter({ user: model });

    const result = await adapter.findOne(source, "nobody");
    expect(result).toBeNull();
  });

  it("throws when model is not found", async () => {
    const adapter = createMongooseAdapter({});

    await expect(adapter.findOne(source, "sarah")).rejects.toThrow(
      'Mongoose model "user" not found'
    );
  });

  it("uses collation for case-insensitive matching", async () => {
    const model = createMockMongooseModel({ _id: "u1" });
    const adapter = createMongooseAdapter({ user: model });

    await adapter.findOne(source, "sarah", { caseInsensitive: true });

    expect(model.collation).toHaveBeenCalledWith({ locale: "en", strength: 2 });
  });

  it("defaults idColumn to _id for Mongoose", async () => {
    const sourceNoId: NamespaceSource = {
      name: "user",
      column: "handle",
    };

    const model = createMockMongooseModel({ _id: "u1" });
    const adapter = createMongooseAdapter({ user: model });
    await adapter.findOne(sourceNoId, "sarah");

    expect(model.findOne).toHaveBeenCalledWith(
      { handle: "sarah" },
      { _id: 1 }
    );
  });
});
