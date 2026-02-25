#!/usr/bin/env node

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  createNamespaceGuard,
  normalize,
  COMPOSABILITY_VECTORS,
  CONFUSABLE_MAP,
  CONFUSABLE_MAP_FULL,
} from "./index";
import type {
  NamespaceConfig,
  NamespaceAdapter,
  NamespaceGuard,
  CheckRiskOptions,
  RiskAction,
} from "./index";
import { createRawAdapter } from "./adapters/raw";

function printUsage() {
  console.log(`Usage:
  namespace-guard check <slug> [options]
  namespace-guard risk <slug> [options]
  namespace-guard attack-gen <target> [options]
  namespace-guard audit-canonical <dataset.json> [options]
  namespace-guard calibrate <dataset.json> [options]
  namespace-guard recommend <dataset.json> [options]
  namespace-guard drift [dataset.json] [options]

Options:
  --config <path>        Path to config file (default: namespace-guard.config.json)
  --database-url <url>   PostgreSQL connection URL for full collision checking
  --protect <slug>       Protected target to compare risk against (repeatable, comma-separated allowed)
  --no-reserved          Exclude configured reserved names from risk protected targets
  --warn-threshold <n>   Risk score threshold for warn action (0-100)
  --block-threshold <n>  Risk score threshold for block action (0-100)
  --max-matches <n>      Number of top risk matches to return
  --mode <kind>          For attack-gen: "evasion" (default) or "impersonation"
  --map <mode>           For attack-gen: "filtered" or "full" (default depends on --mode)
  --max-candidates <n>   For attack-gen: max candidates shown (default 25)
  --max-edits <n>        For attack-gen: max substitutions per candidate (1-2, default 2)
  --max-per-char <n>     For attack-gen: replacements sampled per target char (default 8)
  --no-ignorables        For attack-gen: skip zero-width insertion candidates
  --fail-on <mode>       For risk: fail on "block" (default) or "warn"
  --target-recall <n>    For calibrate: desired recall for warn threshold (0-1, default 0.90)
  --cost-block-benign <n>   For calibrate: cost when benign input is blocked (default 8)
  --cost-warn-benign <n>    For calibrate: cost when benign input is warned (default 1)
  --cost-allow-malicious <n> For calibrate: cost when malicious input is allowed (default 12)
  --cost-warn-malicious <n>  For calibrate: cost when malicious input is warned (default 3)
  --malicious-prior <n>      For calibrate: expected malicious base rate (0-1), reweights classes
  --limit <n>             For drift: max changed examples printed (default 10)
  --json                 Print machine-readable JSON (risk/attack-gen/audit-canonical/calibrate/recommend/drift commands)
  --help                 Show this help message

Examples:
  namespace-guard check acme-corp
  namespace-guard check sarah --config ./my-config.json
  namespace-guard check sarah --database-url postgres://localhost/mydb
  namespace-guard risk paуpal --protect paypal
  namespace-guard risk paypa1 --protect paypal --fail-on warn --json
  namespace-guard attack-gen paypal --json
  namespace-guard attack-gen shit --mode evasion --json
  namespace-guard audit-canonical ./users-export.json --json
  namespace-guard calibrate ./risk-dataset.json --protect paypal --json
  namespace-guard recommend ./risk-dataset.json --protect paypal --json
  namespace-guard drift
  namespace-guard drift ./risk-dataset.json --protect paypal --json`);
}

function parseArgs(argv: string[]): {
  command: string | undefined;
  slug: string | undefined;
  config: string | undefined;
  databaseUrl: string | undefined;
  protect: string[];
  includeReserved: boolean;
  warnThreshold: number | undefined;
  blockThreshold: number | undefined;
  maxMatches: number | undefined;
  attackMode: string | undefined;
  mapMode: string | undefined;
  maxCandidates: number | undefined;
  maxEdits: number | undefined;
  maxPerChar: number | undefined;
  includeIgnorables: boolean;
  failOn: string | undefined;
  targetRecall: number | undefined;
  costBlockBenign: number | undefined;
  costWarnBenign: number | undefined;
  costAllowMalicious: number | undefined;
  costWarnMalicious: number | undefined;
  maliciousPrior: number | undefined;
  limit: number | undefined;
  json: boolean;
  help: boolean;
} {
  const args = argv.slice(2);
  let command: string | undefined;
  let slug: string | undefined;
  let config: string | undefined;
  let databaseUrl: string | undefined;
  const protect: string[] = [];
  let includeReserved = true;
  let warnThreshold: number | undefined;
  let blockThreshold: number | undefined;
  let maxMatches: number | undefined;
  let attackMode: string | undefined;
  let mapMode: string | undefined;
  let maxCandidates: number | undefined;
  let maxEdits: number | undefined;
  let maxPerChar: number | undefined;
  let includeIgnorables = true;
  let failOn: string | undefined;
  let targetRecall: number | undefined;
  let costBlockBenign: number | undefined;
  let costWarnBenign: number | undefined;
  let costAllowMalicious: number | undefined;
  let costWarnMalicious: number | undefined;
  let maliciousPrior: number | undefined;
  let limit: number | undefined;
  let json = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--config" && i + 1 < args.length) {
      config = args[++i];
    } else if (arg === "--database-url" && i + 1 < args.length) {
      databaseUrl = args[++i];
    } else if (arg === "--protect" && i + 1 < args.length) {
      const raw = args[++i];
      const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
      protect.push(...values);
    } else if (arg === "--no-reserved") {
      includeReserved = false;
    } else if (arg === "--warn-threshold" && i + 1 < args.length) {
      warnThreshold = Number(args[++i]);
    } else if (arg === "--block-threshold" && i + 1 < args.length) {
      blockThreshold = Number(args[++i]);
    } else if (arg === "--max-matches" && i + 1 < args.length) {
      maxMatches = Number(args[++i]);
    } else if (arg === "--mode" && i + 1 < args.length) {
      attackMode = args[++i];
    } else if (arg === "--map" && i + 1 < args.length) {
      mapMode = args[++i];
    } else if (arg === "--max-candidates" && i + 1 < args.length) {
      maxCandidates = Number(args[++i]);
    } else if (arg === "--max-edits" && i + 1 < args.length) {
      maxEdits = Number(args[++i]);
    } else if (arg === "--max-per-char" && i + 1 < args.length) {
      maxPerChar = Number(args[++i]);
    } else if (arg === "--no-ignorables") {
      includeIgnorables = false;
    } else if (arg === "--fail-on" && i + 1 < args.length) {
      failOn = args[++i];
    } else if (arg === "--target-recall" && i + 1 < args.length) {
      targetRecall = Number(args[++i]);
    } else if (arg === "--cost-block-benign" && i + 1 < args.length) {
      costBlockBenign = Number(args[++i]);
    } else if (arg === "--cost-warn-benign" && i + 1 < args.length) {
      costWarnBenign = Number(args[++i]);
    } else if (arg === "--cost-allow-malicious" && i + 1 < args.length) {
      costAllowMalicious = Number(args[++i]);
    } else if (arg === "--cost-warn-malicious" && i + 1 < args.length) {
      costWarnMalicious = Number(args[++i]);
    } else if (arg === "--malicious-prior" && i + 1 < args.length) {
      maliciousPrior = Number(args[++i]);
    } else if (arg === "--limit" && i + 1 < args.length) {
      limit = Number(args[++i]);
    } else if (arg === "--json") {
      json = true;
    } else if (!command) {
      command = arg;
    } else if (!slug) {
      slug = arg;
    }
  }

  return {
    command,
    slug,
    config,
    databaseUrl,
    protect,
    includeReserved,
    warnThreshold,
    blockThreshold,
    maxMatches,
    attackMode,
    mapMode,
    maxCandidates,
    maxEdits,
    maxPerChar,
    includeIgnorables,
    failOn,
    targetRecall,
    costBlockBenign,
    costWarnBenign,
    costAllowMalicious,
    costWarnMalicious,
    maliciousPrior,
    limit,
    json,
    help,
  };
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

