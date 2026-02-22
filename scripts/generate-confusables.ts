/**
 * Generate CONFUSABLE_MAP and CONFUSABLE_MAP_FULL from Unicode TR39 confusables.txt
 *
 * Downloads the official Unicode confusables.txt file and extracts all
 * single-character mappings that target a lowercase Latin letter (a-z)
 * or digit (0-9).
 *
 * Outputs two maps:
 * - CONFUSABLE_MAP: NFKC-filtered (~613 entries) for pipelines that run NFKC first
 * - CONFUSABLE_MAP_FULL: unfiltered (~1,400 entries) for standalone use without NFKC
 *
 * Also adds supplemental mappings for characters that are visually identical to
 * Latin letters but absent from confusables.txt (e.g., Latin small capitals).
 *
 * Usage: npx tsx scripts/generate-confusables.ts
 *
 * Output: TypeScript source fragments for both maps (printed to stdout)
 */

const CONFUSABLES_URL =
  "https://unicode.org/Public/security/latest/confusables.txt";

// Unicode block ranges for grouping output
const BLOCKS: Array<{ name: string; start: number; end: number }> = [
  { name: "Latin Extended-A", start: 0x0100, end: 0x017f },
  { name: "Latin Extended-B", start: 0x0180, end: 0x024f },
  { name: "IPA Extensions", start: 0x0250, end: 0x02af },
  { name: "Spacing Modifier Letters", start: 0x02b0, end: 0x02ff },
  { name: "Combining Diacritical Marks", start: 0x0300, end: 0x036f },
  { name: "Greek and Coptic", start: 0x0370, end: 0x03ff },
  { name: "Cyrillic", start: 0x0400, end: 0x04ff },
  { name: "Cyrillic Supplement", start: 0x0500, end: 0x052f },
  { name: "Armenian", start: 0x0530, end: 0x058f },
  { name: "Georgian", start: 0x10a0, end: 0x10ff },
  { name: "Cherokee", start: 0x13a0, end: 0x13ff },
  { name: "Unified Canadian Aboriginal Syllabics", start: 0x1400, end: 0x167f },
  { name: "Phonetic Extensions", start: 0x1d00, end: 0x1d7f },
  { name: "Latin Extended Additional", start: 0x1e00, end: 0x1eff },
  { name: "General Punctuation", start: 0x2000, end: 0x206f },
  { name: "Letterlike Symbols", start: 0x2100, end: 0x214f },
  { name: "Number Forms", start: 0x2150, end: 0x218f },
  { name: "Mathematical Operators", start: 0x2200, end: 0x22ff },
  { name: "Miscellaneous Technical", start: 0x2300, end: 0x23ff },
  { name: "Enclosed Alphanumerics", start: 0x2460, end: 0x24ff },
  { name: "Box Drawing", start: 0x2500, end: 0x257f },
  { name: "Geometric Shapes", start: 0x25a0, end: 0x25ff },
  { name: "Miscellaneous Symbols", start: 0x2600, end: 0x26ff },
  { name: "Latin Extended-C", start: 0x2c60, end: 0x2c7f },
  { name: "Cyrillic Extended-A", start: 0x2de0, end: 0x2dff },
  { name: "CJK Symbols and Punctuation", start: 0x3000, end: 0x303f },
  { name: "CJK Compatibility", start: 0x3300, end: 0x33ff },
  { name: "Latin Extended-D", start: 0xa720, end: 0xa7ff },
  { name: "Cherokee Supplement", start: 0xab70, end: 0xabbf },
  { name: "Latin Extended-E", start: 0xab30, end: 0xab6f },
  { name: "Halfwidth and Fullwidth Forms", start: 0xff00, end: 0xffef },
  { name: "Mathematical Alphanumeric Symbols", start: 0x1d400, end: 0x1d7ff },
  { name: "Enclosed Alphanumeric Supplement", start: 0x1f100, end: 0x1f1ff },
];

function getBlockName(cp: number): string {
  for (const block of BLOCKS) {
    if (cp >= block.start && cp <= block.end) return block.name;
  }
  if (cp >= 0x0080 && cp <= 0x00ff) return "Latin-1 Supplement";
  if (cp >= 0xfb00 && cp <= 0xfb06) return "Alphabetic Presentation Forms";
  return `Other (U+${cp.toString(16).toUpperCase().padStart(4, "0")})`;
}

function isLatinLower(ch: string): boolean {
  return ch >= "a" && ch <= "z";
}

