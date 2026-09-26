# Third-party notices

namespace-guard includes data derived from third-party sources. The
namespace-guard source code is MIT-licensed (see `LICENSE`). The
embedded data retains its original licence as noted below.

---

## Unicode confusables.txt

**Used by:** `CONFUSABLE_MAP`, `CONFUSABLE_MAP_FULL`, `skeleton()`,
`areConfusable()` (in `src/index.ts`)

**Source:** https://unicode.org/Public/security/latest/confusables.txt

**Licence:** Unicode License v3
https://www.unicode.org/terms_of_use.html

> Copyright 1991-Present Unicode, Inc. All rights reserved.

Regenerate: `npx tsx scripts/generate-confusables.ts`

---

## Unicode Character Database (UnicodeData.txt, Scripts.txt, IdentifierType.txt)

**Used by:** `LATIN_FOLD` and `LATIN_NOT_IN_MODERN_USE` (in `src/latin-fold.ts`),
used by `canonicalise()`, `scan()` and `isClean()`

**Source:** https://www.unicode.org/Public/UCD/latest/ucd/ and
https://www.unicode.org/Public/security/latest/IdentifierType.txt (UCD 17.0.0; IdentifierType 16.0.0)

**Licence:** Unicode License v3
https://www.unicode.org/terms_of_use.html

> Copyright 1991-Present Unicode, Inc. All rights reserved.

Regenerate: `npm run build:latin-fold`

---

## confusable-vision visual similarity data

**Used by:** `CONFUSABLE_WEIGHTS` (in `src/confusable-weights.ts`),
`FONT_SPECIFIC_WEIGHTS` (in `src/font-specific-weights.ts`), the `visualScore`
and `novel` entries of `LLM_CONFUSABLE_MAP` (in `src/llm-confusable-map.ts`),
`MEASURED_CONFUSABLES` and the measured entries of `CONFUSABLE_MAP` and
`CONFUSABLE_MAP_FULL` (in `src/confusable-maps.ts`)

**Source:** https://github.com/paultendo/confusable-vision, release 2026.09.26

**Licence:** CC-BY-4.0
https://creativecommons.org/licenses/by/4.0/

**Attribution:** Paul Wood FRSA (@paultendo), confusable-vision.
Visual similarity weights for 2,300 character pairs (confusable-weights-v4.json),
1,417 font-specific pairs in 166 fonts, and the in-place checks of lookalikes of
ASCII letters and digits, from release 2026.09.26, measured with RaySpace.

Regenerate: `node scripts/generate-confusable-weights.js`,
`node scripts/generate-font-specific-weights.js` and
`npx tsx scripts/generate-confusables.ts`

---

## profane-words (English profanity list)

**Used by:** `PROFANITY_WORDS_EN` (in `src/profanity-en.ts`)

**Source:** https://github.com/zautumnz/profane-words

**Licence:** WTFPL v2

See `docs/data/profanity-words.SOURCE.md` for curation notes.

Regenerate: `node scripts/generate-profanity-global.js`

---

## Names and places in the English allowlist

**Used by:** `PROFANITY_ALLOWLIST_EN` (in `src/profanity-en.ts`) and
`docs/data/profanity-allowlist.json`: names, places and common words that contain
a word on the English list, which `createEnglishProfanityValidator()` lets through.
The allowlist is a selection of words from these sources, screened for slurs and
crude words; see `docs/data/profanity-words.SOURCE.md`.

**GeoNames** (`GB.txt`, populated places and administrative areas; `cities1000.txt`)
https://download.geonames.org/export/dump/

**Licence:** CC BY 4.0
https://creativecommons.org/licenses/by/4.0/

**Attribution:** Place names from GeoNames (https://www.geonames.org/), licensed
under CC BY 4.0.

**ONS baby names** ("Baby names in England and Wales: from 1996", 1996 to 2025)
https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/datasets/babynamesinenglandandwalesfrom1996

**Licence:** Open Government Licence v3.0
https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/

**Attribution:** Contains public sector information licensed under the Open
Government Licence v3.0.

**US Census Bureau 2010 surnames** (`Names_2010Census.csv`)
https://www2.census.gov/topics/genealogy/2010surnames/names.zip

**Licence:** public domain (a work of the US federal government).

**Webster's Second New International Dictionary (1934)**, as
`/usr/share/dict/words`: public domain.

No Apple data and no wordfreq data ship with namespace-guard. The core's
`PROFANITY_COMMON_INSIDE_WORDS` (in `src/index.ts`) holds only letter sequences
taken from the English list's own entries; they were chosen by measuring those
entries against `/usr/share/dict/words` and wordfreq's word frequencies.

Regenerate: `npm run build && node scripts/measure-profanity.mjs --write`, then
`npm run build:profanity-data`. The source files go in `.cache/open-names/`.
