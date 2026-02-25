const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const distIndexPath = path.join(root, "dist", "index.js");
const outPath = path.join(root, "docs", "data", "confusable-bench.v1.json");

if (!fs.existsSync(distIndexPath)) {
  throw new Error(
    "dist/index.js not found. Run `npm run build` before generating confusable bench data."
  );
}

const { COMPOSABILITY_VECTORS, CONFUSABLE_MAP_FULL } = require(distIndexPath);

if (!Array.isArray(COMPOSABILITY_VECTORS)) {
  throw new Error("Expected COMPOSABILITY_VECTORS export to be an array.");
}

if (!CONFUSABLE_MAP_FULL || typeof CONFUSABLE_MAP_FULL !== "object") {
  throw new Error("Expected CONFUSABLE_MAP_FULL export to be an object.");
}

const PROTECTED_TARGETS = [
  "paypal",
  "github",
  "openai",
  "vercel",
  "admin",
  "support",
  "stripe",
];

const ASCII_LOOKALIKE_VARIANTS = {
  paypal: ["paypa1", "paypaI", "paypa-l"],
  github: ["g1thub", "githu8"],
  openai: ["0penai", "opena1"],
  vercel: ["verce1"],
  admin: ["adm1n"],
  support: ["5upport", "supp0rt"],
  stripe: ["str1pe"],
};

const DEFAULT_IGNORABLES = ["\u200B", "\u200C", "\u200D", "\u2060"];
const BIDI_CONTROLS = ["\u202E", "\u2066", "\u2067", "\u2069"];
const COMBINING_MARKS = ["\u0301", "\u0307", "\u0338", "\u20E3"];

const BENIGN_ROWS = [
  { identifier: "sarah", category: "benign-ascii", notes: "Common ASCII username." },
  { identifier: "acme-corp", category: "benign-ascii", notes: "Organization slug style." },
  { identifier: "teamspace", category: "benign-ascii", notes: "Benign product/workspace word." },
  { identifier: "developer-hub", category: "benign-ascii", notes: "Hyphenated benign slug." },
  { identifier: "build-2026", category: "benign-ascii", notes: "Benign alpha-numeric slug." },
  { identifier: "cafe", category: "benign-ascii", notes: "Benign control for accent pairing." },
  { identifier: "café", category: "benign-unicode-precomposed", notes: "Precomposed accent character." },
  { identifier: "naïve", category: "benign-unicode-precomposed", notes: "Precomposed diaeresis." },
  { identifier: "jalapeño", category: "benign-unicode-precomposed", notes: "Precomposed tilde." },
  { identifier: "résumé", category: "benign-unicode-precomposed", notes: "Precomposed acute accents." },
  { identifier: "cafe\u0301", category: "benign-combining-legit", notes: "Legitimate decomposed acute accent." },
  { identifier: "nai\u0308ve", category: "benign-combining-legit", notes: "Legitimate decomposed diaeresis." },
  { identifier: "megadeth", category: "benign-ascii", notes: "Should not be blocked by overbroad filters." },
  { identifier: "algae-labs", category: "benign-ascii", notes: "Avoids false positives on short substrings." },
  { identifier: "hardcore-band", category: "benign-ascii", notes: "Benign term with possible moderation overlap." },
  { identifier: "unicode-safe", category: "benign-ascii", notes: "Control sample for security branding terms." },
  { identifier: "rocketship", category: "benign-ascii", notes: "Benign noun." },
  { identifier: "customer-success", category: "benign-ascii", notes: "Benign enterprise slug." },
  { identifier: "open-source", category: "benign-ascii", notes: "Benign hyphenated phrase." },
  { identifier: "workflow", category: "benign-ascii", notes: "Benign common product term." },
];

