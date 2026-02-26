# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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

## [0.14.0] - 2026-02-25

### Added
- `guard.claim(identifier, write, options?)` for race-safe claim/write workflows
- `isLikelyUniqueViolationError(error)` helper for duplicate-key detection across common stacks
- CLI `audit-canonical` command for preflight canonical collision/mismatch analysis on exported datasets

### Changed
- README now includes per-adapter canonical uniqueness migration guidance and operational rollout notes
- Playground/docs workflow sections updated for calibration/recommendation/drift operations and moderation coverage

## [0.13.0] - 2026-02-25

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

## [0.12.0] - 2026-02-24

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

## [0.9.0] - 2026-02-22

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

## [0.8.0] - 2026-02-20

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

## [0.6.0] - 2026-02-20

### Added
- `"similar"` suggestion strategy - generates cognitively close alternatives using edit-distance-1 mutations (deletions, keyboard-adjacent substitutions, prefix/suffix additions)
- LRU cache eviction replaces FIFO for better hit rates on frequently checked names

### Changed
- Suggestion pipeline now uses progressive batched processing - validates and DB-checks in parallel batches of `max` instead of validating all then checking sequentially (up to 5-6x latency improvement)
- Pre-compiled regex for profanity substring matching - O(identifier length) instead of O(words x length)
- Set-based deduplication in all strategy factories - O(n) instead of O(n²)
- Binary search in `extractMaxLength` - 12x faster pattern initialization

## [0.5.0] - 2026-02-20

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

## [0.3.0] - 2026-02-20

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

## [0.1.1] - 2026-02-19

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

[0.15.1]: https://github.com/paultendo/namespace-guard/compare/v0.15.0...v0.15.1
[0.15.0]: https://github.com/paultendo/namespace-guard/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/paultendo/namespace-guard/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/paultendo/namespace-guard/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/paultendo/namespace-guard/compare/v0.11.1...v0.12.0
[0.11.1]: https://github.com/paultendo/namespace-guard/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/paultendo/namespace-guard/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/paultendo/namespace-guard/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/paultendo/namespace-guard/compare/v0.8.2...v0.9.0
[0.8.2]: https://github.com/paultendo/namespace-guard/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/paultendo/namespace-guard/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/paultendo/namespace-guard/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/paultendo/namespace-guard/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/paultendo/namespace-guard/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/paultendo/namespace-guard/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/paultendo/namespace-guard/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/paultendo/namespace-guard/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/paultendo/namespace-guard/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/paultendo/namespace-guard/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/paultendo/namespace-guard/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/paultendo/namespace-guard/releases/tag/v0.1.0
