# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## 0.23.0 - 2026-09-27

This release changes what counts as a lookalike. Skeletons change, so recompute any you have stored.

### Changed
- The character maps are built from Unicode's latest confusables.txt (2026-08-06) and from confusable-vision's
  in-place measurements, in a new file, `src/confusable-maps.ts`. `CONFUSABLE_MAP_FULL` has 2,216 entries (was
  1,425) and `CONFUSABLE_MAP` 1,018 (was 613).
- Unicode's ASCII entries are used: 1 and | as l, 0 as o, m as rn. `skeleton("paypa1")` equals
  `skeleton("paypal")`, and `skeleton("microsoft")` is `"rnicrosoft"`, as is `skeleton("rnicrosoft")`. Earlier versions
  dropped these, so `areConfusable("rnicrosoft", "microsoft")` was false.
- Multi-letter targets are kept: ǁ as ll, Ⅱ as ll, ǉ as lj. `confusableDistance()` treats one character standing for
  two (m for rn) as a lookalike substitution, not an edit.
- Characters are looked up as typed, before lowercasing. A capital and its lowercase form can look like different
  letters: Greek Η looks like H, η does not look like h. Lowercasing first hid lookalike capitals such as Cherokee Ꭱ
  (R), which lowercases to ꭱ. `checkRisk()` and `confusableDistance()` now look characters up as typed, and validators
  receive the identifier as typed as a second argument, which `createHomoglyphValidator()` also checks.
- Names still compare without case: `skeleton("ADMIN")` equals `skeleton("admin")`. Unicode's capital I as l is kept
  apart, in `CONFUSABLE_MAP_CASED`. `areConfusable()` checks both ways, so `"paypaI"` (capital I) matches `"paypal"`:
  on a site that stores names in lowercase but shows them as typed, paypaI is a different name that looks the same.
- `checkRisk()` blocks only when a name looks like a protected one: its skeleton collides (with or without case), or
  it differs only by lookalikes, as `paypa1` and `paypaI` do from `paypal` (both 100), or it has lookalike, invisible
  or mixed-script characters. One letter changed, added, dropped or swapped that is not a lookalike warns at most
  (`paypax` scores 69, one under the block threshold, where it scored 83), and a protected word with letters added or
  dropped at an end is not matched, so `helper`, `admins` and `setting` are allowed where 0.22.0 blocked them.
- A reserved name that is not also in `protect` is matched by lookalikes only, not by a one-letter typo: with `help`
  reserved, `hell` is allowed and `hеlp` (Cyrillic е) blocks.
- `checkRisk()` looks for characters where NFKC and TR39 disagree (ſ, which NFKC stores as s and Unicode lists as f)
  in the name as typed; before, it looked after NFKC had rewritten them, so the signal never fired. Such a character is
  not a lookalike in the stored name, so it cannot take a close spelling to a block: `microsoſt` (stored `microsost`)
  warns at 69, where it scored 89.
- `skeleton()`, `areConfusable()` and `confusableDistance()` use the map's entries for the 20 characters that NFD
  splits before lookup (í, ḋ, Ά, ἰ, וֹ). Before, each became a letter and a mark that counted as a difference, so
  `areConfusable("aḋmín", "admin")` and `areConfusable("mícrosoft", "microsoft")` were false; both are now true.
  `checkRisk()` also puts back ŀ, which NFKC stores as l and a middle dot.
- The CLI's `calibrate` and `recommend` sweep thresholds as `checkRisk()` applies them: a name that cannot block (a
  close spelling) never counts as a block at any threshold, and the warn threshold is always below the block
  threshold. `namespace-guard risk` scores the name as typed, so `risk paypaI --protect paypal` blocks.
- 394 characters Unicode does not map come from confusable-vision: set between neighbours in five common fonts at text
  size, and as alike there as accepted confusables such as 0/O and 1/l. Hebrew א, found alike to x in Arial at 16 px,
  is one. `CONFUSABLE_MAP`, which the homoglyph validator uses to reject a name for containing a lookalike, takes only
  the strict tier of these; the broad and design tiers count when two names are compared.
- The composability suite is now `nfkc-tr39-divergence-v2`, with 34 vectors (was 31): the new confusables.txt adds ₀,
  ０ and １, which NFKC reads as digits and Unicode's list as o and l. The CI drift budget moves to 34 action flips.
  The vectors are derived with the runtime's NFKC, and three of them (U+1CCDE, U+1CCF0, U+1CCF1) are Unicode 16
  characters, so a runtime whose Unicode is older derives 31.
