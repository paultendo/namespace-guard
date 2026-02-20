import type { NamespaceAdapter, NamespaceSource, FindOneOptions } from "../index";

type KnexQueryBuilder = {
  select: (columns: string[]) => KnexQueryBuilder;
  where: (column: string, value: unknown) => KnexQueryBuilder;
  whereRaw: (raw: string, bindings: unknown[]) => KnexQueryBuilder;
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
    async findOne(source: NamespaceSource, value: string, options?: FindOneOptions) {
      const idColumn = source.idColumn ?? "id";

      const columns =
        source.scopeKey && source.scopeKey !== idColumn
          ? [idColumn, source.scopeKey]
          : [idColumn];

      let query = knex(source.name).select(columns);

      if (options?.caseInsensitive) {
        query = query.whereRaw(`LOWER(??) = LOWER(?)`, [source.column, value]);
      } else {
        query = query.where(source.column, value);
      }

      const row = await query.first();

      return row ?? null;
    },
  };
}
