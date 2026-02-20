import type { NamespaceAdapter, NamespaceSource, FindOneOptions } from "../index";

type MikroORMEntityManager = {
  findOne: (
    entityName: unknown,
    where: Record<string, unknown>,
    options?: { fields?: string[] }
  ) => Promise<Record<string, unknown> | null>;
};

/**
 * Create a namespace adapter for MikroORM
 *
 * @example
 * ```ts
 * import { MikroORM } from "@mikro-orm/core";
 * import { createNamespaceGuard } from "namespace-guard";
 * import { createMikroORMAdapter } from "namespace-guard/adapters/mikro-orm";
 * import { User, Organization } from "./entities";
 *
 * const orm = await MikroORM.init(config);
 *
 * const guard = createNamespaceGuard(
 *   {
 *     reserved: ["admin", "api", "settings"],
 *     sources: [
 *       { name: "user", column: "handle", scopeKey: "id" },
 *       { name: "organization", column: "slug", scopeKey: "id" },
 *     ],
 *   },
 *   createMikroORMAdapter(orm.em, { user: User, organization: Organization })
 * );
 * ```
 */
export function createMikroORMAdapter(
  em: MikroORMEntityManager,
  entities: Record<string, unknown>
): NamespaceAdapter {
  return {
    async findOne(source: NamespaceSource, value: string, options?: FindOneOptions) {
      const entity = entities[source.name];
      if (!entity) {
        throw new Error(`MikroORM entity "${source.name}" not found in provided entities object`);
      }

      const idColumn = source.idColumn ?? "id";

      const fields =
        source.scopeKey && source.scopeKey !== idColumn
          ? [idColumn, source.scopeKey]
          : [idColumn];

      const whereValue = options?.caseInsensitive
        ? { $ilike: value }
        : value;

      return em.findOne(
        entity,
        { [source.column]: whereValue },
        { fields }
      );
    },
  };
}
