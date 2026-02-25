#!/usr/bin/env node

/**
 * generate-confusable-weights-global.js
 *
 * Reads confusable-weights.json (from confusable-vision) and outputs a compact
 * browser-global JS file for the playground at docs/data/confusable-weights.global.js.
 *
 * Field compression:
 *   d = danger, s = stableDanger, c = cost, g = glyphReuse,
 *   x = xidContinue, i = idnaPvalid, t = tr39Allowed
 *
 * Truthy-only booleans (omitted when false) keep the file small.
 *
 * Usage:
 *   node scripts/generate-confusable-weights-global.js [path-to-json]
 */

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_JSON_PATH = path.resolve(
  __dirname,
  "../../confusable-vision/data/output/confusable-weights.json"
);

const OUTPUT_PATH = path.resolve(__dirname, "../docs/data/confusable-weights.global.js");

const jsonPath = process.argv[2] || DEFAULT_JSON_PATH;

if (!fs.existsSync(jsonPath)) {
  console.error(`Input file not found: ${jsonPath}`);
  console.error("Run confusable-vision generate-weights.ts first.");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

// Build nested map: source char -> target char -> compact weight
const map = {};
let pairCount = 0;

for (const edge of data.edges) {
  const src = edge.source;
  const tgt = edge.target;

  const compact = {
    d: edge.danger,
    s: edge.stableDanger,
    c: edge.cost,
  };

  // Only include truthy booleans
  if (edge.glyphReuse) compact.g = 1;
  if (edge.xidContinue) compact.x = 1;
  if (edge.idnaPvalid) compact.i = 1;
  if (edge.tr39Allowed) compact.t = 1;

  if (!map[src]) map[src] = {};
  map[src][tgt] = compact;
  pairCount++;
}

const output = [
  "// Auto-generated from confusable-vision confusable-weights.json",
  `// ${pairCount} SSIM-scored pairs. Do not edit manually.`,
  `// Regenerate: node scripts/generate-confusable-weights-global.js`,
  `window.__NG_CONFUSABLE_WEIGHTS__ = ${JSON.stringify(map)};`,
  "",
].join("\n");

fs.writeFileSync(OUTPUT_PATH, output, "utf8");

const sizeKB = (Buffer.byteLength(output, "utf8") / 1024).toFixed(1);
console.log(`Wrote ${OUTPUT_PATH} (${pairCount} pairs, ${sizeKB} KB)`);