function isLatinUpper(ch: string): boolean {
  return ch >= "A" && ch <= "Z";
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isBasicLatin(cp: number): boolean {
  return cp >= 0x0000 && cp <= 0x007f;
}

async function main() {
  // Fetch confusables.txt
  console.error("Fetching confusables.txt from Unicode...");
  const response = await fetch(CONFUSABLES_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  console.error(`Downloaded ${(text.length / 1024).toFixed(1)} KB`);

  // Parse mappings - collect both NFKC-filtered and unfiltered sets
  type Entry = { source: number; target: string; comment: string };
  const entries: Entry[] = [];       // NFKC-filtered (for CONFUSABLE_MAP)
  const entriesFull: Entry[] = [];   // Unfiltered (for CONFUSABLE_MAP_FULL)
  const seen = new Set<number>();
  const seenFull = new Set<number>();
  let nfkcConflicts = 0;
  let nfkcHandled = 0;

  for (const line of text.split("\n")) {
    // Skip comments and empty lines
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Format: SOURCE_HEX ; TARGET_HEX(S) ; TYPE # comment
    const commentIdx = trimmed.indexOf("#");
    const comment = commentIdx >= 0 ? trimmed.slice(commentIdx + 1).trim() : "";
    const dataPart = commentIdx >= 0 ? trimmed.slice(0, commentIdx) : trimmed;
    const parts = dataPart.split(";").map((s) => s.trim());
    if (parts.length < 2) continue;

    const sourceHex = parts[0];
    const targetHexes = parts[1].split(/\s+/);

    // Parse source codepoint
    const sourceCp = parseInt(sourceHex, 16);
    if (isNaN(sourceCp)) continue;

    // Skip basic Latin sources (a-z, A-Z, 0-9 mapping to themselves)
    if (isBasicLatin(sourceCp)) continue;

    // Parse target codepoints
    const targetCps = targetHexes
      .map((h) => parseInt(h, 16))
      .filter((n) => !isNaN(n));

    // We only want single-character targets
    if (targetCps.length !== 1) continue;

    const targetCp = targetCps[0];
    const targetChar = String.fromCodePoint(targetCp);

    // Determine the lowercase Latin target
    let normalizedTarget: string | null = null;
    if (isLatinLower(targetChar)) {
      normalizedTarget = targetChar;
    } else if (isLatinUpper(targetChar)) {
      normalizedTarget = targetChar.toLowerCase();
    } else if (isDigit(targetChar)) {
      normalizedTarget = targetChar;
    }

    if (!normalizedTarget) continue;

    // Always add to full map (dedup only)
    if (!seenFull.has(sourceCp)) {
      seenFull.add(sourceCp);
      entriesFull.push({ source: sourceCp, target: normalizedTarget, comment });
    }

    // NFKC analysis: determine what NFKC + lowercase produces
    const sourceChar = String.fromCodePoint(sourceCp);
    const nfkcResult = sourceChar.normalize("NFKC").toLowerCase();

    // Skip from NFKC-filtered map if NFKC already collapses to the same target
    if (nfkcResult === normalizedTarget) continue;

    // Skip from NFKC-filtered map if NFKC maps to a DIFFERENT valid Latin
    // letter/digit - the NFKC mapping takes precedence (e.g., U+017F Long S:
    // TR39 says "f" but NFKC says "s")
    if (/^[a-z0-9]$/.test(nfkcResult) && nfkcResult !== normalizedTarget) {
      nfkcConflicts++;
      continue;
    }

    // Skip from NFKC-filtered map if NFKC maps to something that the default
    // slug regex ([a-z0-9-]) would accept - entry is unreachable dead code
    // since normalize() runs before the confusable check
    if (nfkcResult.length > 0 && /^[a-z0-9-]+$/.test(nfkcResult)) {
      nfkcHandled++;
      continue;
    }

    // Deduplicate (first mapping wins)
    if (seen.has(sourceCp)) continue;
    seen.add(sourceCp);

    entries.push({
      source: sourceCp,
      target: normalizedTarget,
      comment,
    });
  }

  console.error(`\nNFKC-filtered: ${entries.length} entries`);
  console.error(`  Skipped ${nfkcConflicts} NFKC-conflict entries (NFKC maps to different Latin char)`);
  console.error(`  Skipped ${nfkcHandled} NFKC-handled entries (NFKC produces valid slug fragment)`);
  console.error(`Unfiltered: ${entriesFull.length} entries`);

  // ──────────────────────────────────────────────────────────────────────
  // Supplemental mappings: characters visually identical to Latin letters
  // that are absent from confusables.txt AND not collapsed by NFKC.
  //
  // Rationale: TR39's confusables.txt is designed for the skeleton algorithm
  // which compares two arbitrary strings. Our use case is a static character
  // map for slug validation - if a character looks like a Latin letter and
  // neither TR39 nor NFKC handles it, we must add it ourselves.
  // ──────────────────────────────────────────────────────────────────────
  const supplemental: Entry[] = [
    // Latin small capitals (Phonetic Extensions block)
    // These are designed to look exactly like their uppercase Latin counterparts
    // at a smaller size - visually identical at typical font sizes.
    { source: 0x1d00, target: "a", comment: "LATIN LETTER SMALL CAPITAL A" },
    { source: 0x1d05, target: "d", comment: "LATIN LETTER SMALL CAPITAL D" },
    { source: 0x1d07, target: "e", comment: "LATIN LETTER SMALL CAPITAL E" },
    { source: 0x1d0a, target: "j", comment: "LATIN LETTER SMALL CAPITAL J" },
    { source: 0x1d0b, target: "k", comment: "LATIN LETTER SMALL CAPITAL K" },
    { source: 0x1d0d, target: "m", comment: "LATIN LETTER SMALL CAPITAL M" },
    { source: 0x1d18, target: "p", comment: "LATIN LETTER SMALL CAPITAL P" },
    { source: 0x1d1b, target: "t", comment: "LATIN LETTER SMALL CAPITAL T" },
  ];

  let supplementalCount = 0;
  let supplementalFullCount = 0;
  for (const entry of supplemental) {
    // Add to full map
    if (!seenFull.has(entry.source)) {
      seenFull.add(entry.source);
      entriesFull.push(entry);
      supplementalFullCount++;
    }

    // Add to NFKC-filtered map (only if NFKC doesn't already handle it)
    if (seen.has(entry.source)) continue;
    const sourceChar = String.fromCodePoint(entry.source);
    const nfkcResult = sourceChar.normalize("NFKC").toLowerCase();
    if (nfkcResult === entry.target) continue;

    seen.add(entry.source);
    entries.push(entry);
    supplementalCount++;
  }

  console.error(`Added ${supplementalCount} supplemental entries to NFKC-filtered map`);
  console.error(`Added ${supplementalFullCount} supplemental entries to full map`);
  console.error(`\nCONFUSABLE_MAP: ${entries.length} entries`);
  console.error(`CONFUSABLE_MAP_FULL: ${entriesFull.length} entries`);

  // Helper: group entries by Unicode block and generate TypeScript output
  function generateMap(mapEntries: Entry[], name: string) {
    const groups = new Map<string, Entry[]>();
    for (const entry of mapEntries) {
      const block = getBlockName(entry.source);
      if (!groups.has(block)) groups.set(block, []);
      groups.get(block)!.push(entry);
    }

    const sortedGroups = [...groups.entries()].sort((a, b) => {
      return a[1][0].source - b[1][0].source;
    });

    // Print stats
    console.error(`\n${name} entries per block:`);
    for (const [block, blockEntries] of sortedGroups) {
      console.error(
        `  ${block}: ${blockEntries.length} entries (U+${blockEntries[0].source.toString(16).toUpperCase().padStart(4, "0")}–U+${blockEntries[blockEntries.length - 1].source.toString(16).toUpperCase().padStart(4, "0")})`
      );
    }

    // Generate TypeScript
    console.log("/* prettier-ignore */");
    console.log(`export const ${name}: Record<string, string> = {`);

    for (const [block, blockEntries] of sortedGroups) {
      blockEntries.sort((a, b) => a.source - b.source);
      console.log(`  // ${block} (${blockEntries.length})`);

      const formatted: string[] = [];
      for (const entry of blockEntries) {
        const hex = entry.source.toString(16).padStart(4, "0");
        const escape =
          entry.source <= 0xffff
            ? `\\u${hex}`
            : `\\u{${entry.source.toString(16)}}`;
        formatted.push(`"${escape}": "${entry.target}"`);
      }

      for (let i = 0; i < formatted.length; i += 4) {
        const chunk = formatted.slice(i, i + 4);
        console.log(`  ${chunk.join(", ")},`);
      }
    }

    console.log("};");
  }

  // Generate both maps
  generateMap(entries, "CONFUSABLE_MAP");
  console.log("");
  generateMap(entriesFull, "CONFUSABLE_MAP_FULL");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