async function createDatabaseAdapter(url: string): Promise<{ adapter: NamespaceAdapter; cleanup: () => Promise<void> }> {
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
  if (!Pool) {
    console.error("Could not find Pool export from pg package. Check your pg version.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });

  return {
    adapter: createRawAdapter((sql, params) => pool.query(sql, params)),
    cleanup: () => pool.end(),
  };
}

type CalibrationDatasetRow = {
  identifier?: unknown;
  label?: unknown;
  malicious?: unknown;
  attack?: unknown;
  protect?: unknown;
  target?: unknown;
  weight?: unknown;
};

type ScoredCalibrationRow = {
  identifier: string;
  score: number;
  malicious: boolean;
  weight: number;
};

type ThresholdMetrics = {
  threshold: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
};

type CostModel = {
  blockBenign: number;
  warnBenign: number;
  allowMalicious: number;
  warnMalicious: number;
};

type CostSummary = {
  totalCost: number;
  averageCost: number;
  totalWeight: number;
  weightedFalsePositiveBlocks: number;
  weightedFalsePositiveWarns: number;
  weightedFalseNegativeAllows: number;
  weightedFalseNegativeWarns: number;
};

type ThresholdPairEvaluation = CostSummary & {
  warnThreshold: number;
  blockThreshold: number;
};

type DriftDatasetRow = {
  identifier?: unknown;
  protect?: unknown;
  target?: unknown;
};

type DriftComparisonRow = {
  identifier: string;
  protect: string[];
  scoreFull: number;
  scoreFiltered: number;
  actionFull: RiskAction;
  actionFiltered: RiskAction;
  delta: number;
  topFull?: string;
  topFiltered?: string;
};

type DriftAnalysisOutput = {
  dataset: string;
  total: number;
  actionFlips: number;
  stricterUnderFull: number;
  stricterUnderFiltered: number;
  averageScoreDelta: number;
  maxAbsScoreDelta: number;
  changedCount: number;
  changedPreview: DriftComparisonRow[];
  mapsCompared: {
    full: "CONFUSABLE_MAP_FULL";
    filtered: "CONFUSABLE_MAP";
  };
};

type CanonicalAuditDatasetRow = Record<string, unknown>;

type CanonicalAuditRow = {
  index: number;
  id?: string;
  source?: string;
  raw: string;
  normalized: string;
  storedCanonical?: string;
};

type CanonicalAuditCollision = {
  canonical: string;
  count: number;
  rows: CanonicalAuditRow[];
};

type CanonicalAuditOutput = {
  dataset: string;
  total: number;
  processed: number;
  skipped: number;
  collisions: number;
  conflictingRows: number;
  canonicalMismatches: number;
  collisionsPreview: CanonicalAuditCollision[];
};

type AttackGenerationMode = "impersonation" | "evasion";
type AttackMapMode = "filtered" | "full";

type AttackSeed = {
  identifier: string;
  edits: number;
  kind: "substitution" | "ascii-lookalike" | "ignorable-insert";
  operations: string[];
};

type AttackCandidate = AttackSeed & {
  normalized: string;
  score: number;
  action: RiskAction;
  level: string;
  formatValid: boolean;
  formatMessage: string | null;
  topTarget?: string;
  topScore?: number;
  topDistance?: number;
  topChainDepth?: number;
  reasons: string[];
};

type AttackGenerationOutput = {
  target: string;
  normalizedTarget: string;
  protect: string[];
  mode: AttackGenerationMode;
  map: "CONFUSABLE_MAP" | "CONFUSABLE_MAP_FULL";
  settings: {
    maxCandidates: number;
    maxEdits: number;
    maxPerChar: number;
    includeIgnorables: boolean;
    warnThreshold?: number;
    blockThreshold?: number;
  };
  generated: {
    total: number;
    substitution: number;
    asciiLookalike: number;
    ignorableInsert: number;
  };
  outcomes: {
    allow: number;
    warn: number;
    block: number;
  };
  bypassCount: number;
  previews: {
    bypass: AttackCandidate[];
    topRisk: AttackCandidate[];
    blocked: AttackCandidate[];
  };
};

const DEFAULT_COST_MODEL: CostModel = {
  blockBenign: 8,
  warnBenign: 1,
  allowMalicious: 12,
  warnMalicious: 3,
};

function parseBooleanLabel(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["1", "true", "attack", "malicious", "spoof", "positive"].includes(v)) {
      return true;
    }
    if (["0", "false", "benign", "safe", "negative"].includes(v)) {
      return false;
    }
  }
  return null;
}

function parseProtectList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function pickString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function parseCanonicalAuditRow(
  row: CanonicalAuditDatasetRow,
  index: number
): CanonicalAuditRow | null {
  const raw = pickString(row, ["identifier", "raw", "handle", "slug", "username", "value"]);
  if (!raw) return null;

  const id = pickString(row, ["id", "_id", "uuid"]);
  const source = pickString(row, ["source", "table", "model"]);
  const storedCanonical = pickString(row, [
    "canonical",
    "normalized",
    "handleCanonical",
    "slugCanonical",
    "handle_canonical",
    "slug_canonical",
  ]);

  return {
    index,
    id,
    source,
    raw,
    normalized: normalize(raw),
    storedCanonical,
  };
}

function analyzeCanonicalDataset(
  rows: CanonicalAuditDatasetRow[],
  options: { datasetLabel: string; limit: number }
): CanonicalAuditOutput {
  const parsed: CanonicalAuditRow[] = [];
  let skipped = 0;
  let canonicalMismatches = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = parseCanonicalAuditRow(rows[i], i + 1);
    if (!row) {
      skipped++;
      continue;
    }
    if (row.storedCanonical !== undefined && row.storedCanonical !== row.normalized) {
      canonicalMismatches++;
    }
    parsed.push(row);
  }

  const groups = new Map<string, CanonicalAuditRow[]>();
  for (const row of parsed) {
    const bucket = groups.get(row.normalized);
    if (bucket) bucket.push(row);
    else groups.set(row.normalized, [row]);
  }

  const collisions = Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .map(([canonical, group]) => ({
      canonical,
      count: group.length,
      rows: group.sort((a, b) => a.raw.localeCompare(b.raw)),
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.canonical.localeCompare(b.canonical);
    });

  const conflictingRows = collisions.reduce((sum, row) => sum + row.count, 0);

  return {
    dataset: options.datasetLabel,
    total: rows.length,
    processed: parsed.length,
    skipped,
    collisions: collisions.length,
    conflictingRows,
    canonicalMismatches,
    collisionsPreview: collisions.slice(0, options.limit),
  };
}

