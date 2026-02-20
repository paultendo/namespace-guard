import type { NamespaceAdapter, NamespaceSource, FindOneOptions } from "../index";

type KyselyQueryBuilder = {
  select: (columns: string[]) => KyselyQueryBuilder;
  where: (column: string, operator: string, value: unknown) => KyselyQueryBuilder;
  whereRaw: (raw: unknown) => KyselyQueryBuilder;
  limit: (limit: number) => KyselyQueryBuilder;
  executeTakeFirst: () => Promise<Record<string, unknown> | undefined>;
};

type KyselyDb = {
  selectFrom: (table: string) => KyselyQueryBuilder;
};

/**
 * Create a namespace adapter for Kysely
 *
 * @example
 * ```ts
 * import { Kysely, PostgresDialect } from "kysely";
 * import { createNamespaceGuard } from "namespace-guard";
 * import { createKyselyAdapter } from "namespace-guard/adapters/kysely";
 *
 * const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
 *
 * const guard = createNamespaceGuard(
 *   {
 *     reserved: ["admin", "api", "settings"],
 *     sources: [
 *       { name: "users", column: "handle", scopeKey: "id" },
 *       { name: "organizations", column: "slug", scopeKey: "id" },
 *     ],
 *   },
 *   createKyselyAdapter(db)
 * );
 * ```
 */
export function createKyselyAdapter(db: KyselyDb): NamespaceAdapter {
  return {
    async findOne(source: NamespaceSource, value: string, options?: FindOneOptions) {
      const idColumn = source.idColumn ?? "id";

      const columns =
        source.scopeKey && source.scopeKey !== idColumn
          ? [idColumn, source.scopeKey]
          : [idColumn];

      let query = db
        .selectFrom(source.name)
        .select(columns);

      if (options?.caseInsensitive) {
        query = query.where(source.column, "ilike", value);
      } else {
        query = query.where(source.column, "=", value);
      }

      const row = await query.limit(1).executeTakeFirst();

      return row ?? null;
    },
  };
}
