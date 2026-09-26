/**
 * Generate src/confusable-maps.ts: the character maps skeleton(), areConfusable(), confusableDistance() and the
 * homoglyph validator use, from Unicode's latest confusables.txt and confusable-vision's measurements.
 *
 * From Unicode (UTS #39 confusables.txt):
 * - every mapping whose target is Latin letters or digits, including multi-character targets (m -> rn, ǁ -> ll)
 *   and ASCII sources (1 -> l, 0 -> O, | -> l, m -> rn);
 * - targets reduced to namespace-guard's lowercase prototypes: lowercased, then m as rn, 1 and | as l, 0 as o, so a
 *   mapped character and the letters it stands for give the same skeleton;
 * - mappings that reach Latin through another mapped character (ꭻ -> ᴊ -> j).
 *
 * Case is kept: a capital's mapping says nothing about its lowercase form (Greek Η looks like H, η like n), so the
 * library checks names as typed, before lowercasing, rather than mapping lowercase forms to their capitals' letters.
 *
 * From confusable-vision (measured in place: set between neighbours in common fonts at text size, and as alike there
 * as accepted confusables such as 0/O and 1/l): lookalikes of ASCII letters and digits that Unicode does not map, and
 * where each measured pair holds (MEASURED_CONFUSABLES).
 *
 * Usage:
 *   npx tsx scripts/generate-confusables.ts --release <confusable-vision release dir> [--confusables <file>]
 * The release's in-place.jsonl.gz holds the measurements (release 2026.09.26 on). Without --confusables, fetches
 * https://unicode.org/Public/security/latest/confusables.txt.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";

const CONFUSABLES_URL = "https://unicode.org/Public/security/latest/confusables.txt";
const OUT = path.join(import.meta.dirname, "../src/confusable-maps.ts");

const args = process.argv.slice(2);
const argValues = (name: string) => args.flatMap((a, i) => (a === name ? [args[i + 1]!] : []));
const releaseDir = argValues("--release")[0];
if (!releaseDir) {
  console.error("usage: npx tsx scripts/generate-confusables.ts --release <confusable-vision release dir> [--confusables <file>]");
  process.exit(2);
}
const localConfusables = argValues("--confusables")[0];

type Entry = { source: string; target: string; from: "unicode" | "supplemental" | "measured" };
type Measured = { letter: string; target: string; tier: "strict" | "broad" | "design"; contexts: string[] };

const isAsciiAlnum = (s: string) => /^[A-Za-z0-9]+$/.test(s);
const isAscii = (ch: string) => ch.codePointAt(0)! < 0x80;

// Latin small capitals absent from confusables.txt and not collapsed by NFKC (kept from earlier releases)
const SUPPLEMENTAL: [number, string][] = [
  [0x1d00, "a"], [0x1d05, "d"], [0x1d07, "e"], [0x1d0a, "j"], [0x1d0b, "k"], [0x1d0d, "m"], [0x1d18, "p"], [0x1d1b, "t"],
];

async function main() {
  const text = localConfusables
    ? fs.readFileSync(localConfusables, "utf8")
    : await (async () => {
        console.error("Fetching confusables.txt from Unicode...");
        const response = await fetch(CONFUSABLES_URL);
        if (!response.ok) throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
        return response.text();
      })();
  const unicodeDate = text.match(/^# Date: (.+)$/m)?.[1]?.trim() ?? "unknown";

  // Every mapping in the file, source -> target string (Unicode's own prototypes)
  const unicode = new Map<string, string>();
  for (const raw of text.split("\n")) {
    const line = raw.split("#")[0]!.trim();
    if (!line) continue;
    const [src, dst] = line.split(";").map((s) => s.trim());
    if (!src || !dst || src.includes(" ")) continue;
    unicode.set(String.fromCodePoint(parseInt(src, 16)), dst.split(/\s+/).map((h) => String.fromCodePoint(parseInt(h, 16))).join(""));
  }

  // namespace-guard's prototype for a Latin target: lowercased, then each ASCII letter or digit as Unicode maps it (m as
  // rn, 1 and | as l, 0 as O), lowercased again
  const asciiPrototype = new Map<string, string>();
  for (const [s, t] of unicode) if (isAscii(s) && isAsciiAlnum(t)) asciiPrototype.set(s, t);
  const prototype = (target: string) =>
    [...target.toLowerCase()].map((c) => asciiPrototype.get(c) ?? c).join("").toLowerCase();

  const entries = new Map<string, Entry>();
  const add = (source: string, target: string, from: Entry["from"]) => {
    if (!entries.has(source)) entries.set(source, { source, target: prototype(target), from });
  };

  // Unicode: every source whose target is Latin letters or digits. ASCII sources only where lowercase-safe: capital I
  // (-> l) is left to the case-preserving map, as namespace-guard compares names without case (ADMIN is admin)
  for (const [s, t] of unicode) {
    if (!isAsciiAlnum(t)) continue;
    if (isAscii(s) && s !== s.toLowerCase()) continue;
    add(s, t, "unicode");
  }
  // Capital ASCII letters whose lowercase maps (M, as m -> rn), so skeleton() stays case-insensitive
  for (const [s, e] of [...entries]) {
    if (isAscii(s) && s.toUpperCase() !== s && !entries.has(s.toUpperCase())) add(s.toUpperCase(), e.target, "unicode");
  }
  const casePreserving: Record<string, string> = {};
  for (const [s, t] of unicode) {
    if (isAscii(s) && s !== s.toLowerCase() && isAsciiAlnum(t) && prototype(t) !== prototype(s)) casePreserving[s] = prototype(t);
  }
  for (const [cp, t] of SUPPLEMENTAL) add(String.fromCodePoint(cp), t, "supplemental");
  // Unicode mappings that reach Latin through another mapped character (ꭻ -> ᴊ -> j)
  for (const [s, t] of unicode) {
    if (entries.has(s) || isAscii(s)) continue;
    const through = [...t].map((c) => entries.get(c)?.target ?? (isAsciiAlnum(c) ? c : null));
    if (through.every((c) => c !== null)) add(s, through.join(""), "unicode");
  }

  // confusable-vision: per character, its best measured letter (strict over broad over design, then the most
  // contexts, then the closest)
  const measured = new Map<string, Measured & { distance: number }>();
  const rank = { strict: 3, broad: 2, design: 1 } as const;
  const inPlaceFile = path.join(releaseDir, "in-place.jsonl.gz");
  const body = fs.readFileSync(inPlaceFile);
  const releaseVersion = path.basename(path.resolve(releaseDir));
  const measuredSources = [`confusable-vision release ${releaseVersion}, in-place.jsonl.gz (sha256 ${crypto.createHash("sha256").update(body).digest("hex").slice(0, 16)})`];
  for (const line of zlib.gunzipSync(body).toString("utf8").trim().split("\n")) {
    const r = JSON.parse(line);
    if (r.tier === "no" || typeof r.b !== "string" || !isAsciiAlnum(r.b) || r.b.length > 2) continue;
    const x = String.fromCodePoint(parseInt(r.a.slice(2), 16));
    const tier = r.tier as Measured["tier"];
    const where = r.contexts.filter((c: any) => c.dpr1?.verdict === tier || c.dpr2?.verdict === tier);
    const candidate = { letter: r.b, target: prototype(r.b), tier, contexts: where.map((c: any) => c.context as string),
      distance: Math.min(...where.map((c: any) => c.distance as number)) };
    const best = measured.get(x);
    const better = !best || rank[tier] > rank[best.tier] || (rank[tier] === rank[best.tier] && (candidate.contexts.length > best.contexts.length || (candidate.contexts.length === best.contexts.length && candidate.distance < best.distance)));
    if (better) measured.set(x, candidate);
  }
  // A measured lookalike Unicode does not map joins the map (Unicode's mapping wins where it has one)
  for (const [x, m] of measured) if (!isAscii(x)) add(x, m.letter, "measured");
  const tierOf = (source: string) => measured.get(source)?.tier;

  // CONFUSABLE_MAP: non-ASCII sources NFKC does not already reduce to an ASCII slug fragment (for pipelines that run
  // NFKC first, and for rejecting names that contain a lookalike character)
  // Measured entries only from the strict tier here: a name is rejected for containing one of these characters, so
  // the bar is as alike as the median accepted confusable; broad and design lookalikes count when two names are compared
  const nfkcFiltered = [...entries.values()].filter((e) => {
    if (isAscii(e.source)) return false;
    if (e.from === "measured" && tierOf(e.source) !== "strict") return false;
    const nfkc = e.source.normalize("NFKC").toLowerCase();
    return !(nfkc.length > 0 && /^[a-z0-9-]+$/.test(nfkc));
  });
  const full = [...entries.values()];

  const counts = (list: Entry[]) => Object.entries(list.reduce((a, e) => ((a[e.from] = (a[e.from] ?? 0) + 1), a), {} as Record<string, number>)).map(([k, v]) => `${k} ${v}`).join(", ");
  console.error(`confusables.txt ${unicodeDate}: ${unicode.size} mappings`);
  console.error(`CONFUSABLE_MAP_FULL: ${full.length} (${counts(full)})`);
  console.error(`CONFUSABLE_MAP: ${nfkcFiltered.length} (${counts(nfkcFiltered)})`);
  console.error(`MEASURED_CONFUSABLES: ${measured.size}`);

  const esc = (s: string) => [...s].map((c) => {
    const cp = c.codePointAt(0)!;
    if (cp >= 0x20 && cp < 0x7f && c !== '"' && c !== "\\") return c;
    return cp <= 0xffff ? `\\u${cp.toString(16).padStart(4, "0")}` : `\\u{${cp.toString(16)}}`;
  }).join("");
  const mapLines = (list: Entry[]) => {
    const sorted = [...list].sort((a, b) => a.source.codePointAt(0)! - b.source.codePointAt(0)!);
    const out: string[] = [];
    for (let i = 0; i < sorted.length; i += 6) out.push("  " + sorted.slice(i, i + 6).map((e) => `"${esc(e.source)}": "${e.target}"`).join(", ") + ",");
    return out.join("\n");
  };
  const measuredLines = [...measured.entries()].sort((a, b) => a[0].codePointAt(0)! - b[0].codePointAt(0)!)
    .map(([x, m]) => `  "${esc(x)}": { letter: "${esc(m.letter)}", target: "${m.target}", tier: "${m.tier}", contexts: [${m.contexts.map((c) => `"${c}"`).join(", ")}] },`).join("\n");

  const file = `/*! namespace-guard, MIT License, copyright (c) 2026 Paul Wood FRSA (@paultendo).
 * Includes data from Unicode confusables.txt (${unicodeDate}), copyright 1991-Present Unicode, Inc., Unicode License v3
 * (https://www.unicode.org/terms_of_use.html), and from confusable-vision measurements by Paul Wood FRSA (@paultendo),
 * CC BY 4.0 (https://github.com/paultendo/confusable-vision). */