function printCanonicalAuditOutput(output: CanonicalAuditOutput): void {
  console.log(
    `Canonical audit (${output.dataset}) — ${output.processed}/${output.total} processed, ${output.collisions} collision group(s)`
  );
  console.log(
    `Conflicting rows: ${output.conflictingRows}, stored-canonical mismatches: ${output.canonicalMismatches}, skipped rows: ${output.skipped}`
  );

  for (const group of output.collisionsPreview) {
    console.log(`canonical "${group.canonical}" -> ${group.count} row(s)`);
    for (const row of group.rows) {
      const idLabel = row.id ? ` id=${JSON.stringify(row.id)}` : "";
      const sourceLabel = row.source ? ` source=${JSON.stringify(row.source)}` : "";
      const canonicalLabel =
        row.storedCanonical !== undefined
          ? ` storedCanonical=${JSON.stringify(row.storedCanonical)}`
          : "";
      console.log(
        `  row ${row.index}:${idLabel}${sourceLabel} raw=${JSON.stringify(row.raw)} normalized=${JSON.stringify(row.normalized)}${canonicalLabel}`
      );
    }
  }
}

function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

const ASCII_LOOKALIKE_REPLACEMENTS: Record<string, string[]> = {
  a: ["4"],
  b: ["8"],
  e: ["3"],
  g: ["9"],
  i: ["1"],
  l: ["1"],
  o: ["0"],
  s: ["5"],
  t: ["7"],
  z: ["2"],
  "0": ["o"],
  "1": ["l", "i"],
  "2": ["z"],
  "3": ["e"],
  "4": ["a"],
  "5": ["s"],
  "7": ["t"],
  "8": ["b"],
  "9": ["g"],
};

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function parseAttackGenerationMode(value: string | undefined): AttackGenerationMode | null {
  if (value === undefined) return "evasion";
  if (value === "impersonation" || value === "evasion") return value;
  return null;
}

function parseAttackMapMode(
  value: string | undefined,
  mode: AttackGenerationMode
): AttackMapMode | null {
  if (value === undefined) return mode === "evasion" ? "full" : "filtered";
  if (value === "filtered" || value === "full") return value;
  return null;
}

