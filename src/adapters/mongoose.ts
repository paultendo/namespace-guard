import type { NamespaceAdapter, NamespaceSource, FindOneOptions } from "../index";

type MongooseModel = {
  findOne: (
    conditions: Record<string, unknown>,
    projection?: Record<string, number> | string
  ) => {
    lean: () => Promise<Record<string, unknown> | null>;
    collation: (options: Record<string, unknown>) => {
      lean: () => Promise<Record<string, unknown> | null>;
    };
  };
};

/**
 * Create a namespace adapter for Mongoose
 *
 * Note: For Mongoose sources, `idColumn` defaults to "_id" instead of "id".
 *
 * @example
 * ```ts
 * import mongoose from "mongoose";
 * import { createNamespaceGuard } from "namespace-guard";
 * import { createMongooseAdapter } from "namespace-guard/adapters/mongoose";
 *
 * const User = mongoose.model("User", userSchema);
 * const Organization = mongoose.model("Organization", orgSchema);
 *
 * const guard = createNamespaceGuard(
 *   {
 *     reserved: ["admin", "api", "settings"],
 *     sources: [
 *       { name: "user", column: "handle", idColumn: "_id", scopeKey: "_id" },
 *       { name: "organization", column: "slug", idColumn: "_id", scopeKey: "_id" },
 *     ],
 *   },
 *   createMongooseAdapter({ user: User, organization: Organization })
 * );
 * ```
 */
export function createMongooseAdapter(
  models: Record<string, MongooseModel>
): NamespaceAdapter {
  return {
    async findOne(source: NamespaceSource, value: string, options?: FindOneOptions) {
      const model = models[source.name];
      if (!model) {
        throw new Error(`Mongoose model "${source.name}" not found in provided models object`);
      }

      const idColumn = source.idColumn ?? "_id";

      const projection: Record<string, number> = { [idColumn]: 1 };
      if (source.scopeKey && source.scopeKey !== idColumn) {
        projection[source.scopeKey] = 1;
      }

      const query = model.findOne(
        { [source.column]: value },
        projection
      );

      if (options?.caseInsensitive) {
        return query.collation({ locale: "en", strength: 2 }).lean();
      }

      return query.lean();
    },
  };
}