// Generated by scripts/generate-confusables.ts. Do not edit by hand.
// Unicode: confusables.txt, ${unicodeDate}.
// Measured: ${measuredSources.join("; ") || "none"}.

/** Unicode confusables.txt version these maps were built from. */
export const CONFUSABLES_DATE = "${unicodeDate}";

/**
 * Non-ASCII characters that look like Latin letters or digits, to their lowercase prototype, for pipelines that run
 * NFKC first and for rejecting names that contain one: Unicode's mappings, Latin small capitals, and confusable-vision's
 * strict-tier lookalikes Unicode does not map. ${nfkcFiltered.length} entries.
 */
/* prettier-ignore */
export const CONFUSABLE_MAP: Record<string, string> = {
${mapLines(nfkcFiltered)}
};

/**
 * Every character that looks like Latin letters or digits, to its lowercase prototype: all of Unicode's mappings to
 * Latin (including multi-character targets such as m -> rn and the ASCII entries 1 -> l, 0 -> o, | -> l), Latin small
 * capitals, and confusable-vision's measured lookalikes. Case matters: look a character up as typed. ${full.length} entries.
 */
/* prettier-ignore */
export const CONFUSABLE_MAP_FULL: Record<string, string> = {
${mapLines(full)}
};

/** ASCII capitals Unicode maps to another letter, used where case is preserved (capital I looks like l). */
export const CONFUSABLE_MAP_CASED: Record<string, string> = ${JSON.stringify(casePreserving)};

/** One measured lookalike: the letter or digit it passes for, its prototype, and where it holds. */
export type MeasuredConfusable = {
  /** The ASCII letter(s) or digit(s) it was measured against. */
  letter: string;
  /** namespace-guard's lowercase prototype of that letter. */
  target: string;
  /** strict: as alike as the median accepted confusable in that context; broad: as alike as the least alike one;
   *  design: alike to the letter as another common font draws it. */
  tier: "strict" | "broad" | "design";
  /** Where it holds: font and size (px), set between neighbours with the platform's fallback. */
  contexts: string[];
};

/**
 * confusable-vision's in-place measurements: each character found alike to an ASCII letter or digit, with the best
 * letter it passes for and where. ${measured.size} characters.
 */
/* prettier-ignore */
export const MEASURED_CONFUSABLES: Record<string, MeasuredConfusable> = {
${measuredLines}
};
`;
  fs.writeFileSync(OUT, file);
  console.error(`-> ${path.relative(process.cwd(), OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