function codePointLabel(ch) {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return "U+0000";
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

function isAsciiChar(ch) {
  const cp = ch.codePointAt(0) ?? 0;
  return cp <= 0x7f;
}

function insertAt(str, index, fragment) {
  return str.slice(0, index) + fragment + str.slice(index);
}

function replaceAt(chars, index, next) {
  const out = [...chars];
  out[index] = next;
  return out.join("");
}

function buildBuckets(map) {
  const buckets = new Map();
  for (const [ch, prototype] of Object.entries(map)) {
    if (!/^[a-z0-9]$/.test(prototype)) continue;
    if (ch === prototype) continue;
    const list = buckets.get(prototype) ?? [];
    list.push(ch);
    buckets.set(prototype, list);
  }

  for (const [prototype, list] of buckets.entries()) {
    const unique = Array.from(new Set(list));
    unique.sort((a, b) => {
      const aAscii = isAsciiChar(a) ? 1 : 0;
      const bAscii = isAsciiChar(b) ? 1 : 0;
      if (aAscii !== bAscii) return aAscii - bAscii; // non-ASCII first
      const acp = a.codePointAt(0) ?? 0;
      const bcp = b.codePointAt(0) ?? 0;
      if (acp !== bcp) return acp - bcp;
      return a.localeCompare(b);
    });
    buckets.set(prototype, unique);
  }

  return buckets;
}

const buckets = buildBuckets(CONFUSABLE_MAP_FULL);

function pickConfusable(prototype, options = {}) {
  const { nonAsciiOnly = false, exclude = new Set() } = options;
  const list = buckets.get(prototype) ?? [];
  for (const ch of list) {
    if (exclude.has(ch)) continue;
    if (nonAsciiOnly && isAsciiChar(ch)) continue;
    return ch;
  }
  return null;
}

const rows = [];
const seen = new Set();

function addRow({
  identifier,
  label,
  target,
  category,
  threatClass,
  notes,
}) {
  if (typeof identifier !== "string" || identifier.trim() === "") return;
  if (typeof target !== "string" || target.trim() === "") return;
  if (label !== "malicious" && label !== "benign") return;
  if (typeof category !== "string" || category.trim() === "") return;

  const key = `${identifier}::${label}::${target}::${category}`;
  if (seen.has(key)) return;
  seen.add(key);

  const row = {
    id: `bench-${String(rows.length + 1).padStart(4, "0")}`,
    identifier,
    label,
    target,
    protect: [target],
    category,
  };

  if (threatClass) row.threatClass = threatClass;
  if (notes) row.notes = notes;

  rows.push(row);
}

// 1) NFKC/TR39 divergence vectors (core composability corpus)
for (const vector of COMPOSABILITY_VECTORS) {
  addRow({
    identifier: vector.char,
    label: "malicious",
    target: vector.tr39,
    category: "nfkc-tr39-divergence",
    threatClass: "composability",
    notes: `${vector.codePoint}: TR39=${vector.tr39}, NFKC=${vector.nfkc}`,
  });
}

// 2) Confusable, mixed-script, invisible, bidi, combining-mark variants
for (const target of PROTECTED_TARGETS) {
  const chars = Array.from(target);
  const replacements = [];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (!/^[a-z0-9]$/.test(ch)) continue;

    const replacement = pickConfusable(ch, { nonAsciiOnly: true }) ?? pickConfusable(ch);
    if (!replacement) continue;

    replacements.push({ index: i, from: ch, to: replacement });
    if (replacements.length >= 4) break;
  }

  for (const rep of replacements) {
    const candidate = replaceAt(chars, rep.index, rep.to);
    addRow({
      identifier: candidate,
      label: "malicious",
      target,
      category: isAsciiChar(rep.to) ? "confusable-single" : "mixed-script-confusable",
      threatClass: "impersonation",
      notes: `${rep.from} -> ${rep.to} (${codePointLabel(rep.to)}) at index ${rep.index}`,
    });
  }

  if (replacements.length >= 2) {
    const next = [...chars];
    const first = replacements[0];
    const second = replacements[1];
    next[first.index] = first.to;
    next[second.index] = second.to;
    addRow({
      identifier: next.join(""),
      label: "malicious",
      target,
      category: "confusable-chain",
      threatClass: "impersonation",
      notes: `Two-step confusable substitution chain on ${target}.`,
    });
  }

  const mid = Math.max(1, Math.floor(chars.length / 2));
  for (let i = 0; i < Math.min(2, DEFAULT_IGNORABLES.length); i++) {
    const ignorable = DEFAULT_IGNORABLES[i];
    addRow({
      identifier: insertAt(target, mid, ignorable),
      label: "malicious",
      target,
      category: "invisible-default-ignorable",
      threatClass: "evasion",
      notes: `Inserted ${codePointLabel(ignorable)} into target.`,
    });
  }

  for (let i = 0; i < Math.min(2, BIDI_CONTROLS.length); i++) {
    const bidi = BIDI_CONTROLS[i];
    addRow({
      identifier: insertAt(target, mid, bidi),
      label: "malicious",
      target,
      category: "invisible-bidi-control",
      threatClass: "evasion",
      notes: `Inserted ${codePointLabel(bidi)} into target.`,
    });
  }

  const letterIndex = chars.findIndex((ch) => /[aeiou]/.test(ch));
  const markAt = letterIndex >= 0 ? letterIndex + 1 : 1;
  for (let i = 0; i < Math.min(2, COMBINING_MARKS.length); i++) {
    const mark = COMBINING_MARKS[i];
    addRow({
      identifier: insertAt(target, markAt, mark),
      label: "malicious",
      target,
      category: "combining-mark-evasion",
      threatClass: "evasion",
      notes: `Inserted combining mark ${codePointLabel(mark)} after base letter.`,
    });
  }
}

// 3) ASCII lookalike profanity/impersonation style substitutions
for (const [target, variants] of Object.entries(ASCII_LOOKALIKE_VARIANTS)) {
  for (const variant of variants) {
    addRow({
      identifier: variant,
      label: "malicious",
      target,
      category: "ascii-lookalike",
      threatClass: "evasion",
      notes: "ASCII lookalike/leet-style substitution.",
    });
  }
}

// 4) Benign controls (to measure overblocking and precision)
for (let i = 0; i < BENIGN_ROWS.length; i++) {
  const row = BENIGN_ROWS[i];
  const target = PROTECTED_TARGETS[i % PROTECTED_TARGETS.length];
  addRow({
    identifier: row.identifier,
    label: "benign",
    target,
    category: row.category,
    threatClass: "control",
    notes: row.notes,
  });
}

const serialized = JSON.stringify(rows, null, 2) + "\n";
fs.writeFileSync(outPath, serialized, "utf8");

const malicious = rows.filter((row) => row.label === "malicious").length;
const benign = rows.length - malicious;
console.log(`Wrote ${outPath} (${rows.length} rows: ${malicious} malicious, ${benign} benign)`);
