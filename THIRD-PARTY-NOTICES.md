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

## confusable-vision visual similarity data

**Used by:** `CONFUSABLE_WEIGHTS` (in `src/confusable-weights.ts`)

**Source:** https://github.com/paultendo/confusable-vision

**Licence:** CC-BY-4.0
https://creativecommons.org/licenses/by/4.0/

**Attribution:** Paul Wood FRSA (@paultendo), confusable-vision.
903 pairs scored via SSIM across 230 macOS system fonts.

Regenerate: `node scripts/generate-confusable-weights.js`

---

## profane-words (English profanity list)

**Used by:** `PROFANITY_WORDS_EN` (in `src/profanity-en.ts`)

**Source:** https://github.com/zautumnz/profane-words

**Licence:** WTFPL v2

See `docs/data/profanity-words.SOURCE.md` for curation notes.

Regenerate: `node scripts/generate-profanity-global.js`
