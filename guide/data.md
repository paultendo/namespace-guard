# Data and maps

The data behind namespace-guard's checks is exported as plain objects, so you can read it, pass it to the library's functions, or use it in code of your own. It comes from two places: Unicode's confusables.txt, version 2026-08-06, and the measurements of [confusable-vision](https://github.com/paultendo/confusable-vision) release 2026.09.26, which compares how characters look in 322 fonts at the size people read them. [Where the data comes from](where-the-data-comes-from.md) explains how both are made.

| Export | Import from | Size | Use it for |
|---|---|---|---|
| [`CONFUSABLE_MAP_FULL`](#the-character-maps) | `namespace-guard` | 2,216 characters | comparing names as typed; the default map |
| [`CONFUSABLE_MAP`](#the-character-maps) | `namespace-guard` | 1,018 characters | refusing a name that contains a lookalike, after NFKC |
| [`CONFUSABLE_MAP_CASED`](#the-character-maps) | `namespace-guard` | 1 character | capital I as l, where names are shown as typed |
| [`CONFUSABLES_DATE`](#the-character-maps) | `namespace-guard` | | the confusables.txt version |
| [`MEASURED_CONFUSABLES`](#measured-lookalikes) | `namespace-guard` | 974 characters | which fonts and sizes a lookalike holds in |
| [`CONFUSABLE_WEIGHTS`](#visual-weights) | `namespace-guard/confusable-weights` | 2,300 pairs | how alike two characters look, from 0 to 1 |
| [`FONT_SPECIFIC_WEIGHTS`](#weights-per-font) | `namespace-guard/font-specific-weights` | 1,417 pairs in 166 fonts | which font makes a pair most alike |
| [`LLM_CONFUSABLE_MAP`](#the-llm-map) | `namespace-guard` | 2,326 pairs | rewriting text before an LLM reads it |
| [`COMPOSABILITY_VECTORS`](#composability-vectors) | `namespace-guard` or `namespace-guard/composability-vectors` | 34 vectors | regression tests where NFKC and Unicode's list disagree |
| [`PROFANITY_WORDS_EN`](#the-profanity-list) | `namespace-guard/profanity-en` | 2,624 words | refusing offensive names |
| [`PROFANITY_ALLOWLIST_EN`](#the-profanity-list) | `namespace-guard/profanity-en` | 2,278 words | letting names and places that contain a listed word through |

The examples on this page run in your browser against `namespace-guard` and `namespace-guard/confusable-weights`. The font weights and the profanity list are separate imports that the page doesn't load, so their examples are shown with their values but don't run.

## The character maps

Each map takes a character to the Latin letters or digits it passes for, in lowercase: Cyrillic `а` to `a`, `m` to `rn`. They are built from Unicode's confusables.txt, Latin small capitals (`ᴀ` to `a`), and the lookalikes confusable-vision measured that Unicode doesn't list.

```ts run
Object.keys(CONFUSABLE_MAP_FULL).length;  // → 2216
Object.keys(CONFUSABLE_MAP).length;       // → 1018
CONFUSABLES_DATE;                         // → "2026-08-06, 01:05:35 GMT"

CONFUSABLE_MAP["а"];       // → "a" (Cyrillic а, U+0430)
CONFUSABLE_MAP["א"];       // → "x" (Hebrew alef, measured alike in Arial at 16 px)
CONFUSABLE_MAP_FULL["m"];  // → "rn"
CONFUSABLE_MAP_FULL["1"];  // → "l"
CONFUSABLE_MAP_FULL["ǁ"];  // → "ll"
CONFUSABLE_MAP_FULL["ſ"];  // → "f" (long s)
CONFUSABLE_MAP["ſ"];       // → undefined (NFKC has already made it s)
CONFUSABLE_MAP_CASED;      // → { I: "l" }
```

**`CONFUSABLE_MAP_FULL`** has everything: all of Unicode's mappings to Latin letters and digits, including multi-letter targets (`ǁ` to `ll`) and the ASCII entries (`1` and `|` to `l`, `0` to `o`, `m` to `rn`), and all three tiers of confusable-vision's measured lookalikes. Look a character up as typed, because case can matter: Greek capital `Η` is listed as `h`, small `η` isn't listed. It's the default map for `skeleton()`, `areConfusable()`, `confusableDistance()` and `checkRisk()`, and the right one when nothing runs NFKC before the comparison.

**`CONFUSABLE_MAP`** is for text that has been through NFKC, as every name the guard checks has, and for refusing a name because it contains a lookalike: `createHomoglyphValidator()` uses it. It leaves out the ASCII entries, the characters NFKC turns into ASCII letters or digits (`ſ` into `s`, fullwidth `ｏ` into `o`), and the broad and design tiers of the measured lookalikes that Unicode doesn't list, so an ordinary word is less likely to be refused.

**`CONFUSABLE_MAP_CASED`** holds the one ASCII capital Unicode maps to another letter: capital `I` as `l`. It only holds where case is kept, so it's separate. `skeleton()` uses it with `{ preserveCase: true }`, and `areConfusable()` checks both ways.

**`CONFUSABLES_DATE`** is the version of confusables.txt the maps were built from.

## Measured lookalikes

`MEASURED_CONFUSABLES` has confusable-vision's in-place measurements: each character found alike to an ASCII letter or digit when set between other letters in five common fonts at text size (the system font at 13 px; Helvetica, Arial, Times New Roman and Georgia at 16 px), with the platform's font fallback. For each, the letter it passes for, namespace-guard's prototype for that letter, a tier, and the fonts and sizes where it holds.

```ts run
Object.keys(MEASURED_CONFUSABLES).length;  // → 974
MEASURED_CONFUSABLES["1"];  // → { letter: "l", target: "l", tier: "strict", contexts: ["Times New Roman 16"] }
MEASURED_CONFUSABLES["א"];  // → { letter: "x", target: "x", tier: "strict", contexts: ["Arial 16"] }

const tiers = {};
for (const entry of Object.values(MEASURED_CONFUSABLES)) tiers[entry.tier] = (tiers[entry.tier] ?? 0) + 1;
tiers;  // → { strict: 569, broad: 319, design: 86 }
```

The tiers compare each character with confusables everyone accepts, such as `0` and `O` or `1` and `l`, in the same font:

| Tier | Means |
|---|---|
| `strict` | as alike as the median accepted confusable |
| `broad` | as alike as the least alike accepted confusable |
| `design` | alike to the letter as another common font draws it |

Use it to explain a result ("this `1` reads as `l` in Times New Roman at 16 px") or to set your own rule by tier.

## Visual weights

`CONFUSABLE_WEIGHTS`, from `namespace-guard/confusable-weights`, has 2,300 measured pairs from confusable-vision. Each pair was found alike at the size and baseline position two glyphs have in running text, within one font or across fonts (a rare-script character in its fallback font next to Latin in a common text font). Only pairs where one character is an ASCII letter or digit, or the two are in different scripts, are included.

```ts run
let pairs = 0;
let alikeAlmostEverywhere = 0;
for (const targets of Object.values(CONFUSABLE_WEIGHTS)) {
  for (const weight of Object.values(targets)) {
    pairs++;
    if (weight.danger > 0.7) alikeAlmostEverywhere++;
  }
}
Object.keys(CONFUSABLE_WEIGHTS).length;  // → 1380 (source characters)
pairs;                                   // → 2300
alikeAlmostEverywhere;                   // → 1079

CONFUSABLE_WEIGHTS["а"]["a"];  // → { danger: 0.8824, stableDanger: 0.8824, cost: 0.1176, xidContinue: true, idnaPvalid: true, tr39Allowed: true }
```

It's keyed by source character, then target. For each pair:

| Field | Means |
|---|---|
| `danger` | the share of text fonts, or of font combinations, where the pair is alike: 0 to 1 |
| `stableDanger` | the same share in this data; kept separate for weights from other sources |
| `cost` | `1 - stableDanger`: lower means more alike |
| `xidContinue` | the source character is allowed in identifiers (Unicode's XID_Continue) |
| `idnaPvalid` | the source character is allowed in domain names (IDNA 2008 PVALID) |
| `tr39Allowed` | the source character has Unicode's Identifier_Status Allowed |

Filter at `danger > 0.7` for the pairs that are alike almost everywhere. Pass the weights to `areConfusable()`, `confusableDistance()`, `detectCrossScriptRisk()` or `isDomainSpoof()` to count measured pairs, including pairs between two non-Latin scripts that no standard lists:

```ts run
// Hangul ㅣ and Han 丨: alike in every text font that draws both
areConfusable("ㅣ", "丨");                                  // → false
areConfusable("ㅣ", "丨", { weights: CONFUSABLE_WEIGHTS }); // → true
CONFUSABLE_WEIGHTS["ㅣ"]["丨"];                             // → undefined (the pair is listed one way)
CONFUSABLE_WEIGHTS["丨"]["ㅣ"].danger;                      // → 1
```

The weights are a separate import because most apps don't need them: the guard's checks use the character maps.

## Weights per font

`FONT_SPECIFIC_WEIGHTS`, from `namespace-guard/font-specific-weights`, has the pairs found alike within one font, for each of 166 fonts (macOS fonts and Roboto): 1,417 distinct pairs. Use it to say which font makes a lookalike most convincing, or to score for the font your app uses. Pairs found alike only across fonts have no single font, so they're only in `CONFUSABLE_WEIGHTS`.

```ts title="Font weights (values shown, not live)"
import { FONT_SPECIFIC_WEIGHTS } from "namespace-guard/font-specific-weights";

Object.keys(FONT_SPECIFIC_WEIGHTS).length;  // → 166
FONT_SPECIFIC_WEIGHTS["Arial"]["а"]["a"];   // → { danger: 1, stableDanger: 1, cost: 0, idnaPvalid: true }
FONT_SPECIFIC_WEIGHTS["Arial"]["l"]["I"];   // → { danger: 0.9102, stableDanger: 0.9102, cost: 0.0898, idnaPvalid: true }
```

Each font's entry is a `ConfusableWeights` table, so you can pass it wherever `CONFUSABLE_WEIGHTS` goes. It's the largest of the data files, about 830 KB minified, so import it where size doesn't matter, such as on a server.

## The LLM map

`LLM_CONFUSABLE_MAP` is what `canonicalise()`, `scan()` and `isClean()` use to rewrite text. It takes each character to one Latin letter or digit, with the measured score of the pair and where the mapping comes from: `tr39` for Unicode's list, `novel` for a pair confusable-vision found that Unicode doesn't list.

```ts run
LLM_CONFUSABLE_MAP_CHAR_COUNT;     // → 2219
LLM_CONFUSABLE_MAP_PAIR_COUNT;     // → 2326
LLM_CONFUSABLE_MAP_SOURCE_COUNTS;  // → { tr39: 2016, novel: 310 }

LLM_CONFUSABLE_MAP["а"];  // → [{ latin: "a", visualScore: 0.8824, source: "tr39", script: "Cyrillic", codepoint: "U+0430", widthRatio: 1, heightRatio: 1 }]
LLM_CONFUSABLE_MAP["Μ"][0].latin;  // → "m" (Greek capital mu; the other maps have rn)
LLM_CONFUSABLE_MAP["m"];           // → undefined
```

A character can have more than one entry: dotless `ı` is listed as `i` (from Unicode) and as `l` (measured). The map rewrites text rather than comparing names, so it leaves out Unicode's ASCII entries and targets of more than one letter, and reads the prototype `rn` as `m`. `widthRatio` and `heightRatio` give the character's width and height against the Latin letter's at natural size, or `null` where they weren't measured. `canonicalise()` skips a `novel` pair whose character is more than `maxSizeRatio` times wider or taller (3 by default), since the difference would show in running text.

## Composability vectors

These are the characters where Unicode's confusables.txt and NFKC normalisation disagree about which ASCII letter or digit a character is. Long s `ſ` looks like `f` to Unicode's list, and NFKC makes it `s`. If a pipeline runs NFKC first, the confusable entry never applies. The suite is for testing that a pipeline handles these.

```ts run
COMPOSABILITY_VECTOR_SUITE;   // → "nfkc-tr39-divergence-v2"
COMPOSABILITY_VECTORS_COUNT;  // → 34 on Unicode 16 or later, 31 before
COMPOSABILITY_VECTORS[0];     // → { char: "ſ", codePoint: "U+017F", tr39: "f", nfkc: "s" }
COMPOSABILITY_VECTORS === NFKC_TR39_DIVERGENCE_VECTORS;  // → true

// Derive them from any map; CONFUSABLE_MAP has none, since it is built for text after NFKC
deriveNfkcTr39DivergenceVectors(CONFUSABLE_MAP).length;  // → 0
```

The vectors are worked out when the library loads, from `CONFUSABLE_MAP_FULL` with the runtime's own NFKC. Three of the 34 (U+1CCDE, U+1CCF0 and U+1CCF1) were added in Unicode 16, so a runtime whose Unicode data is older has 31. `COMPOSABILITY_VECTORS`, `COMPOSABILITY_VECTORS_COUNT` and `COMPOSABILITY_VECTOR_SUITE` are exported from the root and from `namespace-guard/composability-vectors`; `NFKC_TR39_DIVERGENCE_VECTORS` is the same array under its older name. The repository also has them as JSON, in [docs/data/composability-vectors.json](../docs/data/composability-vectors.json).

## The profanity list

`namespace-guard/profanity-en` has a curated English list and a validator that uses it. The list comes from [profane-words](https://github.com/zautumnz/profane-words), under the WTFPL.

```ts title="Profanity list (values shown, not live)"
import {
  createEnglishProfanityValidator,
  PROFANITY_WORDS_EN,
  PROFANITY_ALLOWLIST_EN,
  PROFANITY_WORDS_EN_COUNT,
  PROFANITY_WORDS_EN_SOURCE,
  PROFANITY_WORDS_EN_LICENSE,
} from "namespace-guard/profanity-en";

PROFANITY_WORDS_EN_COUNT;    // → 2624
PROFANITY_ALLOWLIST_EN.length; // → 2278
PROFANITY_WORDS_EN_LICENSE;  // → "WTFPL"
PROFANITY_WORDS_EN_SOURCE;   // → "https://github.com/zautumnz/profane-words/blob/master/words.json"

const validator = createEnglishProfanityValidator({ mode: "evasion" });
```

`createEnglishProfanityValidator(options)` is `createProfanityValidator(PROFANITY_WORDS_EN, options)` with `PROFANITY_ALLOWLIST_EN` added to `options.allowlist`: names, places and common words that contain a listed word, such as `scunthorpe` and `dickson`. It's a separate import so the core doesn't carry the list. [Moderation](moderation.md) covers the options.

## Latin letters built on ASCII

`canonicalise()` also uses two tables of Latin letters, generated from the Unicode Character Database: letters built on an ASCII letter, which it folds to that letter (`ŧ` to `t`, `İ` to `I`), and letters not in modern use, which mark a word as tampered with. They are internal and not exported. See [LLM text](llm-text.md).

## Licences

namespace-guard's code is under the MIT licence. The data keeps its own:

| Data | Licence |
|---|---|
| Unicode's mappings, in the character maps and the Unicode entries of `LLM_CONFUSABLE_MAP` | Unicode License v3 |
| confusable-vision's measurements: `MEASURED_CONFUSABLES`, the measured entries of the character maps, `CONFUSABLE_WEIGHTS`, `FONT_SPECIFIC_WEIGHTS`, the scores and `novel` entries of `LLM_CONFUSABLE_MAP` | CC BY 4.0, attribution: Paul Wood FRSA (@paultendo), confusable-vision |
| `PROFANITY_WORDS_EN` | WTFPL |

If you copy the data out of the package, keep the attribution. [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) has the notices.
