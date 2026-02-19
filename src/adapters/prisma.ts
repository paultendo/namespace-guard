import type { NamespaceAdapter, NamespaceSource } from "../index";

type PrismaClient = {
  [key: string]: {
    findFirst: (args: { where: Record<string, unknown>; select?: Record<string, boolean> }) => Promise<Record<string, unknown> | null>;
  };
};

/**
 * Create a namespace adapter for Prisma
 *
 * @example
 * ```ts
 * import { PrismaClient } from "@prisma/client";
 * import { createNamespaceGuard } from "namespace-guard";
 * import { createPrismaAdapter } from "namespace-guard/adapters/prisma";
 *
 * const prisma = new PrismaClient();
 *
 * const guard = createNamespaceGuard(
 *   {
 *     reserved: ["admin", "api", "settings"],
 *     sources: [
 *       { name: "user", column: "handle", scopeKey: "userId" },
 *       { name: "organization", column: "slug", scopeKey: "orgId" },
 *     ],
 *   },
 *   createPrismaAdapter(prisma)
 * );
 * ```
 */
export function createPrismaAdapter(prisma: PrismaClient): NamespaceAdapter {
  return {
    async findOne(source: NamespaceSource, value: string) {
      const model = prisma[source.name];
      if (!model) {
        throw new Error(`Prisma model "${source.name}" not found`);
      }

      const idColumn = source.idColumn ?? "id";

      return model.findFirst({
        where: { [source.column]: value },
        select: {
          [idColumn]: true,
          ...(source.scopeKey ? { [source.scopeKey]: true } : {}),
        },
      });
    },
  };
}
