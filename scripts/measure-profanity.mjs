#!/usr/bin/env node
/**
 * Measures the English profanity list (namespace-guard/profanity-en) against openly licensed word, name and place data,
 * and derives PROFANITY_ALLOWLIST_EN (src/profanity-en.ts and docs/data/profanity-allowlist.json): names, places and
 * common words that contain a listed word, so the English validator lets them through (Scunthorpe, Dickson,
 * Kirkland).
 *
 *   npm run build && node scripts/measure-profanity.mjs           # measure; say whether the allowlist is current
 *   npm run build && node scripts/measure-profanity.mjs --write   # rewrite it in src/profanity-en.ts and docs/data
 *   npm run build:profanity-data                                  # then copy it into the playground's preload
 *
 * Sources, in .cache/open-names/ (git-ignored; --open-dir to use another folder):
 *  - Names_2010Census.csv: US Census 2010 surnames, public domain.
 *    https://www2.census.gov/topics/genealogy/2010surnames/names.zip
 *  - babynames1996to2025.xlsx: ONS, Baby names in England and Wales from 1996, Open Government Licence v3.0.
 *    https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/datasets/babynamesinenglandandwalesfrom1996
 *  - GB.txt and cities1000.txt: GeoNames, CC BY 4.0. https://download.geonames.org/export/dump/GB.zip and
 *    https://download.geonames.org/export/dump/cities1000.zip
 *  - /usr/share/dict/words: Webster's Second International (1934), public domain.
 * Options: --census-floor (default 100, all of the file), --first-name-floor (default 3, all of the file), --out <file>
 * to write the allowlist elsewhere as JSON. Needs Node and the unzip command.
 *
 * Every candidate goes through the slur and crude screens (SLUR_STEMS, CRUDE_STEMS, SCREEN_EXCEPTIONS below), and
 * REVIEWED_OUT and REVIEWED_IN hold Paul's reviews.
 *
 * `--sources=mac` builds the allowlist from macOS's name and place data (Apple's name lists, a gazetteer, city and
 * airport data, the Siri lexicon) and wordfreq instead, for comparison only: it writes to --out, never to the shipped
 * files. It also re-derives PROFANITY_COMMON_INSIDE_WORDS (src/index.ts), which needs Python's wordfreq, and says
 * whether the core's set is current; this script doesn't edit the core.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createProfanityValidator } from "../dist/index.mjs";
import { PROFANITY_WORDS_EN } from "../dist/profanity-en.mjs";

const WRITE = process.argv.includes("--write");
/**
 * Sources. By default, openly licensed data only (see the header), and --write updates the shipped allowlist.
 * `--sources=mac` uses the name and place data in macOS's system frameworks and wordfreq instead, for comparison
 * only: it can write to --out but never to the shipped files. It also checks PROFANITY_COMMON_INSIDE_WORDS.
 */
