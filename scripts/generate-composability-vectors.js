const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const distIndexPath = path.join(root, "dist", "index.js");
const outPath = path.join(root, "docs", "data", "composability-vectors.json");

if (!fs.existsSync(distIndexPath)) {
  throw new Error(
    "dist/index.js not found. Run `npm run build` before generating composability vectors."
  );
}

const { COMPOSABILITY_VECTORS } = require(distIndexPath);
if (!Array.isArray(COMPOSABILITY_VECTORS)) {
  throw new Error("Expected COMPOSABILITY_VECTORS export to be an array.");
}

const serialized = JSON.stringify(COMPOSABILITY_VECTORS, null, 2) + "\n";
fs.writeFileSync(outPath, serialized, "utf8");
console.log(`Wrote ${outPath} (${COMPOSABILITY_VECTORS.length} vectors)`);
