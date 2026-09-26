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

      // The guard only needs the id: it compares the scope's value with it
      const fields = [idColumn];

      const whereValue = options?.caseInsensitive
        ? { $ilike: escapeLike(value) }
        : value;

      return em.findOne(
        entity,
        { [source.column]: whereValue },
        { fields }
      );
    },
  };
}

/** A value for ILIKE, with its wildcards escaped: `_` and `%` in a name mean themselves, not "any character" */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
