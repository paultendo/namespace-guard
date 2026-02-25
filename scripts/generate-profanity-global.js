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

const output = [
  "// Auto-generated from docs/data/profanity-words.json",
  "// Do not edit manually.",
  `window.__NG_PROFANITY_WORDS__ = ${JSON.stringify(words)};`,
  "",
].join("\n");

fs.writeFileSync(outputPath, output, "utf8");
console.log(`Wrote ${outputPath} (${words.length} terms)`);