function codePointLabel(char: string): string {
  const cp = char.codePointAt(0);
  if (cp === undefined) return "U+0000";
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

function buildConfusablePrototypeBuckets(
  map: Record<string, string>,
  maxPerChar: number
): Record<string, string[]> {
  const buckets: Record<string, string[]> = {};

  for (const [char, prototype] of Object.entries(map)) {
    if (!/^[a-z0-9]$/.test(prototype)) continue;
    if (char === prototype) continue;
    if (!buckets[prototype]) buckets[prototype] = [];
    buckets[prototype].push(char);
  }

  for (const [prototype, chars] of Object.entries(buckets)) {
    const unique = uniqueStrings(chars);
    unique.sort((a, b) => {
      const aCp = a.codePointAt(0) ?? 0;
      const bCp = b.codePointAt(0) ?? 0;
      const aAscii = aCp <= 0x7f ? 1 : 0;
      const bAscii = bCp <= 0x7f ? 1 : 0;
      if (aAscii !== bAscii) return aAscii - bAscii;

      const aNfkcMatches = a.normalize("NFKC").toLowerCase() === prototype ? 0 : 1;
      const bNfkcMatches = b.normalize("NFKC").toLowerCase() === prototype ? 0 : 1;
      if (aNfkcMatches !== bNfkcMatches) return aNfkcMatches - bNfkcMatches;

      if (aCp !== bCp) return aCp - bCp;
      return a.localeCompare(b);
    });
    buckets[prototype] = unique.slice(0, maxPerChar);
  }

  return buckets;
}

function generateAttackSeeds(
  target: string,
  map: Record<string, string>,
  options: {
    mode: AttackGenerationMode;
    maxCandidates: number;
    maxEdits: number;
    maxPerChar: number;
    includeIgnorables: boolean;
  }
): AttackSeed[] {
  const chars = Array.from(target);
  const buckets = buildConfusablePrototypeBuckets(map, options.maxPerChar);
  const seeds = new Map<string, AttackSeed>();
  const generationCap = Math.max(200, options.maxCandidates * 20);

  function replacementOptions(
    char: string
  ): Array<{ to: string; kind: "substitution" | "ascii-lookalike" }> {
    const out: Array<{ to: string; kind: "substitution" | "ascii-lookalike" }> = [];
    const seen = new Set<string>();

    if (options.mode === "evasion") {
      const asciiLookalike = ASCII_LOOKALIKE_REPLACEMENTS[char] ?? [];
      for (const to of asciiLookalike) {
        if (seen.has(to)) continue;
        seen.add(to);
        out.push({ to, kind: "ascii-lookalike" });
      }
    }

    const confusable = buckets[char] ?? [];
    for (const to of confusable) {
      if (seen.has(to)) continue;
      seen.add(to);
      out.push({ to, kind: "substitution" });
    }

    return out.slice(0, options.maxPerChar);
  }

  function addSeed(seed: AttackSeed): void {
    if (seed.identifier === target) return;
    if (seeds.has(seed.identifier)) return;
    seeds.set(seed.identifier, seed);
  }

  for (let i = 0; i < chars.length; i++) {
    const from = chars[i];
    for (const replacement of replacementOptions(from)) {
      const { to, kind } = replacement;
      const next = [...chars];
      next[i] = to;
      addSeed({
        identifier: next.join(""),
        edits: 1,
        kind,
        operations: [
          `replace ${from} with ${to} at ${i}${kind === "ascii-lookalike" ? " (ascii lookalike)" : ""}`,
        ],
      });
      if (seeds.size >= generationCap) return Array.from(seeds.values());
    }
  }

  if (options.includeIgnorables && chars.length > 1) {
    const invisibles = ["\u200B", "\u200C", "\u200D"];
    for (let i = 1; i < chars.length; i++) {
      for (const insertChar of invisibles) {
        const next = [...chars];
        next.splice(i, 0, insertChar);
        addSeed({
          identifier: next.join(""),
          edits: 1,
          kind: "ignorable-insert",
          operations: [`insert ${codePointLabel(insertChar)} at ${i}`],
        });
        if (seeds.size >= generationCap) return Array.from(seeds.values());
      }
    }
  }

  if (options.maxEdits >= 2) {
    for (let i = 0; i < chars.length; i++) {
      const fromA = chars[i];
      const replacementsA = replacementOptions(fromA);
      if (replacementsA.length === 0) continue;

      for (let j = i + 1; j < chars.length; j++) {
        const fromB = chars[j];
        const replacementsB = replacementOptions(fromB);
        if (replacementsB.length === 0) continue;

        for (const repA of replacementsA) {
          for (const repB of replacementsB) {
            const toA = repA.to;
            const toB = repB.to;
            const kind =
              repA.kind === "ascii-lookalike" || repB.kind === "ascii-lookalike"
                ? "ascii-lookalike"
                : "substitution";
            const next = [...chars];
            next[i] = toA;
            next[j] = toB;
            addSeed({
              identifier: next.join(""),
              edits: 2,
              kind,
              operations: [
                `replace ${fromA} with ${toA} at ${i}${repA.kind === "ascii-lookalike" ? " (ascii lookalike)" : ""}`,
                `replace ${fromB} with ${toB} at ${j}${repB.kind === "ascii-lookalike" ? " (ascii lookalike)" : ""}`,
              ],
            });
            if (seeds.size >= generationCap) return Array.from(seeds.values());
          }
        }
      }
    }
  }

  return Array.from(seeds.values());
}

function rankAttackCandidates(a: AttackCandidate, b: AttackCandidate): number {
  if (b.score !== a.score) return b.score - a.score;
  const actionDelta = actionSeverity(b.action) - actionSeverity(a.action);
  if (actionDelta !== 0) return actionDelta;
  if (a.edits !== b.edits) return a.edits - b.edits;
  return a.identifier.localeCompare(b.identifier);
}

function printAttackGenerationOutput(output: AttackGenerationOutput): void {
  console.log(
    `Attack generation results for ${JSON.stringify(output.target)} (normalized: ${JSON.stringify(output.normalizedTarget)})`
  );
  console.log(
    `Mode: ${output.mode}, map: ${output.map}, protect: [${output.protect.join(", ")}], generated: ${output.generated.total} (confusable ${output.generated.substitution}, ascii-lookalike ${output.generated.asciiLookalike}, ignorable ${output.generated.ignorableInsert})`
  );
  console.log(
    `Outcomes: allow ${output.outcomes.allow}, warn ${output.outcomes.warn}, block ${output.outcomes.block}`
  );
  console.log(`Bypasses (non-blocking + format-valid): ${output.bypassCount}`);

  if (output.previews.bypass.length > 0) {
    console.log("Top allow/bypass candidates:");
    for (const row of output.previews.bypass) {
      console.log(
        `  ${JSON.stringify(row.identifier)} score ${row.score} (${row.action}) edits ${row.edits}${row.topTarget ? ` vs ${row.topTarget}` : ""}`
      );
    }
  }

  if (output.previews.topRisk.length > 0) {
    console.log("Top risk candidates:");
    for (const row of output.previews.topRisk) {
      console.log(
        `  ${JSON.stringify(row.identifier)} score ${row.score} (${row.action}) edits ${row.edits}${row.topTarget ? ` vs ${row.topTarget}` : ""}`
      );
    }
  }
}

function computeThresholdMetrics(
  scoredRows: ScoredCalibrationRow[],
  threshold: number
): ThresholdMetrics {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  for (const row of scoredRows) {
    const predictedMalicious = row.score >= threshold;
    if (predictedMalicious && row.malicious) tp++;
    else if (predictedMalicious && !row.malicious) fp++;
    else if (!predictedMalicious && row.malicious) fn++;
    else tn++;
  }

  const precision = safeDivide(tp, tp + fp);
  const recall = safeDivide(tp, tp + fn);
  const f1 = safeDivide(2 * precision * recall, precision + recall);
  const accuracy = safeDivide(tp + tn, scoredRows.length);

  return {
    threshold,
    tp,
    fp,
    tn,
    fn,
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
    accuracy: round(accuracy),
  };
}

function parseExampleWeight(value: unknown): number | null {
  if (value === undefined || value === null) return 1;
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function applyMaliciousPriorWeights(
  rows: ScoredCalibrationRow[],
  prior: number
): { rows: ScoredCalibrationRow[]; maliciousWeightMultiplier: number; benignWeightMultiplier: number } {
  const maliciousCount = rows.filter((r) => r.malicious).length;
  const benignCount = rows.length - maliciousCount;
  const maliciousRate = safeDivide(maliciousCount, rows.length);
  const benignRate = 1 - maliciousRate;

  if (prior > 0 && maliciousCount === 0) {
    throw new Error(
      "Cannot apply --malicious-prior > 0 because the dataset has no malicious rows."
    );
  }
  if (prior < 1 && benignCount === 0) {
    throw new Error(
      "Cannot apply --malicious-prior < 1 because the dataset has no benign rows."
    );
  }

  const maliciousWeightMultiplier =
    maliciousRate > 0 ? prior / maliciousRate : 0;
  const benignWeightMultiplier =
    benignRate > 0 ? (1 - prior) / benignRate : 0;

  return {
    rows: rows.map((row) => ({
      ...row,
      weight:
        row.weight *
        (row.malicious ? maliciousWeightMultiplier : benignWeightMultiplier),
    })),
    maliciousWeightMultiplier: round(maliciousWeightMultiplier),
    benignWeightMultiplier: round(benignWeightMultiplier),
  };
}

function computePolicyCost(
  rows: ScoredCalibrationRow[],
  warnThreshold: number,
  blockThreshold: number,
  costs: CostModel
): CostSummary {
  let totalWeight = 0;
  let totalCost = 0;
  let weightedFalsePositiveBlocks = 0;
  let weightedFalsePositiveWarns = 0;
  let weightedFalseNegativeAllows = 0;
  let weightedFalseNegativeWarns = 0;

  for (const row of rows) {
    const action =
      row.score >= blockThreshold ? "block" : row.score >= warnThreshold ? "warn" : "allow";
    const w = row.weight;
    totalWeight += w;

    if (row.malicious) {
      if (action === "allow") {
        totalCost += costs.allowMalicious * w;
        weightedFalseNegativeAllows += w;
      } else if (action === "warn") {
        totalCost += costs.warnMalicious * w;
        weightedFalseNegativeWarns += w;
      }
    } else {
      if (action === "block") {
        totalCost += costs.blockBenign * w;
        weightedFalsePositiveBlocks += w;
      } else if (action === "warn") {
        totalCost += costs.warnBenign * w;
        weightedFalsePositiveWarns += w;
      }
    }
  }

  return {
    totalCost: round(totalCost),
    averageCost: round(safeDivide(totalCost, totalWeight)),
    totalWeight: round(totalWeight),
    weightedFalsePositiveBlocks: round(weightedFalsePositiveBlocks),
    weightedFalsePositiveWarns: round(weightedFalsePositiveWarns),
    weightedFalseNegativeAllows: round(weightedFalseNegativeAllows),
    weightedFalseNegativeWarns: round(weightedFalseNegativeWarns),
  };
}

function actionSeverity(action: RiskAction): number {
  if (action === "allow") return 0;
  if (action === "warn") return 1;
  return 2;
}

function analyzeDrift(
  guard: NamespaceGuard,
  driftRows: DriftDatasetRow[],
  options: {
    datasetLabel: string;
    protect: string[];
    includeReserved: boolean;
    warnThreshold?: number;
    blockThreshold?: number;
    maxMatches?: number;
    limit: number;
  }
): DriftAnalysisOutput {
  const comparisons: DriftComparisonRow[] = [];

  for (let i = 0; i < driftRows.length; i++) {
    const row = driftRows[i];
    if (typeof row.identifier !== "string" || row.identifier.trim() === "") {
      throw new Error(`Row ${i + 1} is missing a valid "identifier" string.`);
    }
    const identifier = row.identifier;
    const rowProtect = [
      ...parseProtectList(row.protect),
      ...parseProtectList(row.target),
    ];
    const protectTargets = rowProtect.length > 0 ? rowProtect : options.protect;

    const optionsBase: CheckRiskOptions = {
      protect: protectTargets.length > 0 ? protectTargets : undefined,
      includeReserved: options.includeReserved,
      ...(options.warnThreshold !== undefined
        ? { warnThreshold: options.warnThreshold }
        : {}),
      ...(options.blockThreshold !== undefined
        ? { blockThreshold: options.blockThreshold }
        : {}),
      ...(options.maxMatches !== undefined ? { maxMatches: options.maxMatches } : {}),
    };

    const full = guard.checkRisk(identifier, {
      ...optionsBase,
      map: CONFUSABLE_MAP_FULL,
    });
    const filtered = guard.checkRisk(identifier, {
      ...optionsBase,
      map: CONFUSABLE_MAP,
    });

    comparisons.push({
      identifier,
      protect: protectTargets,
      scoreFull: full.score,
      scoreFiltered: filtered.score,
      actionFull: full.action,
      actionFiltered: filtered.action,
      delta: round(full.score - filtered.score),
      topFull: full.matches[0]?.target,
      topFiltered: filtered.matches[0]?.target,
    });
  }

  const total = comparisons.length;
  const actionFlips = comparisons.filter((r) => r.actionFull !== r.actionFiltered).length;
  const stricterUnderFull = comparisons.filter(
    (r) => actionSeverity(r.actionFull) > actionSeverity(r.actionFiltered)
  ).length;
  const stricterUnderFiltered = comparisons.filter(
    (r) => actionSeverity(r.actionFiltered) > actionSeverity(r.actionFull)
  ).length;
  const averageScoreDelta = round(
    safeDivide(
      comparisons.reduce((sum, row) => sum + row.delta, 0),
      comparisons.length
    )
  );
  const maxAbsScoreDelta = round(
    comparisons.reduce((max, row) => Math.max(max, Math.abs(row.delta)), 0)
  );

  const changedRows = comparisons
    .filter(
      (row) =>
        row.actionFull !== row.actionFiltered ||
        row.delta !== 0 ||
        row.topFull !== row.topFiltered
    )
    .sort((a, b) => {
      if (Math.abs(b.delta) !== Math.abs(a.delta)) {
        return Math.abs(b.delta) - Math.abs(a.delta);
      }
      if (a.actionFull !== a.actionFiltered && b.actionFull === b.actionFiltered) return -1;
      if (b.actionFull !== b.actionFiltered && a.actionFull === a.actionFiltered) return 1;
      return a.identifier.localeCompare(b.identifier);
    });

  const changedPreview = changedRows.slice(0, options.limit);

  return {
    dataset: options.datasetLabel,
    total,
    actionFlips,
    stricterUnderFull,
    stricterUnderFiltered,
    averageScoreDelta,
    maxAbsScoreDelta,
    changedCount: changedRows.length,
    changedPreview,
    mapsCompared: {
      full: "CONFUSABLE_MAP_FULL",
      filtered: "CONFUSABLE_MAP",
    },
  };
}

function printDriftOutput(output: DriftAnalysisOutput): void {
  console.log(
    `Drift results (${output.dataset}) — ${output.total} rows, ${output.actionFlips} action flip(s)`
  );
  console.log(
    `Full stricter: ${output.stricterUnderFull}, filtered stricter: ${output.stricterUnderFiltered}, average score Δ: ${output.averageScoreDelta}, max |Δ|: ${output.maxAbsScoreDelta}`
  );
  for (const row of output.changedPreview) {
    const printableIdentifier = JSON.stringify(row.identifier);
    const protectLabel = row.protect.length > 0 ? row.protect.join(",") : "(none)";
    console.log(
      `${printableIdentifier}: full ${row.scoreFull}/${row.actionFull} vs filtered ${row.scoreFiltered}/${row.actionFiltered} (Δ ${row.delta}) targets [${protectLabel}]`
    );
  }
}

export async function run(argv: string[] = process.argv): Promise<number> {
  const {
    command,
    slug,
    config: configPath,
    databaseUrl,
    protect,
    includeReserved,
    warnThreshold,
    blockThreshold,
    maxMatches,
    attackMode,
    mapMode,
    maxCandidates,
    maxEdits,
    maxPerChar,
    includeIgnorables,
    failOn,
    targetRecall,
    costBlockBenign,
    costWarnBenign,
    costAllowMalicious,
    costWarnMalicious,
    maliciousPrior,
    limit,
    json,
    help,
  } =
    parseArgs(argv);

  if (help || !command) {
    printUsage();
    return help ? 0 : 1;
  }

  if (
    command !== "check" &&
    command !== "risk" &&
    command !== "attack-gen" &&
    command !== "audit-canonical" &&
    command !== "calibrate" &&
    command !== "recommend" &&
    command !== "drift"
  ) {
    console.error(`Unknown command: ${command}`);
    printUsage();
    return 1;
  }

  if (
    (command === "check" ||
      command === "risk" ||
      command === "attack-gen" ||
      command === "audit-canonical" ||
      command === "calibrate" ||
      command === "recommend") &&
    !slug
  ) {
    if (command === "check") {
      console.error("Missing slug argument");
    } else if (command === "risk" || command === "attack-gen") {
      console.error("Missing identifier argument");
    } else {
      console.error("Missing dataset file argument");
    }
    printUsage();
    return 1;
  }

  if (
    (command === "risk" ||
      command === "attack-gen" ||
      command === "audit-canonical" ||
      command === "calibrate" ||
      command === "recommend" ||
      command === "drift") &&
    databaseUrl
  ) {
    console.error("--database-url is only supported with the check command.");
    return 1;
  }

  if (
    warnThreshold !== undefined &&
    (!Number.isFinite(warnThreshold) || warnThreshold < 0 || warnThreshold > 100)
  ) {
    console.error(`Invalid --warn-threshold value: ${warnThreshold}`);
    return 1;
  }

  if (
    blockThreshold !== undefined &&
    (!Number.isFinite(blockThreshold) || blockThreshold < 0 || blockThreshold > 100)
  ) {
    console.error(`Invalid --block-threshold value: ${blockThreshold}`);
    return 1;
  }

  if (
    maxMatches !== undefined &&
    (!Number.isFinite(maxMatches) || maxMatches < 1 || !Number.isInteger(maxMatches))
  ) {
    console.error(`Invalid --max-matches value: ${maxMatches}`);
    return 1;
  }

  const parsedAttackMode = parseAttackGenerationMode(attackMode);
  if (parsedAttackMode === null) {
    console.error(
      `Invalid --mode value: ${attackMode} (expected "impersonation" or "evasion")`
    );
    return 1;
  }

  const parsedAttackMapMode = parseAttackMapMode(mapMode, parsedAttackMode);
  if (parsedAttackMapMode === null) {
    console.error(`Invalid --map value: ${mapMode} (expected "filtered" or "full")`);
    return 1;
  }

  if (
    maxCandidates !== undefined &&
    (!Number.isFinite(maxCandidates) ||
      maxCandidates < 1 ||
      !Number.isInteger(maxCandidates))
  ) {
    console.error(`Invalid --max-candidates value: ${maxCandidates}`);
    return 1;
  }

  if (
    maxEdits !== undefined &&
    (!Number.isFinite(maxEdits) ||
      !Number.isInteger(maxEdits) ||
      maxEdits < 1 ||
      maxEdits > 2)
  ) {
    console.error(`Invalid --max-edits value: ${maxEdits} (expected 1 or 2)`);
    return 1;
  }

  if (
    maxPerChar !== undefined &&
    (!Number.isFinite(maxPerChar) ||
      !Number.isInteger(maxPerChar) ||
      maxPerChar < 1)
  ) {
    console.error(`Invalid --max-per-char value: ${maxPerChar}`);
    return 1;
  }

  if (failOn !== undefined && failOn !== "block" && failOn !== "warn") {
    console.error(`Invalid --fail-on mode: ${failOn} (expected "block" or "warn")`);
    return 1;
  }

  if (
    targetRecall !== undefined &&
    (!Number.isFinite(targetRecall) || targetRecall < 0 || targetRecall > 1)
  ) {
    console.error(`Invalid --target-recall value: ${targetRecall}`);
    return 1;
  }

  const costInputs = [
    ["--cost-block-benign", costBlockBenign],
    ["--cost-warn-benign", costWarnBenign],
    ["--cost-allow-malicious", costAllowMalicious],
    ["--cost-warn-malicious", costWarnMalicious],
  ] as const;
  for (const [flag, value] of costInputs) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      console.error(`Invalid ${flag} value: ${value}`);
      return 1;
    }
  }

  if (
    maliciousPrior !== undefined &&
    (!Number.isFinite(maliciousPrior) || maliciousPrior < 0 || maliciousPrior > 1)
  ) {
    console.error(`Invalid --malicious-prior value: ${maliciousPrior}`);
    return 1;
  }

  if (
    limit !== undefined &&
    (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1)
  ) {
    console.error(`Invalid --limit value: ${limit}`);
    return 1;
  }

  const fileConfig = loadConfig(configPath);

  let parsedPattern: RegExp | undefined;
  if (fileConfig.pattern) {
    try {
      parsedPattern = new RegExp(fileConfig.pattern);
    } catch {
      console.error(`Invalid regex pattern in config: ${fileConfig.pattern}`);
      return 1;
    }
  }

  const guardConfig: NamespaceConfig = {
    reserved: fileConfig.reserved,
    sources: fileConfig.sources ?? [],
    ...(parsedPattern ? { pattern: parsedPattern } : {}),
  };

  let cleanup: (() => Promise<void>) | undefined;
  let adapter: NamespaceAdapter;

  if (command === "check" && databaseUrl) {
    const db = await createDatabaseAdapter(databaseUrl);
    adapter = db.adapter;
    cleanup = db.cleanup;
  } else {
    adapter = createNoopAdapter();
  }

  try {
    const guard = createNamespaceGuard(guardConfig, adapter);
    if (command === "check") {
      const normalized = normalize(slug!);
      const result = await guard.check(normalized);

      if (result.available) {
        console.log(`\u2713 ${normalized} is available`);
        return 0;
      }
      const suffix = result.source ? ` (source: ${result.source})` : "";
      console.log(`\u2717 ${normalized} \u2014 ${result.message}${suffix}`);
      return 1;
    }

    if (command === "risk") {
      const normalized = normalize(slug!);
      const riskOptions: CheckRiskOptions = {
        protect: protect.length > 0 ? protect : undefined,
        includeReserved,
        ...(warnThreshold !== undefined ? { warnThreshold } : {}),
        ...(blockThreshold !== undefined ? { blockThreshold } : {}),
        ...(maxMatches !== undefined ? { maxMatches } : {}),
      };

      const risk = guard.checkRisk(normalized, riskOptions);
      const icon =
        risk.action === "block" ? "\u26d4" : risk.action === "warn" ? "\u26a0" : "\u2713";

      if (json) {
        console.log(JSON.stringify(risk, null, 2));
      } else {
        console.log(`${icon} ${normalized} \u2014 risk ${risk.score}/100 (${risk.action})`);
        if (risk.matches[0]) {
          const top = risk.matches[0];
          console.log(
            `Top match: ${top.target} (score ${top.score}, distance ${top.distance}, chain depth ${top.chainDepth})`
          );
          if (top.reasons.length > 0) {
            console.log(`Signals: ${top.reasons.join(", ")}`);
          }
        }
      }

      const failureMode = failOn ?? "block";
      if (failureMode === "warn") {
        return risk.action === "allow" ? 0 : 1;
      }
      return risk.action === "block" ? 1 : 0;
    }

    if (command === "attack-gen") {
      const normalizedTarget = normalize(slug!);
      if (!normalizedTarget) {
        console.error("Target normalizes to an empty identifier.");
        return 1;
      }

      const attackMaxCandidates = maxCandidates ?? 25;
      const attackMaxEdits = maxEdits ?? 2;
      const attackMaxPerChar = maxPerChar ?? 8;
      const attackMap =
        parsedAttackMapMode === "full" ? CONFUSABLE_MAP_FULL : CONFUSABLE_MAP;
      const protectTargets = uniqueStrings(
        protect.length > 0 ? protect : [normalizedTarget]
      );

      const seeds = generateAttackSeeds(normalizedTarget, attackMap, {
        mode: parsedAttackMode,
        maxCandidates: attackMaxCandidates,
        maxEdits: attackMaxEdits,
        maxPerChar: attackMaxPerChar,
        includeIgnorables,
      });

      const evaluated: AttackCandidate[] = [];
      for (const seed of seeds) {
        const risk = guard.checkRisk(seed.identifier, {
          protect: protectTargets,
          includeReserved,
          map: attackMap,
          ...(warnThreshold !== undefined ? { warnThreshold } : {}),
          ...(blockThreshold !== undefined ? { blockThreshold } : {}),
          ...(maxMatches !== undefined ? { maxMatches } : {}),
        });

        const formatMessage = guard.validateFormatOnly(seed.identifier);
        const top = risk.matches[0];
        evaluated.push({
          ...seed,
          normalized: risk.normalized,
          score: risk.score,
          action: risk.action,
          level: risk.level,
          formatValid: formatMessage === null,
          formatMessage,
          topTarget: top?.target,
          topScore: top?.score,
          topDistance: top?.distance,
          topChainDepth: top?.chainDepth,
          reasons: risk.reasons.map((reason) => reason.code),
        });
      }

      evaluated.sort(rankAttackCandidates);

      const previewLimit = Math.min(50, attackMaxCandidates);
      const outcomes = {
        allow: evaluated.filter((row) => row.action === "allow").length,
        warn: evaluated.filter((row) => row.action === "warn").length,
        block: evaluated.filter((row) => row.action === "block").length,
      };
      const bypassRows = evaluated.filter(
        (row) => row.action !== "block" && row.formatValid
      );
      const blockedRows = evaluated.filter((row) => row.action === "block");
      const output: AttackGenerationOutput = {
        target: slug!,
        normalizedTarget,
        protect: protectTargets,
        mode: parsedAttackMode,
        map:
          parsedAttackMapMode === "full"
            ? "CONFUSABLE_MAP_FULL"
            : "CONFUSABLE_MAP",
        settings: {
          maxCandidates: attackMaxCandidates,
          maxEdits: attackMaxEdits,
          maxPerChar: attackMaxPerChar,
          includeIgnorables,
          ...(warnThreshold !== undefined ? { warnThreshold } : {}),
          ...(blockThreshold !== undefined ? { blockThreshold } : {}),
        },
        generated: {
          total: evaluated.length,
          substitution: seeds.filter((seed) => seed.kind === "substitution").length,
          asciiLookalike: seeds.filter((seed) => seed.kind === "ascii-lookalike").length,
          ignorableInsert: seeds.filter((seed) => seed.kind === "ignorable-insert").length,
        },
        outcomes,
        bypassCount: bypassRows.length,
        previews: {
          bypass: bypassRows.slice(0, previewLimit),
          topRisk: evaluated.slice(0, previewLimit),
          blocked: blockedRows.slice(0, previewLimit),
        },
      };

      if (json) {
        console.log(JSON.stringify(output, null, 2));
      } else {
        printAttackGenerationOutput(output);
      }

      return 0;
    }

    if (command === "audit-canonical") {
      const datasetPath = resolve(slug!);
      if (!existsSync(datasetPath)) {
        console.error(`Dataset file not found: ${datasetPath}`);
        return 1;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(datasetPath, "utf-8"));
      } catch {
        console.error(`Failed to parse dataset file: ${datasetPath}`);
        return 1;
      }

      if (!Array.isArray(parsed)) {
        console.error("Canonical audit dataset must be a JSON array.");
        return 1;
      }

      if (parsed.length === 0) {
        console.error("Canonical audit dataset is empty.");
        return 1;
      }

      const output = analyzeCanonicalDataset(
        parsed as CanonicalAuditDatasetRow[],
        {
          datasetLabel: datasetPath,
          limit: limit ?? 10,
        }
      );

      if (json) {
        console.log(JSON.stringify(output, null, 2));
      } else {
        printCanonicalAuditOutput(output);
      }

      return output.collisions > 0 || output.canonicalMismatches > 0 ? 1 : 0;
    }

    if (command === "calibrate" || command === "recommend") {
      const datasetPath = resolve(slug!);
      if (!existsSync(datasetPath)) {
        console.error(`Dataset file not found: ${datasetPath}`);
        return 1;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(datasetPath, "utf-8"));
      } catch {
        console.error(`Failed to parse dataset file: ${datasetPath}`);
        return 1;
      }

      if (!Array.isArray(parsed)) {
        console.error("Calibration dataset must be a JSON array.");
        return 1;
      }

      const rows = parsed as CalibrationDatasetRow[];
      if (rows.length === 0) {
        console.error("Calibration dataset is empty.");
        return 1;
      }

      const scoredRows: ScoredCalibrationRow[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (typeof row.identifier !== "string" || row.identifier.trim() === "") {
          console.error(`Row ${i + 1} is missing a valid "identifier" string.`);
          return 1;
        }

        const label =
          parseBooleanLabel(row.label) ??
          parseBooleanLabel(row.malicious) ??
          parseBooleanLabel(row.attack);
        if (label === null) {
          console.error(
            `Row ${i + 1} is missing a valid label. Use label/malicious/attack as true|false, 1|0, malicious|benign.`
          );
          return 1;
        }

        const weight = parseExampleWeight(row.weight);
        if (weight === null) {
          console.error(`Row ${i + 1} has an invalid "weight" value. Use a positive number.`);
          return 1;
        }

        const rowProtect = [
          ...parseProtectList(row.protect),
          ...parseProtectList(row.target),
        ];
        const protectTargets = rowProtect.length > 0 ? rowProtect : protect;

        const risk = guard.checkRisk(row.identifier, {
          protect: protectTargets.length > 0 ? protectTargets : undefined,
          includeReserved,
        });

        scoredRows.push({
          identifier: row.identifier,
          score: risk.score,
          malicious: label,
          weight,
        });
      }

      const thresholdMetrics: ThresholdMetrics[] = [];
      for (let t = 0; t <= 100; t++) {
        thresholdMetrics.push(computeThresholdMetrics(scoredRows, t));
      }

      const desiredRecall = targetRecall ?? 0.9;
      const recallEligibleThresholds = new Set(
        thresholdMetrics
          .filter((m) => m.recall >= desiredRecall)
          .map((m) => m.threshold)
      );
      const enforceRecallConstraint = recallEligibleThresholds.size > 0;

      const costModel: CostModel = {
        blockBenign: costBlockBenign ?? DEFAULT_COST_MODEL.blockBenign,
        warnBenign: costWarnBenign ?? DEFAULT_COST_MODEL.warnBenign,
        allowMalicious: costAllowMalicious ?? DEFAULT_COST_MODEL.allowMalicious,
        warnMalicious: costWarnMalicious ?? DEFAULT_COST_MODEL.warnMalicious,
      };

      let weightedRows = scoredRows;
      let priorAdjustment:
        | {
            maliciousPrior: number;
            maliciousWeightMultiplier: number;
            benignWeightMultiplier: number;
          }
        | undefined;

      if (maliciousPrior !== undefined) {
        try {
          const adjusted = applyMaliciousPriorWeights(scoredRows, maliciousPrior);
          weightedRows = adjusted.rows;
          priorAdjustment = {
            maliciousPrior: round(maliciousPrior),
            maliciousWeightMultiplier: adjusted.maliciousWeightMultiplier,
            benignWeightMultiplier: adjusted.benignWeightMultiplier,
          };
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to apply malicious prior.";
          console.error(message);
          return 1;
        }
      }

      function findBestPolicy(enforceRecall: boolean): ThresholdPairEvaluation | null {
        let best: ThresholdPairEvaluation | null = null;

        for (let block = 0; block <= 100; block++) {
          for (let warn = 0; warn <= block; warn++) {
            if (enforceRecall && !recallEligibleThresholds.has(warn)) continue;

            const summary = computePolicyCost(weightedRows, warn, block, costModel);
            const candidate: ThresholdPairEvaluation = {
              warnThreshold: warn,
              blockThreshold: block,
              ...summary,
            };

            if (!best) {
              best = candidate;
              continue;
            }

            if (candidate.totalCost < best.totalCost) {
              best = candidate;
              continue;
            }
            if (candidate.totalCost > best.totalCost) {
              continue;
            }

            if (candidate.averageCost < best.averageCost) {
              best = candidate;
              continue;
            }
            if (candidate.averageCost > best.averageCost) {
              continue;
            }

            if (candidate.blockThreshold > best.blockThreshold) {
              best = candidate;
              continue;
            }
            if (candidate.blockThreshold < best.blockThreshold) {
              continue;
            }

            if (candidate.warnThreshold > best.warnThreshold) {
              best = candidate;
            }
          }
        }

        return best;
      }

      const bestPolicy =
        findBestPolicy(enforceRecallConstraint) ?? findBestPolicy(false);
      if (!bestPolicy) {
        console.error("Failed to find any valid threshold policy.");
        return 1;
      }

      const warnMetrics = thresholdMetrics[bestPolicy.warnThreshold];
      const blockMetrics = thresholdMetrics[bestPolicy.blockThreshold];

      const total = scoredRows.length;
      const maliciousCount = scoredRows.filter((r) => r.malicious).length;
      const benignCount = total - maliciousCount;
      const maliciousWeight = round(
        weightedRows
          .filter((r) => r.malicious)
          .reduce((sum, row) => sum + row.weight, 0)
      );
      const benignWeight = round(
        weightedRows
          .filter((r) => !r.malicious)
          .reduce((sum, row) => sum + row.weight, 0)
      );

      const output = {
        dataset: datasetPath,
        total,
        malicious: maliciousCount,
        benign: benignCount,
        weighted: {
          malicious: maliciousWeight,
          benign: benignWeight,
          total: round(maliciousWeight + benignWeight),
        },
        recommendations: {
          warnThreshold: bestPolicy.warnThreshold,
          blockThreshold: bestPolicy.blockThreshold,
        },
        metrics: {
          warn: warnMetrics,
          block: blockMetrics,
        },
        expectedCost: bestPolicy,
        costModel,
        targetRecall: desiredRecall,
        recallConstraintApplied: enforceRecallConstraint,
        ...(priorAdjustment ? { priorAdjustment } : {}),
      };

      if (command === "calibrate") {
        if (json) {
          console.log(JSON.stringify(output, null, 2));
        } else {
          console.log(
            `Calibration results (${total} rows: ${maliciousCount} malicious, ${benignCount} benign)`
          );
          console.log(
            `Recommended warn threshold: ${warnMetrics.threshold} (precision ${warnMetrics.precision}, recall ${warnMetrics.recall})`
          );
          console.log(
            `Recommended block threshold: ${blockMetrics.threshold} (precision ${blockMetrics.precision}, recall ${blockMetrics.recall}, f1 ${blockMetrics.f1})`
          );
          console.log(
            `Expected policy cost: ${bestPolicy.totalCost} (avg ${bestPolicy.averageCost} per weighted row)`
          );
          if (priorAdjustment) {
            console.log(
              `Prior weighting applied (malicious prior ${priorAdjustment.maliciousPrior}; multipliers m=${priorAdjustment.maliciousWeightMultiplier}, b=${priorAdjustment.benignWeightMultiplier})`
            );
          }
        }
        return 0;
      }

      const driftRows: DriftDatasetRow[] = rows.map((row) => ({
        identifier: row.identifier,
        protect: row.protect,
        target: row.target,
      }));

      const driftGuard = createNamespaceGuard(
        { ...guardConfig, normalizeUnicode: false },
        adapter
      );
      const driftLimit = limit ?? 10;

      let driftOutput: DriftAnalysisOutput;
      try {
        driftOutput = analyzeDrift(driftGuard, driftRows, {
          datasetLabel: datasetPath,
          protect,
          includeReserved,
          warnThreshold,
          blockThreshold,
          maxMatches,
          limit: driftLimit,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to compute drift analysis.";
        console.error(message);
        return 1;
      }

      const baselineRows: DriftDatasetRow[] = COMPOSABILITY_VECTORS.map(
        (row) => ({
          identifier: row.char,
          target: row.tr39,
          protect: [row.tr39],
        })
      );
      let driftBaseline: DriftAnalysisOutput;
      try {
        driftBaseline = analyzeDrift(driftGuard, baselineRows, {
          datasetLabel: "builtin:composability-vectors",
          protect,
          includeReserved,
          warnThreshold,
          blockThreshold,
          maxMatches,
          limit: driftLimit,
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to compute baseline drift analysis.";
        console.error(message);
        return 1;
      }

      const recommendedRiskConfig = {
        warnThreshold: bestPolicy.warnThreshold,
        blockThreshold: bestPolicy.blockThreshold,
        ...(protect.length > 0 ? { protect } : {}),
      };
      const ciBudgets = {
        maxActionFlips: driftBaseline.actionFlips,
        maxAverageScoreDelta: round(Math.abs(driftBaseline.averageScoreDelta)),
        maxAbsScoreDelta: driftBaseline.maxAbsScoreDelta,
      };
      const gateCommandParts = [
        "npm run ci:drift-gate --",
        `--max-action-flips ${ciBudgets.maxActionFlips}`,
        `--max-average-score-delta ${ciBudgets.maxAverageScoreDelta}`,
        `--max-abs-score-delta ${ciBudgets.maxAbsScoreDelta}`,
      ];
      const ciGateCommand = gateCommandParts.join(" ");

      const recommendOutput = {
        dataset: datasetPath,
        recommendedConfig: {
          risk: recommendedRiskConfig,
        },
        calibrate: output,
        drift: driftOutput,
        driftBaseline,
        ciGate: {
          budgets: ciBudgets,
          command: ciGateCommand,
        },
      };

      if (json) {
        console.log(JSON.stringify(recommendOutput, null, 2));
      } else {
        console.log(`Recommendation (${datasetPath})`);
        console.log(
          `Risk thresholds: warn ${bestPolicy.warnThreshold}, block ${bestPolicy.blockThreshold}`
        );
        console.log(
          `Expected policy cost: ${bestPolicy.totalCost} (avg ${bestPolicy.averageCost} per weighted row)`
        );
        console.log(
          `Drift snapshot: ${driftOutput.actionFlips} action flip(s), max |Δ| ${driftOutput.maxAbsScoreDelta}`
        );
        console.log(
          `Baseline drift (builtin corpus): ${driftBaseline.actionFlips} action flip(s), max |Δ| ${driftBaseline.maxAbsScoreDelta}`
        );
        console.log("Suggested namespace-guard risk config:");
        console.log(
          JSON.stringify(
            {
              risk: recommendedRiskConfig,
            },
            null,
            2
          )
        );
        console.log("Suggested CI drift gate command:");
        console.log(ciGateCommand);
      }

      return 0;
    }

    const driftRows: DriftDatasetRow[] = [];
    const datasetLabel = slug
      ? resolve(slug)
      : "builtin:composability-vectors";
    // Drift/composability analysis compares visual mappings on raw input.
    const driftGuard = createNamespaceGuard(
      { ...guardConfig, normalizeUnicode: false },
      adapter
    );

    if (slug) {
      const datasetPath = resolve(slug);
      if (!existsSync(datasetPath)) {
        console.error(`Dataset file not found: ${datasetPath}`);
        return 1;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(datasetPath, "utf-8"));
      } catch {
        console.error(`Failed to parse dataset file: ${datasetPath}`);
        return 1;
      }

      if (!Array.isArray(parsed)) {
        console.error("Drift dataset must be a JSON array.");
        return 1;
      }
      if (parsed.length === 0) {
        console.error("Drift dataset is empty.");
        return 1;
      }
      driftRows.push(...(parsed as DriftDatasetRow[]));
    } else {
      for (const row of COMPOSABILITY_VECTORS) {
        driftRows.push({
          identifier: row.char,
          target: row.tr39,
          protect: [row.tr39],
        });
      }
    }

    let output: DriftAnalysisOutput;
    try {
      output = analyzeDrift(driftGuard, driftRows, {
        datasetLabel,
        protect,
        includeReserved,
        warnThreshold,
        blockThreshold,
        maxMatches,
        limit: limit ?? 10,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to compute drift analysis.";
      console.error(message);
      return 1;
    }

    if (json) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      printDriftOutput(output);
    }

    return 0;
  } finally {
    await cleanup?.();
  }
}

// Only auto-run when executed directly via CLI, not when imported for testing.
// Vitest sets process.env.VITEST when running tests.
if (!process.env.VITEST) {
  run().then((code) => process.exit(code));
}
