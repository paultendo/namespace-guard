import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/adapters/prisma.ts",
    "src/adapters/drizzle.ts",
    "src/adapters/raw.ts",
    "src/adapters/kysely.ts",
    "src/adapters/knex.ts",
    "src/adapters/typeorm.ts",
    "src/adapters/mikro-orm.ts",
    "src/adapters/sequelize.ts",
    "src/adapters/mongoose.ts",
    "src/cli.ts",
  ],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  splitting: false,
});