const MAC = process.argv.includes("--sources=mac");
const OPEN = !MAC;
const option = (name) => {
  const inline = process.argv.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const ROOT = new URL("..", import.meta.url).pathname;
const OPEN_DIR = option("--open-dir") ?? join(ROOT, ".cache/open-names");
const OUT = option("--out");
/** Census surnames borne by at least this many people count as names (the census lists surnames with 100 or more). */
const CENSUS_FLOOR = Number(option("--census-floor") ?? 100);
/** First names given to at least this many babies in England and Wales, 1996 to 2025, count as names (ONS lists a
 *  name in a year once 3 or more babies have it). */
const FIRST_NAME_FLOOR = Number(option("--first-name-floor") ?? 3);
if (MAC && WRITE) throw new Error("--sources=mac is for comparison only: use --out <file>, not --write");
if (OUT && /^(src|docs)(\/|$)/.test(relative(ROOT, resolve(OUT)))) throw new Error("--out must be outside src/ and docs/");
const SUGGESTIONS = "/System/Library/PrivateFrameworks/CoreSuggestionsInternals.framework/Versions/A/Resources";
const GAZETTEER =
  "/System/Library/PrivateFrameworks/PersonalizationPortraitInternals.framework/Versions/A/Resources/assets_100/AugmentedGazetteerMetadata.db";
const CITY_INFO = "/System/Library/PrivateFrameworks/AppSupport.framework/Versions/A/Resources/CityInfo.db";
const SIRI = "/System/Library/AssetsV2/com_apple_MobileAsset_UAF_Siri_Understanding/purpose_auto";

/** Once per million words: the frequency at which a word counts as common (Zipf 3 in wordfreq). */
const COMMON_PER_MILLION = 1;
/** The wordfreq vocabulary that counts as common English: its 100,000 most frequent words. */
const COMMON_TOP = 100_000;
/** A proper noun from the Siri lexicon needs at least this frequency (Zipf 1) to be allowed on its own evidence. */
const PROPER_NOUN_PER_MILLION = 0.01;

// ---------------------------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------------------------

const warn = (message) => console.warn(`warning: ${message}`);
/** Lowercase letters a-z only: marks dropped, other characters removed. */
const fold = (s) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z]/g, "");
const lines = (path) => {
  if (!existsSync(path)) {
    warn(`${path} is missing`);
    return [];
  }
  return readFileSync(path, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
};
const sqlite = (db, sql) => {
  if (!existsSync(db)) {
    warn(`${db} is missing`);
    return [];
  }
  return execFileSync("sqlite3", ["-separator", "\t", db, sql], { encoding: "utf8", maxBuffer: 1 << 28 })
    .split("\n")
    .filter(Boolean)
    .map((row) => row.split("\t"));
};

/** wordfreq's English words (letters only) with their frequency per million words, most frequent first. */
function wordfreqEnglish() {
  const code = [
    "import json, re, sys, wordfreq",
    "out = [[w, wordfreq.word_frequency(w, 'en') * 1e6] for w in wordfreq.top_n_list('en', 400000, wordlist='best') if re.fullmatch(r'[a-z]+', w)]",
    "json.dump(out, sys.stdout)",
  ].join("\n");
  try {
    return JSON.parse(execFileSync("python3", ["-c", code], { encoding: "utf8", maxBuffer: 1 << 28 }));
  } catch (error) {
    throw new Error(`wordfreq is needed (pip3 install wordfreq): ${error.message}`);
  }
}

/**
 * Names from a CoreSuggestions trie (firstnames.trie, lastnames.trie): runs of records, one run per first letter,
 * each record [shared prefix length][length][0][u32 value][suffix]. The first letter of a run isn't stored, so each
 * run gets the letter, after the previous run's, whose names are most often known names.
 */
function appleNameTrie(path, known) {
  if (!existsSync(path)) {
    warn(`${path} is missing`);
    return [];
  }
  const data = readFileSync(path);
  const runs = [];
  let run = null;
  let end = -1;
  for (let i = 0x40; i + 7 < data.length; i++) {
    const shared = data[i];
    const length = data[i + 1];
    if (shared > 31 || length < 1 || length > 31 || data[i + 2] !== 0 || data[i + 3] !== 1) continue;
    if (data[i + 4] !== 0 || data[i + 5] !== 0 || data[i + 6] !== 0) continue;
    const suffix = data.subarray(i + 7, i + 7 + length).toString("latin1");
    if (!/^[a-z' -]+$/.test(suffix)) continue;
    if (i !== end) runs.push((run = []));
    const previous = run.length > 0 ? run[run.length - 1] : "";
    run.push(previous.slice(0, shared) + suffix);
    end = i + 7 + length;
    i = end - 1;
  }
  const names = [];
  let letter = "a".charCodeAt(0) - 1;
  for (const suffixes of runs) {
    let best = letter + 1;
    let bestScore = -1;
    for (let c = letter + 1; c <= "z".charCodeAt(0); c++) {
      const score = suffixes.filter((s) => known.has(String.fromCharCode(c) + fold(s))).length;
      if (score > bestScore) [best, bestScore] = [c, score];
    }
    letter = best;
    for (const s of suffixes) names.push(fold(String.fromCharCode(letter) + s));
  }
  return names;
}

/** Words of the Siri speech recognisers' lexicons, with their case: `QSR_SYM_V000`, count, offsets, strings. */
function siriLexicon() {
  const words = new Set();
  if (!existsSync(SIRI)) {
    warn(`${SIRI} is missing`);
    return words;
  }
  for (const asset of readdirSync(SIRI)) {
    const path = join(SIRI, asset, ".AssetData/qnnlm/words.symmap");
    if (!existsSync(path)) continue;
    const data = readFileSync(path);
    if (data.subarray(0, 12).toString("latin1") !== "QSR_SYM_V000") continue;
    const count = data.readUInt32LE(12);
    const base = 16 + 4 * count;
    for (let i = 0; i < count; i++) {
      const start = base + data.readUInt32LE(16 + 4 * i);
      let stop = start;
      while (stop < data.length && data[stop] !== 0) stop++;
      words.add(data.subarray(start, stop).toString("utf8"));
    }
  }
  if (words.size === 0) warn("no Siri lexicon found");
  return words;
}

/** City and airport names from CoreSuggestions' airports.dat, in English. */
function airportCities() {
  const path = join(SUGGESTIONS, "airports.dat");
  if (!existsSync(path)) {
    warn(`${path} is missing`);
    return [];
  }
  const text = readFileSync(path).toString("latin1");
  const out = [];
  for (const m of text.matchAll(/en([A-Z][A-Za-z\x80-\xff' .-]{1,60})/g)) {
    const name = Buffer.from(m[1], "latin1").toString("utf8");
    if (!/airport|air base|airfield|heliport|station/i.test(name)) out.push(name);
  }
  return out;
}

function timeZoneCities() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/^[A-Z][A-Za-z_-]+$/.test(entry)) out.push(entry.replace(/_/g, " "));
    }
  };
  if (existsSync("/usr/share/zoneinfo")) walk("/usr/share/zoneinfo");
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The list's letters, read as the validator reads entries (both variant profiles)
// ---------------------------------------------------------------------------------------------------------------

const BALANCED = { 0: ["o"], 1: ["i"], 3: ["e"], 4: ["a"], 5: ["s"], 7: ["t"], "@": ["a"], $: ["s"], "+": ["t"], "!": ["i"], "|": ["i"] };
const AGGRESSIVE = { ...BALANCED, 1: ["i", "l"], 2: ["z"], 6: ["g"], 8: ["b"], 9: ["g"], "!": ["i", "l"], "|": ["i", "l"] };

function entryLetters(entry) {
  let readings = [""];
  for (const ch of entry.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()) {
    const out = new Set();
    for (const table of [BALANCED, AGGRESSIVE]) {
      if (/[a-z]/.test(ch)) out.add(ch);
      else if (/[0-9]/.test(ch)) [...(table[ch] ?? []), ch].forEach((o) => out.add(o));
      else if (table[ch]) table[ch].forEach((o) => out.add(o));
      else out.add("");
    }
    readings = readings.flatMap((r) => [...out].map((o) => r + o)).slice(0, 32);
  }
  return readings.filter(Boolean);
}

// ---------------------------------------------------------------------------------------------------------------
// Sources for each mode
// ---------------------------------------------------------------------------------------------------------------

/** macOS's names and places: Apple's name lists, the gazetteer, city and airport data, the Siri lexicon. */
function loadMacSources(properNames) {
  const people = sqlite(GAZETTEER, "select name, category_id from metadata where category_id in (1,2,3,4,5,6)");
  const gazetteerPeople = new Map(); // name tokens of actors, politicians and athletes (not musicians: bands, stage names)
  const gazetteerOther = new Set(); // tokens of sports teams and tourist attractions
  for (const [name, category] of people) {
    const tokens = name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().split(/[^a-z']+/).map(fold).filter((t) => t.length >= 2);
    if (["1", "3", "4"].includes(category) && tokens.length >= 2) {
      for (const t of new Set(tokens)) gazetteerPeople.set(t, (gazetteerPeople.get(t) ?? 0) + 1);
    } else if (["5", "6"].includes(category)) tokens.forEach((t) => gazetteerOther.add(t));
  }
  const knownNames = new Set([...properNames, ...gazetteerPeople.keys()]);
  const appleNames = new Set([
    ...appleNameTrie(join(SUGGESTIONS, "firstnames.trie"), knownNames),
    ...appleNameTrie(join(SUGGESTIONS, "lastnames.trie"), knownNames),
  ]);
  const places = placeSet([
    ...airportCities(),
    ...sqlite(CITY_INFO, "select name from cities union select country_name from locales").map(([n]) => n),
    ...timeZoneCities(),
  ]);
  const siri = siriLexicon();
  const siriLower = new Set();
  const siriTitle = new Set();
  for (const word of siri) {
    const plain = word.normalize("NFKD").replace(/\p{M}/gu, "");
    if (/^[a-z][a-z']*$/.test(plain)) siriLower.add(fold(plain));
    else if (/^[A-Z][a-z']+$/.test(plain)) siriTitle.add(fold(plain));
  }
  const properNouns = new Set([...siriTitle].filter((w) => !siriLower.has(w)));
  return { gazetteerPeople, gazetteerOther, appleNames, places, properNouns };
}

/** Place names, whole and each part of three or more letters, folded to a-z. */
function placeSet(names) {
  const places = new Set();
  for (const name of names) {
    places.add(fold(name));
    for (const token of name.split(/[\s-]+/)) if (fold(token).length >= 3) places.add(fold(token));
  }
  places.delete("");
  return places;
}

/**
 * Openly licensed names and places in OPEN_DIR: the US Census 2010 surnames (Names_2010Census.csv, public domain) with
 * their counts, and GeoNames (CC BY 4.0) populated places and administrative areas in the UK (GB.txt, feature classes
 * P and A) and places of 1,000 people or more worldwide (cities1000.txt), by name and ASCII name.
 */
function loadOpenSources(dir) {
  const census = new Map();
  for (const line of lines(join(dir, "Names_2010Census.csv")).slice(1)) {
    const [name, , count] = line.split(",");
    const n = Number(count);
    if (fold(name) && Number.isFinite(n)) census.set(fold(name), n);
  }
  const geonames = (file, keep) => {
    const out = [];
    for (const line of lines(join(dir, file))) {
      const f = line.split("\t");
      if (keep(f)) out.push(f[1], f[2]);
    }
    return out;
  };
  const ukPlaces = placeSet(geonames("GB.txt", (f) => f[6] === "P" || f[6] === "A"));
  // UK places named "X cum Y" (Latin: with), as exact hyphenated entries: chorlton-cum-hardy, stow-cum-quy.
  const cumPlaces = new Set(
    geonames("GB.txt", (f) => f[6] === "P")
      .map((n) => n.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""))
      .filter((n) => /(^|-)cum(-|$)/.test(n) && !/^cum-|-cum$/.test(n))
  );
  const worldPlaces = placeSet(geonames("cities1000.txt", () => true));
  const workbook = existsSync(dir) ? readdirSync(dir).filter((f) => /^babynames.*\.xlsx$/.test(f)).sort().pop() : undefined;
  if (!workbook) warn(`no ONS babynames*.xlsx in ${dir}`);
  const firstNames = workbook ? onsBabyNames(join(dir, workbook)) : new Map();
  return { census, ukPlaces, places: new Set([...ukPlaces, ...worldPlaces]), firstNames, cumPlaces };
}

/**
 * First names given to babies in England and Wales from ONS's "Baby names in England and Wales: from 1996" workbook
 * (Open Government Licence v3.0): name -> babies across all years, girls (Table_1) and boys (Table_2) together. Read
 * with unzip and regular expressions, so no spreadsheet library is needed.
 */
function onsBabyNames(path) {
  const unzip = (member) => execFileSync("unzip", ["-p", path, member], { encoding: "utf8", maxBuffer: 1 << 30 });
  const decode = (t) =>
    t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const shared = [...unzip("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decode([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join(""))
  );
  const rels = new Map([...unzip("xl/_rels/workbook.xml.rels").matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const sheets = [...unzip("xl/workbook.xml").matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)];
  const names = new Map();
  for (const [, sheetName, id] of sheets) {
    if (!/^Table_[12]$/.test(sheetName)) continue;
    const xml = unzip(`xl/${rels.get(id).replace(/^\//, "").replace(/^xl\//, "")}`);
    let countColumns = null;
    for (const [, row] of xml.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = new Map();
      for (const [, column, attributes, value] of row.matchAll(/<c r="([A-Z]+)\d+"([^>]*)>(?:<f>[^<]*<\/f>)?<v>([^<]*)<\/v><\/c>/g)) {
        cells.set(column, / t="s"/.test(attributes) ? shared[Number(value)] : value);
      }
      if (!countColumns) {
        if (cells.get("A") === "Name") countColumns = [...cells].filter(([, v]) => /Count$/.test(v)).map(([c]) => c);
        continue;
      }
      const name = fold(cells.get("A") ?? "");
      if (!name) continue;
      let babies = 0;
      for (const c of countColumns) babies += Number(cells.get(c)) || 0;
      names.set(name, (names.get(name) ?? 0) + babies);
    }
  }
  return names;
}

// ---------------------------------------------------------------------------------------------------------------
// Measure
// ---------------------------------------------------------------------------------------------------------------

const list = [...PROFANITY_WORDS_EN];
const listLetters = new Set(list.flatMap(entryLetters));

console.log(`loading ${OPEN ? "open" : "macOS"} sources...`);
const dictionary = lines("/usr/share/dict/words");
const dictLower = new Set(dictionary.filter((w) => /^[a-z]+$/.test(w)));
const dictAll = new Set(dictionary.map(fold).filter(Boolean));
const properNames = new Set(OPEN ? [] : lines("/usr/share/dict/propernames").map(fold).filter(Boolean));
const freqPairs = OPEN ? [] : wordfreqEnglish();
const freq = new Map(freqPairs);
// Common words: dictionary words among wordfreq's most frequent; in open mode, every lowercase dictionary word.
const commonWords = OPEN
  ? new Set(dictLower)
  : new Set(
      freqPairs
        .slice(0, COMMON_TOP)
        .map(([w]) => w)
        .filter((w) => dictAll.has(w) || properNames.has(w))
    );
const mac = OPEN ? null : loadMacSources(properNames);
const open = OPEN ? loadOpenSources(OPEN_DIR) : null;
const gazetteerPeople = mac?.gazetteerPeople ?? new Map();
const appleNames = mac?.appleNames ?? new Set();
const places = mac?.places ?? open.places;
const census = open?.census ?? new Map();
const firstNames = open?.firstNames ?? new Map();

// PROFANITY_COMMON_INSIDE_WORDS (needs wordfreq, so not in open mode)
if (!OPEN) {
  const insideCorpus = [...commonWords].filter((w) => !listLetters.has(w));
  const commonInside = [];
  for (const letters of listLetters) {
    let perMillion = 0;
    for (const w of insideCorpus) if (w !== letters && w.includes(letters)) perMillion += freq.get(w) ?? 0;
    if (perMillion >= COMMON_PER_MILLION) commonInside.push(letters);
  }
  commonInside.sort();
  const indexSource = readFileSync(join(ROOT, "src/index.ts"), "utf8");
  const current = indexSource.match(/PROFANITY_COMMON_INSIDE_WORDS: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\)/);
  const currentSet = current ? [...current[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort() : [];
  const stemsCurrent = currentSet.join() === commonInside.join();
  console.log(`PROFANITY_COMMON_INSIDE_WORDS: ${commonInside.length} sequences, ${stemsCurrent ? "as in src/index.ts" : "DIFFERENT from src/index.ts"}`);
  if (!stemsCurrent) {
    console.log(`  added: ${commonInside.filter((l) => !currentSet.includes(l)).join(" ") || "none"}`);
    console.log(`  removed: ${currentSet.filter((l) => !commonInside.includes(l)).join(" ") || "none"}`);
    console.log(`  new set: ${JSON.stringify(commonInside)}`);
  }
}

// PROFANITY_ALLOWLIST_EN
const words3 = new Set([...commonWords].filter((w) => w.length >= 3));
const PREFIXES = new Set(["un", "re", "dis", "mis", "non", "anti", "pre", "post", "super", "mega", "ultra", "my", "ur", "mr", "big", "lil", "the"]);
const SUFFIXES = new Set(["s", "es", "ed", "er", "ers", "or", "ors", "ing", "in", "y", "ie", "ies", "ish", "ery", "ry", "ty", "ly", "ness", "less", "ful", "dom", "hood", "ism", "ist", "ists", "ite", "ites", "ic", "al", "z", "zz", "age", "ster", "sters", "ette", "ettes", "fest", "tastic"]);
const segments = (s, affixes) => {
  const ok = [true];
  for (let i = 1; i <= s.length; i++) {
    ok[i] = false;
    for (let j = 0; j < i && !ok[i]; j++) ok[i] = ok[j] && (words3.has(s.slice(j, i)) || affixes.has(s.slice(j, i)));
  }
  return ok[s.length];
};
const substringLetters = [...listLetters].filter((l) => l.length >= 4);
/**
 * Whether a word is a listed word with English words or affixes around it, not a name to allow. "broad" (for proper
 * nouns of unknown kind): words and affixes, so "klansman" and "pussyfarts" are out. "narrow" (for real people's
 * names, which often end in an affix: cummings, spikes): only a listed word joined to one English word of four or
 * more letters ("thunderfuck"). "affixes" (for common words, which are often compounds: woodpecker): only affixes,
 * so "masturbator" is out.
 */
function isDerivative(word, kind) {
  const onlyAffixes = (s, affixes) => {
    const ok = [true];
    for (let i = 1; i <= s.length; i++) {
      ok[i] = false;
      for (let j = 0; j < i && !ok[i]; j++) ok[i] = ok[j] && affixes.has(s.slice(j, i));
    }
    return ok[s.length];
  };
  for (const letters of substringLetters) {
    for (let i = word.indexOf(letters); i >= 0; i = word.indexOf(letters, i + 1)) {
      const left = word.slice(0, i);
      const right = word.slice(i + letters.length);
      if (kind === "narrow") {
        if ((left === "" && right.length >= 4 && words3.has(right)) || (right === "" && left.length >= 4 && words3.has(left))) {
          return true;
        }
      } else if (kind === "affixes") {
        if ((left === "" || onlyAffixes(left, PREFIXES)) && (right === "" || onlyAffixes(right, SUFFIXES))) return true;
      } else if ((left === "" || segments(left, PREFIXES)) && (right === "" || segments(right, SUFFIXES))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Allowed by the rules above but offensive in a handle; taken out after reading the allowlist. Keep this short: a
 * word belongs here only when the rules can't tell it from a name.
 */
const REVIEWED_OUT = new Set([
  "bonerz", "chingada", "cuntry", "icunt", "merda", "merde", "muthafucka", "shizzle", "wanko", "xxxxx",
  // Reviewed 26 Sep 2026: explicit or a slur whatever the data says
  "nymphomaniac", "sadomasochism", "incestuous", "spermy", "titten", "chinki",
  // and borderline ones Paul chose to refuse
  "ruskie", "wanka", "vulvar", "molesta", "pubescent", "clito", "clites", "shitepoke",
]);
// Allowed after review although the rules call them derivatives of a listed word: surnames that read as harmless;
// and well-known names no source here has (a country and a person).
const REVIEWED_IN = new Set([
  "thorndike", "dagostino", "shizhong", "montenegro", "negroponte",
  // given names the open sources lack (Shizuka Arakawa, Dikembe Mutombo)
  "shizuka", "dikembe",
]);

/**
 * Screens, applied to candidates from every source: a word containing one of these is never allowed, whatever its
 * source, unless SCREEN_EXCEPTIONS has it. SLUR_STEMS are slurs, so a name or place that looks like one is refused
 * too; CRUDE_STEMS are words that read crude or sexual in a handle.
 */
const SLUR_STEMS = [
  "nigg", "nigr", "negro", "coon", "golliwog", "chink", "gook", "kike", "wog", "paki", "spic", "fag", "tranny",
  "trannie", "retard", "raghead", "towelhead", "wetback", "darkie", "darky", "gyppo", "pikey", "dago", "sambo", "squaw",
  "redskin", "beaner", "wigger", "jigaboo", "zipperhead", "chinaman", "shemale",
];
const CRUDE_STEMS = [
  "whore", "slut", "piss", "bitch", "bastard", "tits", "titty", "titt", "boob", "clit", "penis", "vagin", "vulv",
  "scrot", "sodom", "incest", "nympho", "fetish", "erotic", "erotism", "cum", "wank", "boner", "jizz", "dildo",
  "felch", "puss", "porn",
];
/** Words that contain a screened stem but read as neither a slur nor crude, each with the reason it stays. */
const SCREEN_EXCEPTIONS = new Map([
  // slur stems
  ["montenegro", "the country"],
  ["negroponte", "Nicholas Negroponte, and the Venetian name for Chalcis"],
  ["rionegro", "Río Negro, the Argentine province and river, and Rionegro, Colombia"],
  ["gobbledygook", "ordinary word"],
  ["squawk", "ordinary word"],
  ["denigrate", "ordinary word, from Latin nigrare"],
  ["denigration", "ordinary word"],
  ["winegrower", "ordinary word: wine grower"],
  ["winegrowing", "ordinary word: wine growing"],
  ["pinegrove", "Pine Grove, a common place name"],
  ["dagostino", "D'Agostino, Italian surname (Paul's review)"],
  ["dagostini", "D'Agostini, Italian surname (Paul's review)"],
  ["panigrahi", "Odia surname (Paul's review)"],
  ["schinkel", "surname: Karl Friedrich Schinkel, the architect (Paul's review)"],
  ["negroni", "the cocktail (Paul's review)"],
  // crude stems
  ["clitheroe", "the Lancashire town"],
  ["penistone", "the Yorkshire town"],
  ["cummerbund", "ordinary word"],
  ["scummy", "ordinary word"],
  ["swank", "ordinary word"],
  ["swanky", "ordinary word"],
  ["tittle", "ordinary word: jot and tittle"],
  ["titter", "ordinary word"],
  ["tittup", "ordinary word"],
  ["pettitt", "surname, from French petit"],
  ["petitt", "surname, from French petit"],
  ["carbonera", "Spanish, charcoal: places and surname"],
  ["carbonero", "Spanish, charcoal burner: places and surname"],
  ["princestown", "Princes Town, Trinidad"],
  ["cummings", "surname (Paul's review)"],
  ["cummins", "surname (Paul's review)"],
  ["nwankwo", "Igbo surname (Paul's review)"],
  ["mahboob", "Urdu given name and surname (Paul's review)"],
  ["mehboob", "Urdu given name and surname (Paul's review)"],
  ["stitt", "surname (Paul's review)"],
  ["konigslutter", "Königslutter am Elm, Lower Saxony (Paul's review)"],
  ["koenigslutter", "Königslutter, spelled without the umlaut (Paul's review)"],
]);
function screen(word) {
  if (SCREEN_EXCEPTIONS.has(word)) return null;
  if (SLUR_STEMS.some((stem) => word.includes(stem))) return "slur";
  if (CRUDE_STEMS.some((stem) => word.includes(stem))) return "crude";
  return null;
}

const plain = createProfanityValidator(list);
const refusedBy = async (validator, words) => {
  const out = [];
  for (const w of words) if (await validator(w)) out.push(w);
  return out;
};

/**
 * Entries taken off the list in 0.23.0 because they are first names, surnames or places: the name of at least one
 * actor, politician or athlete in the gazetteer, on a common-name list, or a city. They stay allowed when another
 * entry still matches them. Kept on the list, though they are names too, because in a handle the slur or sexual sense
 * is the likelier reading: dick, dicks, dyke, gook, coons, negro, nig, jiz, quim, swastika, cooter, lolita, mong, and
 * cumming (Paul's call, 26 Sep 2026).
 */
const TAKEN_OFF_AS_NAMES = `aryan blackman bong carruth damm dix dong ekrem fatah ficken ganja gaylord guido gummer haji hadji
  hebe hoare hui ike jerry kock kuntz kwa lucifer lynch mick moron nimrod noonan packie paddy phuc polak pula reich sanchez
  santorum schaffer shota stagg wang weiner areola boozer bosch dink fok gai gipp gooch hooker lech massa pansy
  pollock sissy stoner titi naked kinky jiggy toots skeet bint fanny gora hell hoar hor hardcore leitch ock punta`.split(/\s+/);
const onList = TAKEN_OFF_AS_NAMES.filter((w) => listLetters.has(w));
if (onList.length > 0) warn(`names taken off the list are on it again: ${onList.join(" ")}`);

const candidates = new Map(); // word -> [source, whether it must not be a derivative]
const consider = (source, words, checkDerivative) => {
  for (const w of words) if (w && !candidates.has(w) && !listLetters.has(w)) candidates.set(w, [source, checkDerivative]);
};
// In this order: a word is judged by the first source that has it.
consider("allowed after review", [...REVIEWED_IN], false);
consider("name taken off the list", TAKEN_OFF_AS_NAMES, false);
if (OPEN) {
  consider("ONS first name", [...firstNames].filter(([, n]) => n >= FIRST_NAME_FLOOR).map(([w]) => w), "narrow");
  consider("census surname", [...census].filter(([, n]) => n >= CENSUS_FLOOR).map(([w]) => w), "narrow");
  consider("GeoNames place", [...places], false);
  consider("dictionary word", [...dictLower], "affixes");
} else {
  consider("common-name list", [...appleNames, ...properNames], false);
  consider("place", [...places, ...mac.gazetteerOther], false);
  consider("name of a person in the gazetteer", [...gazetteerPeople.keys()], "narrow");
  consider("proper noun the dictionary has", [...mac.properNouns].filter((w) => dictLower.has(w)), false);
  consider("common word", [...commonWords], "affixes");
  consider("proper noun", [...mac.properNouns].filter((w) => (freq.get(w) ?? 0) >= PROPER_NOUN_PER_MILLION), "broad");
}
const passedRules = (await refusedBy(plain, [...candidates.keys()])).filter(
  (w) => !REVIEWED_OUT.has(w) && (!candidates.get(w)[1] || !isDerivative(w, candidates.get(w)[1]))
);
// The slur and crude screens apply to candidates from every source.
const screenedOut = { slur: [], crude: [] };
const refusedCandidates = passedRules.filter((w) => {
  const kind = screen(w);
  if (kind) screenedOut[kind].push(w);
  return !kind;
});
console.log(`screened out as slurs (${screenedOut.slur.length}): ${screenedOut.slur.sort().join(" ")}`);
console.log(`screened out as crude (${screenedOut.crude.length}): ${screenedOut.crude.sort().join(" ")}`);

// Entries that are names or places in the data, other than those kept on purpose: candidates to take off the list.
const KEPT = new Set("dick dicks dyke gook coons negro nig jiz quim swastika cooter lolita mong cumming".split(" "));
const isNameOrPlace = (l) =>
  OPEN
    ? (census.get(l) ?? 0) >= CENSUS_FLOOR || places.has(l)
    : appleNames.has(l) || properNames.has(l) || (gazetteerPeople.get(l) ?? 0) >= 1 || places.has(l);
const evidence = [];
for (const entry of list) {
  const named = entryLetters(entry).filter((l) => !KEPT.has(l) && isNameOrPlace(l));
  if (named.length > 0) evidence.push(`${entry}${named[0] === entry ? "" : ` (${named[0]})`}`);
}
console.log(`list entries that are names or places in the data: ${evidence.length ? evidence.join(" ") : "none"}`);

// Keep the fewest words: drop one that the shorter allowed words already let through.
const allowlist = [];
const byLength = [...refusedCandidates].sort((a, b) => a.length - b.length || a.localeCompare(b));
for (let i = 0; i < byLength.length; ) {
  const length = byLength[i].length;
  const validator = createProfanityValidator(list, { allowlist });
  for (; i < byLength.length && byLength[i].length === length; i++) {
    if (await validator(byLength[i])) allowlist.push(byLength[i]);
  }
}
// Exact entries: a UK place "X-cum-Y" is allowed only written exactly so (the validator doesn't let such an entry
// shield anything else). They skip the crude screen, which "cum" would trip.
if (OPEN) {
  for (const place of await refusedBy(plain, [...open.cumPlaces])) {
    allowlist.push(place);
    candidates.set(place, ["exact UK place X-cum-Y", false]);
  }
}
allowlist.sort();
const bySource = {};
for (const w of allowlist) bySource[candidates.get(w)[0]] = (bySource[candidates.get(w)[0]] ?? 0) + 1;
console.log(`${OPEN ? "PROFANITY_ALLOWLIST_EN" : "allowlist from macOS sources (comparison only)"}: ${allowlist.length} words (${Object.entries(bySource).map(([k, n]) => `${n} ${k}`).join(", ")})`);

// Report
const allowed = createProfanityValidator(list, { allowlist });
const report = async (label, words) => {
  const unique = [...new Set(words)].filter(Boolean);
  const before = (await refusedBy(plain, unique)).length;
  const after = await refusedBy(allowed, unique);
  console.log(`${label}: ${unique.length} words; refused without the allowlist ${before}, with it ${after.length}`);
  if (process.env.SHOW_REFUSED && label !== "dictionary (/usr/share/dict/words)") console.log(`  ${after.join(" ")}`);
  return after;
};
console.log("\nrefused by the English list with default settings:");
await report("dictionary (/usr/share/dict/words)", dictionary.map((w) => w.toLowerCase()));
if (OPEN) {
  await report(`ONS first names (${FIRST_NAME_FLOOR}+ babies)`, [...firstNames].filter(([, n]) => n >= FIRST_NAME_FLOOR).map(([w]) => w));
  await report(`census surnames (${CENSUS_FLOOR}+ people)`, [...census].filter(([, n]) => n >= CENSUS_FLOOR).map(([w]) => w));
  await report("GeoNames places and their parts", [...places]);
} else {
  await report("common-name lists (Apple, BSD)", [...appleNames, ...properNames]);
  await report("people in the gazetteer (name parts)", [...gazetteerPeople.keys()]);
  await report("places (airports, World Clock cities and countries, time zones)", [...places]);
}
const named = ["scunthorpe", "penistone", "cockermouth", "clitheroe", "essex", "sussex", "middlesex", "twatt", "shitterton"];
const namedRefused = await report("named UK places", named);
if (namedRefused.length > 0) console.log(`  still refused: ${namedRefused.join(" ")}`);

if (OUT) {
  writeFileSync(OUT, `${JSON.stringify(allowlist, null, 2)}\n`);
  console.log(`\n${OUT}: written`);
}
if (MAC) process.exit(0); // comparison only: never the shipped files

// Write
const profanityEn = join(ROOT, "src/profanity-en.ts");
const source = readFileSync(profanityEn, "utf8");
const begin = "// BEGIN GENERATED ALLOWLIST";
const end = "// END GENERATED ALLOWLIST";
const rows = [];
let row = " ";
for (const w of allowlist) {
  const item = ` "${w}",`;
  if (row.length + item.length > 118) {
    rows.push(row);
    row = " ";
  }
  row += item;
}
if (row.trim()) rows.push(row);
const block = `${begin} (node scripts/measure-profanity.mjs --write)\nconst ALLOWLIST_EN: string[] = [\n${rows.join("\n")}\n];\n${end}`;
const updated = source.replace(new RegExp(`${begin}[\\s\\S]*?${end}`), block);
if (!source.includes(begin)) console.log("\nsrc/profanity-en.ts has no generated allowlist block");
else if (updated === source) console.log("\nsrc/profanity-en.ts: the allowlist is current");
else if (WRITE) {
  writeFileSync(profanityEn, updated);
  console.log("\nsrc/profanity-en.ts: allowlist rewritten");
} else console.log("\nsrc/profanity-en.ts: the allowlist is out of date (run with --write)");

// The homepage playground loads the allowlist from docs/data (npm run build:profanity-data copies it into
// profanity-words.global.js).
const playgroundPath = join(ROOT, "docs/data/profanity-allowlist.json");
const playgroundJson = `${JSON.stringify(allowlist, null, 2)}\n`;
const playgroundCurrent = existsSync(playgroundPath) && readFileSync(playgroundPath, "utf8") === playgroundJson;
if (playgroundCurrent) console.log("docs/data/profanity-allowlist.json: current");
else if (WRITE) {
  writeFileSync(playgroundPath, playgroundJson);
  console.log("docs/data/profanity-allowlist.json: rewritten (now run npm run build:profanity-data)");
} else console.log("docs/data/profanity-allowlist.json: out of date (run with --write)");
