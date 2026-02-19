#!/usr/bin/env node

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createNamespaceGuard, normalize } from "./index";
import type { NamespaceConfig, NamespaceAdapter } from "./index";
import { createRawAdapter } from "./adapters/raw";

function printUsage() {
  console.log(`Usage: namespace-guard check <slug> [options]

Options:
  --config <path>        Path to config file (default: namespace-guard.config.json)
  --database-url <url>   PostgreSQL connection URL for full collision checking
  --help                 Show this help message

Examples:
  namespace-guard check acme-corp
  namespace-guard check sarah --config ./my-config.json
  namespace-guard check sarah --database-url postgres://localhost/mydb`);
}

function parseArgs(argv: string[]): {
  command: string | undefined;
  slug: string | undefined;
  config: string | undefined;
  databaseUrl: string | undefined;
  help: boolean;
} {
  const args = argv.slice(2);
  let command: string | undefined;
  let slug: string | undefined;
  let config: string | undefined;
  let databaseUrl: string | undefined;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--config" && i + 1 < args.length) {
      config = args[++i];
    } else if (arg === "--database-url" && i + 1 < args.length) {
      databaseUrl = args[++i];
    } else if (!command) {
      command = arg;
    } else if (!slug) {
      slug = arg;
    }
  }

  return { command, slug, config, databaseUrl, help };
}

interface FileConfig {
  reserved?: string[] | Record<string, string[]>;
  pattern?: string;
  sources?: Array<{
    name: string;
    column: string;
    idColumn?: string;
    scopeKey?: string;
  }>;
}

function loadConfig(configPath?: string): FileConfig {
  const path = configPath
    ? resolve(configPath)
    : resolve(process.cwd(), "namespace-guard.config.json");

  if (!existsSync(path)) {
    if (configPath) {
      console.error(`Config file not found: ${path}`);
      process.exit(1);
    }
    return {};
  }

  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    console.error(`Failed to parse config file: ${path}`);
    process.exit(1);
    return {}; // unreachable, satisfies TS
  }
}

function createNoopAdapter(): NamespaceAdapter {
  return {
    async findOne() {
      return null;
    },
  };
}

async function createDatabaseAdapter(url: string): Promise<NamespaceAdapter> {
  let pg: any;
  try {
    // Dynamic import — pg is an optional peer dependency
    const mod = "pg";
    pg = await import(mod);
  } catch {
    console.error(
      "The pg package is required for --database-url. Install it with: npm install pg"
    );
    process.exit(1);
  }

  const Pool = pg.default?.Pool ?? pg.Pool;
  const pool = new Pool({ connectionString: url });

  return createRawAdapter((sql, params) => pool.query(sql, params));
}

export async function run(argv: string[] = process.argv): Promise<number> {
  const { command, slug, config: configPath, databaseUrl, help } =
    parseArgs(argv);

  if (help || !command) {
    printUsage();
    return help ? 0 : 1;
  }

  if (command !== "check") {
    console.error(`Unknown command: ${command}`);
    printUsage();
    return 1;
  }

  if (!slug) {
    console.error("Missing slug argument");
    printUsage();
    return 1;
  }

  const fileConfig = loadConfig(configPath);

  const guardConfig: NamespaceConfig = {
    reserved: fileConfig.reserved,
    sources: fileConfig.sources ?? [],
    ...(fileConfig.pattern ? { pattern: new RegExp(fileConfig.pattern) } : {}),
  };

  const adapter = databaseUrl
    ? await createDatabaseAdapter(databaseUrl)
    : createNoopAdapter();

  const guard = createNamespaceGuard(guardConfig, adapter);
  const normalized = normalize(slug);
  const result = await guard.check(normalized);

  if (result.available) {
    console.log(`\u2713 ${normalized} is available`);
    return 0;
  } else {
    const suffix = result.source ? ` (source: ${result.source})` : "";
    console.log(`\u2717 ${normalized} \u2014 ${result.message}${suffix}`);
    return 1;
  }
}

// Only auto-run when executed directly via CLI, not when imported for testing.
// Vitest sets process.env.VITEST when running tests.
if (!process.env.VITEST) {
  run().then((code) => process.exit(code));
}
