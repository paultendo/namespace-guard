const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const inputPath = path.join(root, "docs", "data", "profanity-words.json");
const outputPath = path.join(root, "docs", "data", "profanity-words.global.js");

const raw = fs.readFileSync(inputPath, "utf8");
const words = JSON.parse(raw);
if (!Array.isArray(words)) {
  throw new Error("Expected docs/data/profanity-words.json to contain an array of strings.");
}

// Names, places and words that contain a listed word, written by scripts/measure-profanity.mjs --write.
const allowlistPath = path.join(root, "docs", "data", "profanity-allowlist.json");
const allowlist = fs.existsSync(allowlistPath) ? JSON.parse(fs.readFileSync(allowlistPath, "utf8")) : [];
if (!Array.isArray(allowlist)) {
  throw new Error("Expected docs/data/profanity-allowlist.json to contain an array of strings.");
}

const output = [
  "// Auto-generated from docs/data/profanity-words.json and docs/data/profanity-allowlist.json",
  "// Do not edit manually.",
  `window.__NG_PROFANITY_WORDS__ = ${JSON.stringify(words)};`,
  `window.__NG_PROFANITY_ALLOWLIST__ = ${JSON.stringify(allowlist)};`,
  "",
].join("\n");

fs.writeFileSync(outputPath, output, "utf8");
console.log(`Wrote ${outputPath} (${words.length} terms, ${allowlist.length} allowed words)`);
