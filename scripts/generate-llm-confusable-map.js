#!/usr/bin/env node

/**
 * Generate a static confusable lookup table for LLM preprocessing APIs.
 *
 * Sources:
 * - CONFUSABLE_MAP_FULL from namespace-guard (TR39 single-char Latin/digit mappings)
 * - confusable-vision confusable-weights.json (SSIM metadata + novel pairs)
 *
 * Output:
 * - src/llm-confusable-map.ts
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DIST_INDEX_PATH = path.resolve(ROOT, "dist/index.js");
const DEFAULT_WEIGHTS_JSON = path.resolve(
  __dirname,
  "../../confusable-vision/data/output/confusable-weights.json"
);
const DEFAULT_SIZE_RATIO_JSON = path.resolve(
  __dirname,
  "../../confusable-vision/data/output/size-ratio-diagnostics.json"
);
const OUTPUT_PATH = path.resolve(ROOT, "src/llm-confusable-map.ts");

const weightsPath = process.argv[2] || DEFAULT_WEIGHTS_JSON;

if (!fs.existsSync(DIST_INDEX_PATH)) {
  console.error(`Missing ${DIST_INDEX_PATH}`);
  console.error("Run `npm run build` first so dist/index.js exists.");
  process.exit(1);
}

if (!fs.existsSync(weightsPath)) {
  console.error(`Input file not found: ${weightsPath}`);
  console.error("Run confusable-vision weight generation first.");
  process.exit(1);
}

const { CONFUSABLE_MAP_FULL } = require(DIST_INDEX_PATH);
const weightsData = JSON.parse(fs.readFileSync(weightsPath, "utf8"));

// Load size-ratio diagnostics (optional -- pairs without data get null ratios)
const sizeRatioByPair = new Map();
if (fs.existsSync(DEFAULT_SIZE_RATIO_JSON)) {
  const sizeData = JSON.parse(fs.readFileSync(DEFAULT_SIZE_RATIO_JSON, "utf8"));
  const allPairs = [...(sizeData.flagged || []), ...(sizeData.clean || [])];
  for (const p of allPairs) {
    const key = `${p.source}::${p.target}`;
    // Keep the entry with the highest width ratio (worst case across fonts)
    const existing = sizeRatioByPair.get(key);
    if (!existing || p.widthRatio > existing.widthRatio) {
      sizeRatioByPair.set(key, { widthRatio: p.widthRatio, heightRatio: p.heightRatio });
    }
  }
  console.log(`  Loaded ${sizeRatioByPair.size} size-ratio entries from diagnostics`);
} else {
  console.log(`  Size-ratio diagnostics not found (${DEFAULT_SIZE_RATIO_JSON}), ratios will be null`);
}

if (!CONFUSABLE_MAP_FULL || typeof CONFUSABLE_MAP_FULL !== "object") {
  console.error("CONFUSABLE_MAP_FULL export missing from dist/index.js");
  process.exit(1);
}

if (!weightsData || !Array.isArray(weightsData.edges)) {
  console.error("Invalid confusable-weights JSON: expected { edges: [] }");
  process.exit(1);
}

const SCRIPT_DETECTORS = [
  ["Latin", /\p{Script=Latin}/u],
  ["Cyrillic", /\p{Script=Cyrillic}/u],
  ["Greek", /\p{Script=Greek}/u],
  ["Armenian", /\p{Script=Armenian}/u],
  ["Hebrew", /\p{Script=Hebrew}/u],
  ["Arabic", /\p{Script=Arabic}/u],
  ["Devanagari", /\p{Script=Devanagari}/u],
  ["Han", /\p{Script=Han}/u],
  ["Hiragana", /\p{Script=Hiragana}/u],
  ["Katakana", /\p{Script=Katakana}/u],
  ["Hangul", /\p{Script=Hangul}/u],
  ["Thai", /\p{Script=Thai}/u],
  ["Georgian", /\p{Script=Georgian}/u],
  ["Ethiopic", /\p{Script=Ethiopic}/u],
  ["Cherokee", /\p{Script=Cherokee}/u],
];

const LETTER_RE = /\p{L}/u;

function detectScriptName(ch) {
  for (const [name, re] of SCRIPT_DETECTORS) {
    if (re.test(ch)) return name;
  }
  if (LETTER_RE.test(ch)) return "Other";
  return "Common";
}

function codePointLabel(ch) {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return "U+0000";
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function escapeChar(ch) {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return "\\u0000";
  if (cp >= 0x20 && cp <= 0x7e && ch !== '"' && ch !== "\\") {
    return ch;
  }
  if (cp <= 0xffff) {
    return `\\u${cp.toString(16).padStart(4, "0")}`;
  }
  const high = Math.floor((cp - 0x10000) / 0x400) + 0xd800;
  const low = ((cp - 0x10000) % 0x400) + 0xdc00;
  return `\\u${high.toString(16).padStart(4, "0")}\\u${low
    .toString(16)
    .padStart(4, "0")}`;
}

function entryKey(sourceChar, latin, source) {
  return `${sourceChar}::${latin}::${source}`;
}

// Fast lookup for scored edges from confusable-vision.
const scoredEdgeByPair = new Map();
for (const edge of weightsData.edges) {
  if (!edge || typeof edge.source !== "string" || typeof edge.target !== "string") continue;
  const key = `${edge.source}::${edge.target.toLowerCase()}`;
  scoredEdgeByPair.set(key, edge);
}

const mapByChar = new Map();
const seen = new Set();
let tr39Count = 0;
let novelCount = 0;

function pushEntry(sourceChar, latin, score, source, cpOverride) {
  const key = entryKey(sourceChar, latin, source);
  if (seen.has(key)) return;
  seen.add(key);

  // Look up size ratio from diagnostics
  const sizeKey = `${sourceChar}::${latin}`;
  const sizeInfo = sizeRatioByPair.get(sizeKey);

  const row = {
    latin,
    ssimScore: round4(clamp01(score)),
    source,
    script: detectScriptName(sourceChar),
    codepoint: cpOverride || codePointLabel(sourceChar),
    widthRatio: sizeInfo ? sizeInfo.widthRatio : null,
    heightRatio: sizeInfo ? sizeInfo.heightRatio : null,
  };

  const list = mapByChar.get(sourceChar) || [];
  list.push(row);
  mapByChar.set(sourceChar, list);

  if (source === "tr39") tr39Count += 1;
  else novelCount += 1;
}

// 1) Include full TR39-compatible map baseline.
for (const [sourceChar, mappedLatin] of Object.entries(CONFUSABLE_MAP_FULL)) {
  const latin = String(mappedLatin).toLowerCase();
  const scored = scoredEdgeByPair.get(`${sourceChar}::${latin}`);
  const score = scored?.sameMean ?? scored?.stableDanger ?? scored?.danger ?? 1;
  pushEntry(sourceChar, latin, score, "tr39", scored?.sourceCodepoint);
}

// 2) Include novel confusable-vision discoveries (not present in TR39 map baseline).
for (const edge of weightsData.edges) {
  if (!edge || typeof edge.source !== "string" || typeof edge.target !== "string") continue;

  const latin = edge.target.toLowerCase();
  if (!/^[a-z0-9]$/.test(latin)) continue;

  const inTr39 = Boolean(edge.inTr39);
  if (inTr39) continue;

  const score = edge.sameMean ?? edge.stableDanger ?? edge.danger ?? 0;
  pushEntry(edge.source, latin, score, "novel", edge.sourceCodepoint);
}

// Deterministic ordering for generated output.
const sourceChars = Array.from(mapByChar.keys()).sort((a, b) => {
  const acp = a.codePointAt(0) || 0;
  const bcp = b.codePointAt(0) || 0;
  return acp - bcp;
});

for (const ch of sourceChars) {
  const rows = mapByChar.get(ch);
  rows.sort((a, b) => {
    if (b.ssimScore !== a.ssimScore) return b.ssimScore - a.ssimScore;
    if (a.source !== b.source) return a.source === "tr39" ? -1 : 1;
    if (a.latin !== b.latin) return a.latin.localeCompare(b.latin);
    return a.script.localeCompare(b.script);
  });
}

const totalPairs = tr39Count + novelCount;

let out = `// Auto-generated by scripts/generate-llm-confusable-map.js\n`;
out += `// Sources: CONFUSABLE_MAP_FULL (TR39 baseline) + confusable-vision confusable-weights.json\n`;
out += `// Generated: ${new Date().toISOString()}\n`;
out += `//\n`;
out += `// DO NOT EDIT MANUALLY. Regenerate with:\n`;
out += `//   npm run build && node scripts/generate-llm-confusable-map.js\n`;
out += `//\n`;
out += `// Data licensing:\n`;
out += `// - TR39-derived mappings: Unicode License v3\n`;
out += `// - confusable-vision-derived weights: CC-BY-4.0\n`;
out += `\n`;
out += `export type LlmConfusableSource = "tr39" | "novel";\n`;
out += `\n`;
out += `export type LlmConfusableMapEntry = {\n`;
out += `  latin: string;\n`;
out += `  ssimScore: number;\n`;
out += `  source: LlmConfusableSource;\n`;
out += `  script: string;\n`;
out += `  codepoint: string;\n`;
out += `  /** Width ratio between source and target at natural rendering size. Null if not measured. */\n`;
out += `  widthRatio?: number | null;\n`;
out += `  /** Height ratio between source and target at natural rendering size. Null if not measured. */\n`;
out += `  heightRatio?: number | null;\n`;
out += `};\n`;
out += `\n`;
out += `export type LlmConfusableMap = Readonly<Record<string, readonly LlmConfusableMapEntry[]>>;\n`;
out += `\n`;
out += `export const LLM_CONFUSABLE_MAP: LlmConfusableMap = {\n`;

for (const ch of sourceChars) {
  const rows = mapByChar.get(ch);
  out += `  "${escapeChar(ch)}": [\n`;
  for (const row of rows) {
    const wr = row.widthRatio !== null ? row.widthRatio : "null";
    const hr = row.heightRatio !== null ? row.heightRatio : "null";
    out += `    { latin: "${escapeChar(row.latin)}", ssimScore: ${row.ssimScore}, source: "${row.source}", script: "${row.script}", codepoint: "${row.codepoint}", widthRatio: ${wr}, heightRatio: ${hr} },\n`;
  }
  out += `  ],\n`;
}

out += `};\n\n`;
out += `export const LLM_CONFUSABLE_MAP_PAIR_COUNT = ${totalPairs};\n`;
out += `export const LLM_CONFUSABLE_MAP_CHAR_COUNT = ${sourceChars.length};\n`;
out += `export const LLM_CONFUSABLE_MAP_SOURCE_COUNTS = Object.freeze({ tr39: ${tr39Count}, novel: ${novelCount} });\n`;

fs.writeFileSync(OUTPUT_PATH, out, "utf8");

const kb = (fs.statSync(OUTPUT_PATH).size / 1024).toFixed(1);
console.log(`Generated ${OUTPUT_PATH}`);
console.log(`  ${sourceChars.length} source chars`);
console.log(`  ${totalPairs} pairs (${tr39Count} tr39 + ${novelCount} novel)`);
console.log(`  ${kb} KB`);
