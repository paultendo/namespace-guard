#!/usr/bin/env node

"use strict";

const { spawnSync } = require("child_process");
const { existsSync } = require("fs");
const { resolve } = require("path");

function printUsage() {
  console.log(`Usage:
  node scripts/drift-gate.js [options]

Options:
  --dataset <path>               Optional drift dataset path (defaults to built-in corpus)
  --max-action-flips <n>         Maximum allowed actionFlips
  --max-average-score-delta <n>  Maximum allowed absolute averageScoreDelta
  --max-abs-score-delta <n>      Maximum allowed maxAbsScoreDelta
  --limit <n>                    Forwarded to drift --limit (default: 1)
  --help                         Show this help message

Example:
  node scripts/drift-gate.js --max-action-flips 29 --max-average-score-delta 95 --max-abs-score-delta 100`);
}

function parseArgs(args) {
  const parsed = {
    dataset: undefined,
    maxActionFlips: undefined,
    maxAverageScoreDelta: undefined,
    maxAbsScoreDelta: undefined,
    limit: 1,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    if (arg === "--dataset" && i + 1 < args.length) {
      parsed.dataset = args[++i];
      continue;
    }
    if (arg === "--max-action-flips" && i + 1 < args.length) {
      parsed.maxActionFlips = Number(args[++i]);
      continue;
    }
    if (arg === "--max-average-score-delta" && i + 1 < args.length) {
      parsed.maxAverageScoreDelta = Number(args[++i]);
      continue;
    }
    if (arg === "--max-abs-score-delta" && i + 1 < args.length) {
      parsed.maxAbsScoreDelta = Number(args[++i]);
      continue;
    }
    if (arg === "--limit" && i + 1 < args.length) {
      parsed.limit = Number(args[++i]);
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg}`);
  }

  return parsed;
}

function validateNumber(name, value, options = {}) {
  if (value === undefined) return;
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  if (options.integer && !Number.isInteger(value)) {
    throw new Error(`Invalid ${name}: ${value} (must be an integer)`);
  }
  if (value < 0) {
    throw new Error(`Invalid ${name}: ${value} (must be >= 0)`);
  }
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    printUsage();
    return 1;
  }

  if (args.help) {
    printUsage();
    return 0;
  }

  try {
    validateNumber("--max-action-flips", args.maxActionFlips, { integer: true });
    validateNumber("--max-average-score-delta", args.maxAverageScoreDelta);
    validateNumber("--max-abs-score-delta", args.maxAbsScoreDelta);
    validateNumber("--limit", args.limit, { integer: true });
    if (args.limit < 1) {
      throw new Error("Invalid --limit: must be >= 1");
    }
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  const hasBudget =
    args.maxActionFlips !== undefined ||
    args.maxAverageScoreDelta !== undefined ||
    args.maxAbsScoreDelta !== undefined;
  if (!hasBudget) {
    console.error(
      "No drift budgets provided. Set at least one of --max-action-flips, --max-average-score-delta, or --max-abs-score-delta."
    );
    return 1;
  }

  const cliPath = resolve(__dirname, "..", "dist", "cli.js");
  if (!existsSync(cliPath)) {
    console.error(`Built CLI not found at ${cliPath}. Run \"npm run build\" first.`);
    return 1;
  }

  const cliArgs = ["drift"];
  if (args.dataset) {
    const datasetPath = resolve(process.cwd(), args.dataset);
    if (!existsSync(datasetPath)) {
      console.error(`Dataset file not found: ${datasetPath}`);
      return 1;
    }
    cliArgs.push(args.dataset);
  }
  cliArgs.push("--limit", String(args.limit));
  cliArgs.push("--json");

  const run = spawnSync(process.execPath, [cliPath, ...cliArgs], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (run.status !== 0) {
    if (run.stdout?.trim()) process.stdout.write(run.stdout);
    if (run.stderr?.trim()) process.stderr.write(run.stderr);
    console.error("Drift command failed.");
    return 1;
  }

  let report;
  try {
    report = JSON.parse((run.stdout || "").trim());
  } catch {
    console.error("Failed to parse drift JSON output.");
    if (run.stdout?.trim()) process.stdout.write(run.stdout);
    return 1;
  }

  if (
    typeof report !== "object" ||
    report === null ||
    typeof report.actionFlips !== "number" ||
    typeof report.averageScoreDelta !== "number" ||
    typeof report.maxAbsScoreDelta !== "number"
  ) {
    console.error("Drift report is missing expected numeric fields.");
    return 1;
  }

  const absAverageScoreDelta = Math.abs(report.averageScoreDelta);
  const failures = [];

  if (
    args.maxActionFlips !== undefined &&
    report.actionFlips > args.maxActionFlips
  ) {
    failures.push(
      `actionFlips ${report.actionFlips} > max-action-flips ${args.maxActionFlips}`
    );
  }

  if (
    args.maxAverageScoreDelta !== undefined &&
    absAverageScoreDelta > args.maxAverageScoreDelta
  ) {
    failures.push(
      `|averageScoreDelta| ${absAverageScoreDelta} > max-average-score-delta ${args.maxAverageScoreDelta}`
    );
  }

  if (
    args.maxAbsScoreDelta !== undefined &&
    report.maxAbsScoreDelta > args.maxAbsScoreDelta
  ) {
    failures.push(
      `maxAbsScoreDelta ${report.maxAbsScoreDelta} > max-abs-score-delta ${args.maxAbsScoreDelta}`
    );
  }

  if (failures.length > 0) {
    console.error(`Drift gate failed (${report.dataset}).`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    return 1;
  }

  console.log(`Drift gate passed (${report.dataset}).`);
  console.log(
    `actionFlips=${report.actionFlips}, |averageScoreDelta|=${absAverageScoreDelta}, maxAbsScoreDelta=${report.maxAbsScoreDelta}`
  );
  return 0;
}

process.exit(main());