- Profanity matching folds with single letters only (m stays m), so it matches as before.
- All confusable-vision data now comes from release 2026.09.26, which compares every letter and digit each of 322
  fonts draws (release 2 compared only part of that): `CONFUSABLE_WEIGHTS` has 2,300 pairs (was 322),
  `FONT_SPECIFIC_WEIGHTS` 1,417 pairs in 166 fonts (was 130 in 106), and `LLM_CONFUSABLE_MAP` 2,326 pairs. The weights
  keep pairs where one character is an ASCII letter or digit or the two are in different scripts; the release's
  same-script pairs (Hangul jamo variants, Arabic positional forms) are left out. Some release 2 pairs are gone with the
  correct font faces: Hangul ᅵ and Han 丨 are alike in 1 of 6 text fonts, not all (Hangul ㅣ and 丨 are alike in all).
- `LLM_CONFUSABLE_MAP` rewrites a character as one letter: it leaves out Unicode's ASCII entries and multi-letter
  targets, and reads the prototype rn as m.
- `canonicalise()` rewrites a word in full when it shows a sign of tampering: it mixes Latin with another script, has a
  Latin letter not in modern use (ɦ, ꞡ, ꝱ, by Unicode's Identifier_Type) or a fullwidth or mathematical letter, has a
  non-ASCII capital inside a lowercase word, or has a listed lookalike scoring at least `threshold`. In such a word
  every listed lookalike is replaced whatever its score, and a letter built on a Latin letter (ŧ, İ, ɏ) is folded to
  it, in the case of the word around it. Before, it replaced only lookalikes scoring 0.7 or more and had no entry for
  ŧ or İ, so it undid little of a flooded document: on the Denial of Spend test contract, 0.22.0 left 1,485 of 1,532
  lookalikes. Now `strategy: "all"` restores that contract byte for byte and the default leaves 9 short words. Words
  with no sign of tampering (Turkish İstanbul, Russian Москва) are left alone as before; `strategy: "all"` folds ŧ, İ
  and ö too. A `threshold` you set is also a floor, as before. This goes back on 0.22.0's choice to leave Cyrillic п
  in a Latin word: п doesn't pass for n at text size, but mixed into a Latin word it still costs tokens and hides the
  word from search, so canonicalise() now rewrites it there.
- `isClean()` is `true` exactly when `canonicalise()` with the same options changes nothing, and `scan()` reports every
  rewrite; a letter folded to its base letter has `source: "fold"`.
- The homepage playground kept its own copy of the maps, weights and scoring, and its weights were still the March 2026
  measurements. It now runs the built library (`docs/lib/`, from `npm run build:docs-lib`), so it shows what this
  release does. `docs/data/confusable-weights.global.js` is regenerated from release 2026.09.26 for anyone loading it
  directly, and a pair found both within one font and across fonts keeps the stronger score.

### Added
- `MEASURED_CONFUSABLES`: each measured lookalike's letter, tier (strict, broad or design) and the fonts and sizes where
  it holds, such as 1 as l in Times New Roman at 16 px.
- `CONFUSABLES_DATE`: the confusables.txt version the maps come from.
- `preserveCase` option for `skeleton()`: look characters up with their case, for names shown as typed.
- `leetspeak` risk option (in `risk` config, `checkRisk()` and `enforceRisk()`; `--leetspeak` in the CLI), off by
  default: leetspeak swaps count as lookalikes, so `p4ypal`, `adm1n` and `4dm1n` block. It uses the profanity
  matcher's aggressive table (4 for a, 1 for i or l, 5 or $ for s, 8 for b, 9 or 6 for g). Without it they warn at
  most, and `attack-gen --mode evasion` counts them as bypasses.
- `RiskMatch.evidence` (`exact`, `lookalike`, `lookalike-extension` or `typo`) and `RiskCheckResult.canBlock`, false
  when nothing in the name is visual and the score is held below the block threshold.
- `src/latin-fold.ts` (generated by `npm run build:latin-fold` from the Unicode Character Database): 797 Latin letters
  built on an ASCII letter, and the 817 Latin letters not in modern use, for `canonicalise()`.
- `allowlist` option for `createProfanityValidator()`: words that contain a listed word but are fine, such as names
  and places. A listed word found only inside one doesn't count, so `allowlist: ["scunthorpe"]` lets `scunthorpe-fc`
  through and still refuses `xcuntx`; an entry written with separators (`chorlton-cum-hardy`) lets through only that exact
  name. `PROFANITY_ALLOWLIST_EN` in `namespace-guard/profanity-en` is the English
  list's, which `createEnglishProfanityValidator()` uses.
- `scripts/measure-profanity.mjs` derives the English allowlist from openly licensed data (ONS baby names, US census
  surnames, GeoNames places, Webster's dictionary; see THIRD-PARTY-NOTICES.md), screening out names, places and words
  that look like a slur or read as crude.

### Fixed
- Adapters selected a column named after `scopeKey`, although the guard compares the scope's value with the id: with
  scope keys such as `userId` and `orgId`, which two tables sharing a namespace need, the query asked for a column
  that doesn't exist. They now select only the id column.
- The Mongoose adapter looks up `_id` when `idColumn` isn't set, but the guard read `id`, so nobody could keep their
  own name. It now returns `_id` as `id` too.
- With `cache` on, a lookup that failed was cached for the whole `ttl`, so the same error came back until it expired.
  Failed lookups are no longer kept.
- With `caseInsensitive` on, the Drizzle, Kysely, TypeORM and MikroORM adapters passed `_` and `%` to ILIKE as
  wildcards. They're escaped now; this matters only if your pattern allows them.
- `org-slug` and `developer-id` refused long names with "Use 2-30 lowercase letters…", though they allow 40 and 50.
  Each profile now has its own message.
- `isLikelyUniqueViolationError()` counted any SQLite constraint failure, NOT NULL and CHECK included, as a taken name.
  It now needs a unique one.
- `assertAvailable()` looked up suggestions and threw them away; it no longer looks them up.
- Validators run on suggestions now get the candidate as typed, as they do in `check()`.
- `LlmConfusableMapEntry` is exported.
- With default settings the English profanity list refused 18,974 of the 234,456 words in /usr/share/dict/words, 3,327
  of 38,970 first names given in England and Wales since 1996, 9,047 of 162,254 US surnames and 4,290 of 43,818 UK place
  names (`hello`, `class`, `grape`, `wang`, `scunthorpe`); it now refuses 890, 11, 259 and 62, and still refuses all
  of its words' leetspeak, lookalike, separated and repeated-letter disguises in the tests (`5h1t`, `ѕhit`, `s-h-i-t`)
  and `shitposter`. The matcher reads symbols in an entry as letters (`sh!+` was looked for as `sh`), counts letters
  rather than spaces for `minSubstringLength`, matches short and spaced entries and 122 letter sequences common inside
  English words (`anal`, `rape`) only as whole words, and reads a tripled letter as a repeat; the list drops 78 entries
  that are names or places (`wang`, `pula`) and allows 2,278 names, places and words that contain a listed word
  (`scunthorpe`, `dickson`), leaving out those that look like a slur or read as crude (`niggli`, `bitchfield`).
- Reserved names are normalised like any name, so `Admin` in the list reserves `admin`; before, the list was compared as
  written and `Admin` matched nothing.
- The CLI exited before a pipe had read all its output, so `--json` output over 64 KB was cut short. It now sets the
  exit code and lets the output finish.
- `areConfusable()` with `weights` returned `true` when any character of one string and any of the other were a
  measured pair, so `areConfusable("Iowa", "lima", { weights: CONFUSABLE_WEIGHTS })` was `true`. It now lines the two up
  character by character: each position must share a skeleton or be a measured pair, with m standing for rn as before.
- `context: "identifier"` or `"domain"` checked only the character a weight is listed under, so a pair found the other
  way round took that character's flags: `areConfusable("ㅣ", "丨", { weights, context: "domain" })` was `true` though
  Hangul ㅣ can't appear in a domain name. Both characters must now be allowed in the context.
- The CLI's `calibrate` and `recommend` broke ties towards the highest thresholds, so on data where every attack scores
  100 they suggested blocking only at 100. Among thresholds that cost the same they now take the middle of the range,
  warn first and then block above it.
- `drift` listed each built-in row's target twice (`targets [o,o]`); a target named in both `target` and `protect` is
  listed once.
- Every CLI command printed the same help. `namespace-guard <command> --help` and `namespace-guard help <command>` now
  print that command's usage, options and examples.

### Measured against 0.22
On confusable-vision's in-place measurements (3,048 candidate pairs, each set in a word), `areConfusable()` now catches
98% of the strict-tier lookalikes (0.22: 48%), 96% of the broad tier (40%) and 96% of the design tier (32%). Of the
pairs measured as not alike, it flags 29% (18%): nearly all of the difference is Unicode's own entries, such as
fullwidth digits, which NFKC folds anyway.

## [0.22.0] - 2026-09-24

### Changed
- `FONT_SPECIFIC_WEIGHTS` now comes from confusable-vision release 2026.09.24: 130 pairs across 106 fonts, each
  scored by how close it is in that font (1 identical, 0 at the alike threshold). The previous file dated from the
  February SSIM measurements, which were blind to size.
- `LLM_CONFUSABLE_MAP` is rebuilt from the release 2 weights (1,425 TR39 + 166 novel entries). Pairs release 2 finds
  unlike at running-text size, such as Cyrillic п and Latin n, are no longer rewritten.

### Fixed
- `CONFUSABLE_WEIGHTS` kept the weaker score for the 50 pairs found alike both within one font and across fonts
  (Tamil zero ௦ and o shipped at 0.41 instead of 1). It now keeps the stronger, and ships 322 distinct pairs; the
  0.21.0 note's 372 counted both findings.

## [0.21.0] - 2026-09-24

### Changed
- `CONFUSABLE_WEIGHTS` now comes from confusable-vision release 2026.09.24 (372 pairs). The 0.20.0 weights measured
  glyphs without their size or baseline, so they flagged pairs readers tell apart (c/o, D/O and case pairs), and they
  had dropped the earlier same-script pairs (Latin small capitals, dotless ı and others). Each bundled pair was found
  alike at the size and baseline position the two glyphs have in running text, within one font or across fonts; the
  weights are now the share of text fonts (or font combinations) where it holds.
- `isDomainSpoof()`: a pair TR39 maps keeps a similarity of at least 0.5, so a measurement that finds it alike in only
  some fonts does not undo Unicode's own mapping.

### Added
- `ignoreDiacritics` option for `skeleton()` and `areConfusable()`: removes combining diacritical marks before
  comparing, so `ạ` matches `a` and `ẹ` matches `e`. Off by default, as TR39 keeps them.

## [0.20.0] - 2026-03-02

### Added
- `isDomainSpoof(label, target, options?)` checks whether a domain label is a registrable lookalike of a target label.
  It flags only labels written in one script (digits and hyphens aside), since registrars reject mixed-script labels,
  and only when every character that differs from the target is a confusable of the target's character at the same
  position.
- `isDomainSpoof()` returns a `DomainSpoofResult` with `spoof` and, when the label matches, `script`, `danger` (the
  average similarity of the substitutions) and `substitutions` (`DomainSpoofSubstitution`). Options
  (`DomainSpoofOptions`): `map` (default `CONFUSABLE_MAP_FULL`), `weights`, `minDanger` (default `0.5`) and
  `allowlist` for known non-Latin labels.

### Changed
- Breaking: `ssimScore` is renamed `visualScore` on `ScanFinding` and on `LLM_CONFUSABLE_MAP` entries
  (`LlmConfusableMapEntry`), and `ssim` is renamed `visualScore` on `CrossScriptRiskResult.crossScriptPairs`. The
  scores in `LLM_CONFUSABLE_MAP` are unchanged.
- `CONFUSABLE_WEIGHTS` now comes from confusable-vision's second weights file: 4,174 pairs measured across 245 fonts by
  raycasting glyph outlines (RaySpace), in place of 1,397 pairs scored by SSIM across 230 fonts. 3,525 of the pairs
  are between two non-Latin scripts, every pair has a `danger` of at least 0.5, and 1,292 of the earlier pairs are no
  longer included.
- Pairs between two non-Latin scripts in `CONFUSABLE_WEIGHTS` now carry `xidContinue` and `idnaPvalid` flags. In 0.18
  and 0.19 they had neither, so `context: "identifier"` and `context: "domain"` left them out.
- README, reference and playground describe the RaySpace measurement and `isDomainSpoof()`.

## [0.19.1] - 2026-02-28

### Changed
- Documentation only: the README's opening line links to the Denial of Spend write-up.

## [0.19.0] - 2026-02-28

### Added
- `namespace-guard/font-specific-weights` subpath export with `FONT_SPECIFIC_WEIGHTS`: a `ConfusableWeights` map for
  each of 74 macOS system fonts, keyed by font name, holding only the pairs that score 0.7 or more by SSIM in that
  font (6 to 264 pairs per font). A font's map can be passed as `weights` in place of `CONFUSABLE_WEIGHTS`.

### Changed
- README describes the PRI #540 findings as submitted to Unicode public review, with a link to the published
  feedback, rather than as accepted.

## [0.18.0] - 2026-02-27

### Added
- `detectCrossScriptRisk(identifier, options?)` and `CrossScriptRiskResult`: lists the scripts in an identifier and,
  given `weights`, the pairs of characters from different scripts that have a measured weight. `riskLevel` is
  `"none"`, `"low"`, or `"high"` when a pair scores 0.8 or more or there are three or more pairs.
- `weights` and `context` options for `areConfusable()` (`AreConfusableOptions`). With `weights`, two strings also
  count as confusable when a character in one has a measured weight against a character in the other. Without
  `weights` it compares skeletons only, as before.

### Changed
- `CONFUSABLE_WEIGHTS` has 1,397 pairs (was 903). The 494 new pairs are between characters of different scripts, most
  of them between two non-Latin scripts such as Cyrillic and Greek or Han and Hangul.
- Hangul, Georgian and Thai are now told apart from each other and from other unlisted scripts, which changes when
  `confusableDistance()` treats a substitution as cross-script.
- `canonicalise()`, `scan()` and `isClean()` return early for ASCII text and for text with no character in
  `LLM_CONFUSABLE_MAP`.
- Package description, README and reference docs lead with cross-script detection and Denial of Spend (the extra
  token cost of confusable characters in LLM input).

## [0.17.1] - 2026-02-26

### Added
- `maxSizeRatio` option for `canonicalise()`, `scan()` and `isClean()` (default `3.0`). A novel pair is skipped when
  the source character is more than this many times wider or taller than its Latin target. TR39 pairs and pairs
  without measured ratios are not affected; `Infinity` turns the check off.
- `widthRatio` and `heightRatio` on `LLM_CONFUSABLE_MAP` entries (`LlmConfusableMapEntry`), from confusable-vision's
  size measurements. 2,133 of the 2,218 pairs are measured; the rest are `null`.

## [0.17.0] - 2026-02-26

### Added
- LLM preprocessing APIs:
  - `canonicalise(text, options?)`
  - `scan(text, options?)`
  - `isClean(text, options?)`
- Exported LLM preprocessing types:
  - `CanonicaliseOptions`
  - `ScanOptions`
  - `ScanFinding`
  - `ScanResult`
- Generated static lookup dataset for preprocessing:
  - `src/llm-confusable-map.ts` (`LLM_CONFUSABLE_MAP` + metadata/count exports)
  - `scripts/generate-llm-confusable-map.js`
  - `build:llm-confusable-map` npm script
- Test coverage for LLM preprocessing behavior and performance sanity:
  - `tests/llm-preprocessing.test.ts`

### Changed
- README now includes a dedicated "LLM Pipeline Preprocessing" section with usage and pipeline diagram
- Reference docs now document LLM preprocessing behavior/options and API contracts
- Playground now surfaces LLM preprocessing in "What It Does" and "Advanced API primitives"

## [0.16.1] - 2026-02-25

### Changed
- Documentation only: README and reference docs cover the `weights` and `context` options of `confusableDistance()`
  and the `namespace-guard/confusable-weights` subpath, and the playground can score with the measured weights
  (built by the new `build:weights-global` script).

## [0.16.0] - 2026-02-25

### Added
- `ConfusableWeight` and `ConfusableWeights` types for measured visual similarity data
- `weights` option in `ConfusableDistanceOptions` to use measured SSIM-based costs instead of hardcoded 0.35
- `context` option in `ConfusableDistanceOptions` for deployment-specific filtering (`'identifier'`, `'domain'`, `'all'`)
- `"visual-weight"` reason in `ConfusableDistanceStep` for novel pairs recognized via the weight graph
- `namespace-guard/confusable-weights` subpath export with 903 scored pairs (110 TR39 + 793 novel discoveries from confusable-vision)
- `scripts/generate-confusable-weights.js` to regenerate weights data from confusable-vision output

### Changed
- `buildSubstitutionStep` uses measured cost from weights when available (falls back to hardcoded 0.35 when not)
- Novel confusable pairs not in TR39 map can now be recognized via the weight graph instead of defaulting to cost 1

## [0.15.1] - 2026-02-25

### Added
- `CODE_OF_CONDUCT.md` using Contributor Covenant v2.1
- Concise `CONTRIBUTING.md` with practical contribution guidance
- Contributor sign-off line in `CONTRIBUTING.md`

### Changed
- Release bump to `0.15.1`

## [0.15.0] - 2026-02-25

### Added
- Composability suite aliases:
  - `COMPOSABILITY_VECTOR_SUITE`
  - `COMPOSABILITY_VECTORS`
  - `COMPOSABILITY_VECTORS_COUNT`
- `namespace-guard/composability-vectors` export subpath
- `createInvisibleCharacterValidator()` and `InvisibleCharacterValidatorOptions`, including opt-in `rejectCombiningMarks`
- Reproducible composability artifact pipeline:
  - `scripts/generate-composability-vectors.js`
  - `docs/data/composability-vectors.json`
  - `docs/data/composability-vectors.SOURCE.md`
- Reproducible confusable benchmark corpus:
  - `scripts/generate-confusable-bench.js`
  - `docs/data/confusable-bench.v1.json`
  - `docs/data/confusable-bench.v1.SOURCE.md`
- Dataset integrity tests:
  - `tests/composability-vectors.test.ts`
  - `tests/confusable-bench.test.ts`

### Changed
- CLI drift/recommend built-in baseline dataset label from `builtin:nfkc-tr39-divergence-vectors` to `builtin:composability-vectors`
- `tsup` entrypoints now include `src/composability-vectors.ts`
- Added build scripts:
  - `build:composability-data`
  - `build:confusable-bench`
- Documentation refresh across:
  - `README.md`
  - `docs/reference.md`
  - `docs/index.html` (playground/workflow/research/advanced API sections)

## 0.14.0 - 2026-02-25

Not published to npm; these changes first shipped in 0.15.0.

### Added
- `guard.claim(identifier, write, options?)` for race-safe claim/write workflows
- `isLikelyUniqueViolationError(error)` helper for duplicate-key detection across common stacks
- CLI `audit-canonical` command for preflight canonical collision/mismatch analysis on exported datasets

### Changed
- README now includes per-adapter canonical uniqueness migration guidance and operational rollout notes
- Playground/docs workflow sections updated for calibration/recommendation/drift operations and moderation coverage

## 0.13.0 - 2026-02-25

Not published to npm; these changes first shipped in 0.15.0.

### Added
- Curated profanity subpath export: `namespace-guard/profanity-en`
- `createEnglishProfanityValidator()` helper
- `PROFANITY_WORDS_EN`, `PROFANITY_WORDS_EN_COUNT`, `PROFANITY_WORDS_EN_SOURCE`, `PROFANITY_WORDS_EN_LICENSE` exports
- Profanity dataset provenance docs and generated preload asset:
  - `docs/data/profanity-words.SOURCE.md`
  - `docs/data/profanity-words.global.js`
  - `scripts/generate-profanity-global.js`

### Changed
- Zero-dependency moderation story now supports:
  - curated built-in English list via subpath
  - bring-your-own predicate validator path
- Release bump to `0.13.0`

## 0.12.0 - 2026-02-24

Not published to npm; these changes first shipped in 0.15.0.

### Added
- CLI `recommend` command that combines calibration + drift baseline analysis and outputs ready-to-paste risk/CI guidance
- CI drift gate tooling:
  - `scripts/drift-gate.js`
  - GitHub Actions workflow `.github/workflows/drift-gate.yml`
- `ci:drift-gate` npm script

### Changed
- Release bump to `0.12.0`

## [0.11.1] - 2026-02-23

### Added
- Additional tests in `tests/index.test.ts`
- Expanded npm package keywords/topics metadata

## [0.11.0] - 2026-02-22

### Added
- `validateFormatOnly()` method: validates format and purely-numeric restriction without checking reserved names or querying the database, for instant client-side feedback
- `CheckManyOptions` exported type: `checkMany()` now accepts `{ skipSuggestions?: boolean }` (default: `true`) to opt in to suggestions per batch call

### Changed
- Removed unnecessary type casts in config message parsing
- Expanded API reference in README for `validateFormat`, `clearCache`, `cacheStats`, `normalize`
- Drizzle adapter docs now note `db.query` (relational query API) requirement
- Raw SQL adapter docs now include MySQL2 and better-sqlite3 wrapper examples

## [0.10.0] - 2026-02-22

### Added
- `skeleton()` function: TR39 Section 4 skeleton algorithm (NFD + ignorable removal + confusable map + NFD) for confusable string comparison - the same algorithm used by ICU SpoofChecker, Chromium, and the Rust compiler
- `areConfusable()` function: returns true if two strings produce the same skeleton
- `SkeletonOptions` exported type for configuring the confusable map used by `skeleton()` and `areConfusable()`

## 0.9.0 - 2026-02-22

Not published to npm; these changes first shipped in 0.10.0.

### Added
- `CONFUSABLE_MAP_FULL` export: complete TR39 confusable mapping (~1,400 entries) with no NFKC filtering, for use in pipelines that don't run NFKC normalization before confusable detection (TR39 skeleton uses NFD, Chromium uses NFD, Rust uses NFC, django-registration uses no normalization)
- `scripts/generate-confusables.ts` now outputs both `CONFUSABLE_MAP` (NFKC-filtered, 613 entries) and `CONFUSABLE_MAP_FULL` (unfiltered, ~1,400 entries)

## [0.8.2] - 2026-02-22

### Fixed
- Escape regex metacharacters (`\`, `]`, `^`, `-`) when building the confusable character class in `createHomoglyphValidator` - prevents regex breakage if `additionalMappings` contain these characters
- Same fix applied to the playground's inline validator
- CLI: guard against undefined `Pool` export from `pg` module
- Raw SQL adapter: validate table/column identifiers against `[a-zA-Z_][a-zA-Z0-9_]*` to prevent SQL injection via malformed config

### Added
- `cache.maxSize` option to configure maximum cached entries before LRU eviction (default: 1000)

### Changed
- `scramble` strategy no longer skips identical adjacent character swaps (dedup Set already handles duplicates)
- `similar` strategy JSDoc now documents QWERTY keyboard layout assumption

## [0.8.1] - 2026-02-20

### Fixed
- Removed 31 NFKC-conflict entries from `CONFUSABLE_MAP` (644 → 613 pairs) - these encoded wrong mappings in any pipeline that runs NFKC normalization first (e.g., Long S `ſ` mapped to `f` by TR39 but correctly to `s` by NFKC; Mathematical Bold I `𝐈` mapped to `l` by TR39 but correctly to `i` by NFKC)
- `scripts/generate-confusables.ts` now automatically detects and excludes NFKC-conflict entries

### Changed
- Expanded `rejectMixedScript` regex from 7 script ranges to 19+ (added Hebrew, Arabic, Indic, Thai, Myanmar, Ethiopic, Runic, Khmer, Coptic, Tifinagh, Lisu, Bamum)
- README now documents the three-stage anti-spoofing pipeline and NFKC-aware filtering rationale
- Playground now includes an anti-spoofing pipeline explainer section

## 0.8.0 - 2026-02-20

Not published to npm; these changes first shipped in 0.8.1.

### Added
- Full Unicode TR39 confusables.txt coverage - `CONFUSABLE_MAP` now contains 613 character pairs (up from 30), covering Cyrillic, Greek, Armenian, Cherokee, IPA, Coptic, Lisu, Canadian Syllabics, Georgian, Latin small capitals, and 20+ other scripts
- `scripts/generate-confusables.ts` - reproducible build script that downloads the official Unicode confusables.txt, filters to Latin-target single-character mappings, excludes NFKC-redundant entries, and adds supplemental Latin small capitals
- Expanded mixed-script detection - `rejectMixedScript` now covers all scripts with confusable entries (Hebrew, Arabic, Indic, Thai, Myanmar, Georgian, Ethiopic, Cherokee, Canadian Syllabics, Runic, Khmer, Coptic, Tifinagh, Lisu, Bamum, and more) in addition to Cyrillic and Greek

### Changed
- `CONFUSABLE_MAP` is now generated from the Unicode Consortium's authoritative source rather than hand-curated
- All `CONFUSABLE_MAP` targets are now lowercase (uppercase Cyrillic targets like `"A"` → `"a"` are lowercased to match the normalize pipeline)

## [0.7.0] - 2026-02-20

### Added
- NFKC Unicode normalization in `normalize()` - collapses full-width characters, ligatures, superscripts, and other compatibility forms to canonical equivalents (on by default, opt out with `normalizeUnicode: false`)
- `createHomoglyphValidator()` - detects Cyrillic and Greek characters that visually mimic Latin letters (e.g., Cyrillic "а" in "аdmin")
- `CONFUSABLE_MAP` export - ~30 Cyrillic-to-Latin and Greek-to-Latin confusable character pairs
- `rejectMixedScript` option for homoglyph validator - also rejects strings mixing Latin + Cyrillic/Greek scripts
- `allowPurelyNumeric` config option - reject purely numeric identifiers like "123" (default: allowed)
- `messages.purelyNumeric` for custom rejection message

### Changed
- `normalize()` now accepts an optional `options` parameter (`{ unicode?: boolean }`)
- Playground updated with homoglyph detection toggle, purely-numeric toggle, and confusable example pills

## [0.6.1] - 2026-02-20

### Changed
- Documentation only: the README describes the suggestion pipeline as progressive batched rather than three-phase.

## [0.6.0] - 2026-02-20

### Added
- `"similar"` suggestion strategy - generates cognitively close alternatives using edit-distance-1 mutations (deletions, keyboard-adjacent substitutions, prefix/suffix additions)
- LRU cache eviction replaces FIFO for better hit rates on frequently checked names

### Changed
- Suggestion pipeline now uses progressive batched processing - validates and DB-checks in parallel batches of `max` instead of validating all then checking sequentially (up to 5-6x latency improvement)
- Pre-compiled regex for profanity substring matching - O(identifier length) instead of O(words x length)
- Set-based deduplication in all strategy factories - O(n) instead of O(n²)
- Binary search in `extractMaxLength` - 12x faster pattern initialization

## 0.5.0 - 2026-02-20

Not published to npm; these changes first shipped in 0.6.0.

### Added
- Pluggable suggestion strategies: `"sequential"`, `"random-digits"`, `"suffix-words"`, `"short-random"`, `"scramble"`
- `SuggestStrategyName` exported type
- Strategy composition via arrays (e.g., `strategy: ["random-digits", "suffix-words"]`)
- Custom strategy functions via `strategy: (id) => string[]`
- Optimized three-phase suggestion pipeline (sync format/reserved filter → async validators → DB checks)

### Changed
- Default suggestion strategy changed from sequential-only to `["sequential", "random-digits"]`
- Suggestions now skip reserved names and format-invalid candidates without DB calls
- `generate` callback is now deprecated in favor of `strategy` (still works for backwards compatibility)

## [0.4.0] - 2026-02-20

### Added
- `createProfanityValidator()` - convenience factory for blocking offensive names (bring your own word list)
- `cacheStats()` method - returns `{ size, hits, misses }` for cache performance monitoring
- Smarter default suggestions: interleaves hyphenated (`sarah-1`) and compact (`sarah1`) variants, with truncation for identifiers near the max length
- JSDoc on all public types and methods (visible in editor hover tooltips and `.d.ts` output)
- Bundle size badge in README

### Changed
- Default suggestion output order changed from `["sarah-1", "sarah-2", "sarah-3"]` to `["sarah-1", "sarah1", "sarah-2"]` (interleaved compact variants)
- `clearCache()` now also resets hit/miss counters

## 0.3.0 - 2026-02-20

Not published to npm; these changes first shipped in 0.4.0.

### Added
- TypeORM adapter (`namespace-guard/adapters/typeorm`)
- MikroORM adapter (`namespace-guard/adapters/mikro-orm`)
- Sequelize adapter (`namespace-guard/adapters/sequelize`)
- Mongoose adapter (`namespace-guard/adapters/mongoose`)

### Fixed
- Knex adapter now uses `??` identifier binding for cross-dialect portability
- Removed phantom `whereRaw` from Kysely type definition
- Raw SQL adapter docs now correctly state PostgreSQL-only `$1` placeholder syntax

## [0.2.0] - 2026-02-20

### Added
- Case-insensitive database matching (`caseInsensitive` config option)
- In-memory TTL cache for adapter lookups (`cache` config option)
- `clearCache()` method
- Kysely adapter (`namespace-guard/adapters/kysely`)
- Knex adapter (`namespace-guard/adapters/knex`)
- Framework integration examples in README (Next.js, Express, tRPC)
- OG social preview image for playground

## [0.1.2] - 2026-02-19

### Added
- Sponsor and support links in README and playground footer

## 0.1.1 - 2026-02-19

Not published to npm; these changes first shipped in 0.1.2.

### Added
- SEO and Open Graph meta tags for playground page
- npm and repository metadata in `package.json`

## [0.1.0] - 2026-02-19

### Added
- Core `createNamespaceGuard` factory with `check`, `checkMany`, `assertAvailable`, `validateFormat`
- `normalize()` utility (trim, lowercase, strip `@`)
- Reserved name blocking with categorized records and per-category messages
- Multi-source collision detection with parallel database queries
- Ownership scoping to prevent false collisions on own records
- Async validator hooks (`validators` config)
- Conflict resolution suggestions (`suggest` config)
- Prisma adapter (`namespace-guard/adapters/prisma`)
- Drizzle adapter (`namespace-guard/adapters/drizzle`)
- Raw SQL adapter (`namespace-guard/adapters/raw`)
- CLI (`npx namespace-guard check <slug>`)
- Interactive playground page (GitHub Pages)

[0.22.0]: https://www.npmjs.com/package/namespace-guard/v/0.22.0
[0.21.0]: https://www.npmjs.com/package/namespace-guard/v/0.21.0
[0.20.0]: https://www.npmjs.com/package/namespace-guard/v/0.20.0
[0.19.1]: https://www.npmjs.com/package/namespace-guard/v/0.19.1
[0.19.0]: https://www.npmjs.com/package/namespace-guard/v/0.19.0
[0.18.0]: https://www.npmjs.com/package/namespace-guard/v/0.18.0
[0.17.1]: https://www.npmjs.com/package/namespace-guard/v/0.17.1
[0.17.0]: https://www.npmjs.com/package/namespace-guard/v/0.17.0
[0.16.1]: https://www.npmjs.com/package/namespace-guard/v/0.16.1
[0.16.0]: https://www.npmjs.com/package/namespace-guard/v/0.16.0
[0.15.1]: https://www.npmjs.com/package/namespace-guard/v/0.15.1
[0.15.0]: https://www.npmjs.com/package/namespace-guard/v/0.15.0
[0.11.1]: https://www.npmjs.com/package/namespace-guard/v/0.11.1
[0.11.0]: https://www.npmjs.com/package/namespace-guard/v/0.11.0
[0.10.0]: https://www.npmjs.com/package/namespace-guard/v/0.10.0
[0.8.2]: https://www.npmjs.com/package/namespace-guard/v/0.8.2
[0.8.1]: https://www.npmjs.com/package/namespace-guard/v/0.8.1
[0.7.0]: https://www.npmjs.com/package/namespace-guard/v/0.7.0
[0.6.1]: https://www.npmjs.com/package/namespace-guard/v/0.6.1
[0.6.0]: https://www.npmjs.com/package/namespace-guard/v/0.6.0
[0.4.0]: https://www.npmjs.com/package/namespace-guard/v/0.4.0
[0.2.0]: https://www.npmjs.com/package/namespace-guard/v/0.2.0
[0.1.2]: https://www.npmjs.com/package/namespace-guard/v/0.1.2
[0.1.0]: https://www.npmjs.com/package/namespace-guard/v/0.1.0
