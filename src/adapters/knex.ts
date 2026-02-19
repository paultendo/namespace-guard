import type { NamespaceAdapter, NamespaceSource } from "../index";

type KnexQueryBuilder = {
  select: (columns: string[]) => KnexQueryBuilder;
  where: (column: string, value: unknown) => KnexQueryBuilder;
  first: () => Promise<Record<string, unknown> | undefined>;
};

type KnexInstance = {
  (tableName: string): KnexQueryBuilder;
};

/**
 * Create a namespace adapter for Knex
 *
 * @example
 * ```ts
 * import Knex from "knex";
 * import { createNamespaceGuard } from "namespace-guard";
 * import { createKnexAdapter } from "namespace-guard/adapters/knex";
 *
 * const knex = Knex({ client: "pg", connection: process.env.DATABASE_URL });
 *
 * const guard = createNamespaceGuard(
 *   {
 *     reserved: ["admin", "api", "settings"],
 *     sources: [
 *       { name: "users", column: "handle", scopeKey: "id" },
 *       { name: "organizations", column: "slug", scopeKey: "id" },
 *     ],
 *   },
 *   createKnexAdapter(knex)
 * );
 * ```
 */
export function createKnexAdapter(knex: KnexInstance): NamespaceAdapter {
  return {
    async findOne(source: NamespaceSource, value: string) {
      const idColumn = source.idColumn ?? "id";

      const columns =
        source.scopeKey && source.scopeKey !== idColumn
          ? [idColumn, source.scopeKey]
          : [idColumn];

      const row = await knex(source.name)
        .select(columns)
        .where(source.column, value)
        .first();

      return row ?? null;
    },
  };
}
