import type { NamespaceAdapter, NamespaceSource, FindOneOptions } from "../index";

type QueryExecutor = (
  sql: string,
  params: unknown[]
) => Promise<{ rows: Record<string, unknown>[] }>;

/**
 * Create a namespace adapter for raw SQL queries
 *
 * Works with any database client that can execute parameterized queries
 * (pg, mysql2, better-sqlite3, etc.)
 *
 * @example
 * ```ts
 * import { Pool } from "pg";
 * import { createNamespaceGuard } from "namespace-guard";
 * import { createRawAdapter } from "namespace-guard/adapters/raw";
 *
 * const pool = new Pool();
 *
 * const guard = createNamespaceGuard(
 *   {
 *     reserved: ["admin", "api", "settings"],
 *     sources: [
 *       { name: "users", column: "handle", scopeKey: "id" },
 *       { name: "organizations", column: "slug", scopeKey: "id" },
 *     ],
 *   },
 *   createRawAdapter((sql, params) => pool.query(sql, params))
 * );
 * ```
 */
export function createRawAdapter(execute: QueryExecutor): NamespaceAdapter {
  return {
    async findOne(source: NamespaceSource, value: string, options?: FindOneOptions) {
      const idColumn = source.idColumn ?? "id";

      const columns = source.scopeKey && source.scopeKey !== idColumn
        ? `"${idColumn}", "${source.scopeKey}"`
        : `"${idColumn}"`;

      const whereClause = options?.caseInsensitive
        ? `LOWER("${source.column}") = LOWER($1)`
        : `"${source.column}" = $1`;

      const sql = `SELECT ${columns} FROM "${source.name}" WHERE ${whereClause} LIMIT 1`;

      const result = await execute(sql, [value]);
      return result.rows[0] ?? null;
    },
  };
}
