import type { NamespaceAdapter, NamespaceSource, FindOneOptions } from "../index";

type TypeORMRepository = {
  findOne: (options: {
    where: Record<string, unknown>;
    select?: Record<string, boolean>;
  }) => Promise<Record<string, unknown> | null>;
};

type TypeORMDataSource = {
  getRepository: (entity: unknown) => TypeORMRepository;
};

type ILikeFn = (value: string) => unknown;

/**
 * Create a namespace adapter for TypeORM
 *
 * @example
 * ```ts
 * import { DataSource } from "typeorm";
 * import { createNamespaceGuard } from "namespace-guard";
 * import { createTypeORMAdapter } from "namespace-guard/adapters/typeorm";
 * import { User, Organization } from "./entities";
 *
 * const dataSource = new DataSource({ ... });
 *
 * const guard = createNamespaceGuard(
 *   {
 *     reserved: ["admin", "api", "settings"],
 *     sources: [
 *       { name: "user", column: "handle", scopeKey: "id" },
 *       { name: "organization", column: "slug", scopeKey: "id" },
 *     ],
 *   },
 *   createTypeORMAdapter(dataSource, { user: User, organization: Organization })
 * );
 *
 * // For case-insensitive matching, pass ILike:
 * // import { ILike } from "typeorm";
 * // createTypeORMAdapter(dataSource, entities, ILike)
 * ```
 */
export function createTypeORMAdapter(
  dataSource: TypeORMDataSource,
  entities: Record<string, unknown>,
  ilike?: ILikeFn
): NamespaceAdapter {
  return {
    async findOne(source: NamespaceSource, value: string, options?: FindOneOptions) {
      const entity = entities[source.name];
      if (!entity) {
        throw new Error(`TypeORM entity "${source.name}" not found in provided entities object`);
      }

      const repository = dataSource.getRepository(entity);
      const idColumn = source.idColumn ?? "id";

      let whereValue: unknown = value;
      if (options?.caseInsensitive) {
        if (!ilike) {
          throw new Error("caseInsensitive requires passing ILike to createTypeORMAdapter");
        }
        whereValue = ilike(value);
      }

      const select: Record<string, boolean> = {
        [idColumn]: true,
        ...(source.scopeKey && source.scopeKey !== idColumn ? { [source.scopeKey]: true } : {}),
      };

      return repository.findOne({
        where: { [source.column]: whereValue },
        select,
      });
    },
  };
}
