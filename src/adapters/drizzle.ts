import type { NamespaceAdapter, NamespaceSource } from "../index";

type DrizzleTable = {
  [key: string]: unknown;
};

type DrizzleDb = {
  query: {
    [key: string]: {
      findFirst: (args: {
        where: unknown;
        columns?: Record<string, boolean>;
      }) => Promise<Record<string, unknown> | null>;
    };
  };
};

type EqFn = (column: unknown, value: unknown) => unknown;

/**
 * Create a namespace adapter for Drizzle ORM
 *
 * @example
 * ```ts
 * import { eq } from "drizzle-orm";
 * import { db } from "./db";
 * import { users, organizations } from "./schema";
 * import { createNamespaceGuard } from "namespace-guard";
 * import { createDrizzleAdapter } from "namespace-guard/adapters/drizzle";
 *
 * const guard = createNamespaceGuard(
 *   {
 *     reserved: ["admin", "api", "settings"],
 *     sources: [
 *       { name: "users", column: "handle", scopeKey: "id" },
 *       { name: "organizations", column: "slug", scopeKey: "id" },
 *     ],
 *   },
 *   createDrizzleAdapter(db, { users, organizations }, eq)
 * );
 * ```
 */
export function createDrizzleAdapter(
  db: DrizzleDb,
  tables: Record<string, DrizzleTable>,
  eq: EqFn
): NamespaceAdapter {
  return {
    async findOne(source: NamespaceSource, value: string) {
      const queryHandler = db.query[source.name];
      if (!queryHandler) {
        throw new Error(`Drizzle query handler for "${source.name}" not found. Make sure relational queries are set up.`);
      }

      const table = tables[source.name];
      if (!table) {
        throw new Error(`Table "${source.name}" not found in provided tables object`);
      }

      const column = table[source.column];
      if (!column) {
        throw new Error(`Column "${source.column}" not found in table "${source.name}"`);
      }

      const idColumn = source.idColumn ?? "id";

      return queryHandler.findFirst({
        where: eq(column, value),
        columns: {
          [idColumn]: true,
          ...(source.scopeKey && source.scopeKey !== idColumn ? { [source.scopeKey]: true } : {}),
        },
      });
    },
  };
}
