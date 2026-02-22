import type { NamespaceAdapter, NamespaceSource, FindOneOptions } from "../index";

type QueryExecutor = (
  sql: string,
  params: unknown[]
) => Promise<{ rows: Record<string, unknown>[] }>;

/**
 * Create a namespace adapter for raw SQL queries
 *
 * Works with PostgreSQL-compatible clients that use $1-style parameter placeholders (pg).
 * For MySQL or SQLite, wrap the executor to translate parameter syntax.
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
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertSafeIdentifier(name: string, label: string): void {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new Error(`Unsafe ${label}: ${JSON.stringify(name)}. Use only letters, digits, and underscores.`);
  }
}

export function createRawAdapter(execute: QueryExecutor): NamespaceAdapter {
  return {
    async findOne(source: NamespaceSource, value: string, options?: FindOneOptions) {
      const idColumn = source.idColumn ?? "id";

      // Validate identifiers to prevent SQL injection via malformed config
      assertSafeIdentifier(source.name, "table name");
      assertSafeIdentifier(source.column, "column name");
      assertSafeIdentifier(idColumn, "id column name");
      if (source.scopeKey) assertSafeIdentifier(source.scopeKey, "scope key");

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
