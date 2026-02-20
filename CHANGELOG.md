# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.7.0] - 2026-02-20

### Added
- NFKC Unicode normalization in `normalize()` — collapses full-width characters, ligatures, superscripts, and other compatibility forms to canonical equivalents (on by default, opt out with `normalizeUnicode: false`)
- `createHomoglyphValidator()` — detects Cyrillic and Greek characters that visually mimic Latin letters (e.g., Cyrillic "а" in "аdmin")
- `CONFUSABLE_MAP` export — ~30 Cyrillic-to-Latin and Greek-to-Latin confusable character pairs
- `rejectMixedScript` option for homoglyph validator — also rejects strings mixing Latin + Cyrillic/Greek scripts
- `allowPurelyNumeric` config option — reject purely numeric identifiers like "123" (default: allowed)
- `messages.purelyNumeric` for custom rejection message

### Changed
- `normalize()` now accepts an optional `options` parameter (`{ unicode?: boolean }`)
- Playground updated with homoglyph detection toggle, purely-numeric toggle, and confusable example pills

## [0.6.0] - 2026-02-20

### Added
- `"similar"` suggestion strategy — generates cognitively close alternatives using edit-distance-1 mutations (deletions, keyboard-adjacent substitutions, prefix/suffix additions)
- LRU cache eviction replaces FIFO for better hit rates on frequently checked names

### Changed
- Suggestion pipeline now uses progressive batched processing — validates and DB-checks in parallel batches of `max` instead of validating all then checking sequentially (up to 5-6x latency improvement)
- Pre-compiled regex for profanity substring matching — O(identifier length) instead of O(words x length)
- Set-based deduplication in all strategy factories — O(n) instead of O(n²)
- Binary search in `extractMaxLength` — 12x faster pattern initialization

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
- `createProfanityValidator()` — convenience factory for blocking offensive names (bring your own word list)
- `cacheStats()` method — returns `{ size, hits, misses }` for cache performance monitoring
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

[0.7.0]: https://github.com/paultendo/namespace-guard/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/paultendo/namespace-guard/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/paultendo/namespace-guard/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/paultendo/namespace-guard/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/paultendo/namespace-guard/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/paultendo/namespace-guard/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/paultendo/namespace-guard/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/paultendo/namespace-guard/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/paultendo/namespace-guard/releases/tag/v0.1.0
