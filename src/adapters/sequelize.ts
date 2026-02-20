import type { NamespaceAdapter, NamespaceSource, FindOneOptions } from "../index";

type SequelizeModel = {
  findOne: (options: {
    where: unknown;
    attributes?: string[];
    raw?: boolean;
  }) => Promise<Record<string, unknown> | null>;
};

type SequelizeLiteral = unknown;

type SequelizeHelpers = {
  /** Sequelize.where() — creates a WHERE condition */
  where: (left: SequelizeLiteral, right: unknown) => unknown;
  /** Sequelize.fn() — wraps a SQL function */
  fn: (fnName: string, ...args: SequelizeLiteral[]) => SequelizeLiteral;
  /** Sequelize.col() — references a column */
  col: (columnName: string) => SequelizeLiteral;
};

/**
 * Create a namespace adapter for Sequelize
 *
 * @example
 * ```ts
 * import { Sequelize } from "sequelize";
 * import { createNamespaceGuard } from "namespace-guard";
 * import { createSequelizeAdapter } from "namespace-guard/adapters/sequelize";
 * import { User, Organization } from "./models";
 *
 * const guard = createNamespaceGuard(
 *   {
 *     reserved: ["admin", "api", "settings"],
 *     sources: [
 *       { name: "user", column: "handle", scopeKey: "id" },
 *       { name: "organization", column: "slug", scopeKey: "id" },
 *     ],
 *   },
 *   createSequelizeAdapter({ user: User, organization: Organization })
 * );
 *
 * // For case-insensitive matching, pass Sequelize helpers:
 * // createSequelizeAdapter(
 * //   { user: User, organization: Organization },
 * //   { where: Sequelize.where, fn: Sequelize.fn, col: Sequelize.col }
 * // )
 * ```
 */
export function createSequelizeAdapter(
  models: Record<string, SequelizeModel>,
  helpers?: SequelizeHelpers
): NamespaceAdapter {
  return {
    async findOne(source: NamespaceSource, value: string, options?: FindOneOptions) {
      const model = models[source.name];
      if (!model) {
        throw new Error(`Sequelize model "${source.name}" not found in provided models object`);
      }

      const idColumn = source.idColumn ?? "id";

      const attributes =
        source.scopeKey && source.scopeKey !== idColumn
          ? [idColumn, source.scopeKey]
          : [idColumn];

      let where: unknown;

      if (options?.caseInsensitive) {
        if (!helpers) {
          throw new Error("caseInsensitive requires passing Sequelize helpers ({ where, fn, col }) to createSequelizeAdapter");
        }
        // WHERE LOWER("column") = 'lowered-value'
        where = helpers.where(
          helpers.fn("LOWER", helpers.col(source.column)),
          value.toLowerCase()
        );
      } else {
        where = { [source.column]: value };
      }

      return model.findOne({ where, attributes, raw: true });
    },
  };
}
