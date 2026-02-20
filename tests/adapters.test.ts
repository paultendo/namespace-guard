import { describe, it, expect, vi } from "vitest";
import { createPrismaAdapter } from "../src/adapters/prisma";
import { createDrizzleAdapter } from "../src/adapters/drizzle";
import { createRawAdapter } from "../src/adapters/raw";
import { createKyselyAdapter } from "../src/adapters/kysely";
import { createKnexAdapter } from "../src/adapters/knex";
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
      'LOWER("handle") = LOWER(?)',
      ["sarah"]
    );
    expect(builder.where).not.toHaveBeenCalled();
  });
});
