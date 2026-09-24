# namespace-guard

[![npm version](https://img.shields.io/npm/v/namespace-guard.svg)](https://www.npmjs.com/package/namespace-guard)
[![bundle size](https://img.shields.io/bundlephobia/minzip/namespace-guard)](https://bundlephobia.com/package/namespace-guard)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**The world's first library that detects confusable characters across non-Latin scripts.** Slug claimability, Unicode anti-spoofing, and LLM [Denial of Spend](https://paultendo.github.io/posts/confusable-vision-llm-attack-tests/) defence in one zero-dependency package.

- Live demo: https://paultendo.github.io/namespace-guard/
- Blog post: https://paultendo.github.io/posts/namespace-guard-launch/

## Cross-script confusable detection

Existing confusable standards (TR39, IDNA) map non-Latin characters to Latin equivalents. They have zero coverage for confusable pairs *between* two non-Latin scripts.

namespace-guard ships measured lookalike pairs from [confusable-vision](https://github.com/paultendo/confusable-vision) release 2026.09.24 (vector-outline raycasting, [RaySpace](https://paultendo.github.io/posts/rayspace-methodology/), at the size and baseline position glyphs have in running text, across every macOS system font and Roboto). They include pairs between two non-Latin scripts that no standard covers:

```typescript
import { areConfusable, detectCrossScriptRisk } from "namespace-guard";
import { CONFUSABLE_WEIGHTS } from "namespace-guard/confusable-weights";

// Hangul ᅵ and Han 丨 are alike in every text font that draws both
areConfusable("\u1175", "\u4E28", { weights: CONFUSABLE_WEIGHTS }); // true

// Cyrillic ј and Greek ϳ are alike in 95% of text fonts
areConfusable("\u0458", "\u03F3", { weights: CONFUSABLE_WEIGHTS }); // true

// Cyrillic І and Greek Ι are identical outlines (62 fonts)
areConfusable("\u0406", "\u0399", { weights: CONFUSABLE_WEIGHTS }); // true

// Without weights, only skeleton-based detection (TR39 coverage)
areConfusable("\u1175", "\u4E28"); // false

// Analyze an identifier for cross-script risk
const risk = detectCrossScriptRisk("\u1175\u4E28", { weights: CONFUSABLE_WEIGHTS });
// { riskLevel: "high", scripts: ["han", "hangul"], crossScriptPairs: [...] }
```

322 pairs ship, each found alike at running-text size within one font or across fonts. A pair's `danger` (0–1) is the share of text fonts (or font combinations) where it holds; filter at `danger > 0.7` (85 pairs) for the pairs alike almost everywhere. `namespace-guard/font-specific-weights` gives the same pairs per font (106 fonts), for saying which font makes a lookalike most convincing. Data licensed CC-BY-4.0.

## Installation

```bash
npm install namespace-guard
```

## Quick Start (60 seconds)

```typescript
import { createNamespaceGuardWithProfile } from "namespace-guard";
import { createPrismaAdapter } from "namespace-guard/adapters/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const guard = createNamespaceGuardWithProfile(
  "consumer-handle",
  {
    reserved: ["admin", "api", "settings", "dashboard", "login", "signup"],
    sources: [
      { name: "user", column: "handleCanonical", scopeKey: "id" },
      { name: "organization", column: "slugCanonical", scopeKey: "id" },
    ],
  },
  createPrismaAdapter(prisma)
);

await guard.assertClaimable("acme-corp");
```

For race-safe writes, use `claim()`:

```typescript
const result = await guard.claim(input.handle, async (canonical) => {
  return prisma.user.create({
    data: {
      handle: input.handle,
      handleCanonical: canonical,
    },
  });
});

if (!result.claimed) {
  return { error: result.message };
}
```

## What You Get

- **Cross-script confusable detection** with measured pairs, including pairs between two non-Latin scripts
- Cross-table collision checks (users, orgs, teams, etc.)
- Reserved-name blocking with category-aware messages
- Unicode anti-spoofing (NFKC + confusable detection + mixed-script/risk controls)
- Invisible character detection (zero-width joiners, direction overrides, and other hidden bytes)
- Optional profanity/evasion validation
- Suggestion strategies for taken names
- CLI for red-team generation, calibration, drift, and CI gates

## LLM Pipeline Preprocessing

Confusable characters are pixel-identical to Latin letters but encode as multi-byte BPE tokens. A 95-line contract that costs 881 tokens in clean ASCII costs 4,567 tokens when flooded with confusables: **5.2x the API bill**. The model reads it correctly. The invoice does not care.

We tested this across 4 frontier models, 8 attack types, and 130+ API calls. Zero meaning flips. Every substituted clause was correctly interpreted. But the billing attack succeeds. We call it **Denial of Spend**: the confusable analogue of DDoS, where the attacker cannot degrade the service but can inflate the cost of running it.

`canonicalise()` recovered every substituted term across all 12 attack variants, collapsing the 5.2x inflation to 1.0x. Processing a 10,000-character document takes under 1ms.

```typescript
import { canonicalise, scan, isClean } from "namespace-guard";

const raw = "The seller аssumes аll liаbility.";

const report = scan(raw);        // detailed findings + risk level
const clean = canonicalise(raw); // "The seller assumes all liability."
const ok = isClean(raw);         // false (mixed-script confusable detected)

// For known-Latin documents (e.g. English contracts), use strategy: "all"
// to also catch words where every character was substituted:
canonicalise("поп-refundable", { strategy: "all" }); // "non-refundable"
```

Research:
- Denial of Spend: https://paultendo.github.io/posts/confusable-vision-llm-attack-tests/
- Launch: https://paultendo.github.io/posts/namespace-guard-launch/
- NFKC/TR39 composability: https://paultendo.github.io/posts/unicode-confusables-nfkc-conflict/

## Advanced Security Primitives

Low-level helpers for custom scoring, pairwise checks, and cross-script risk analysis:

```typescript
import { skeleton, areConfusable, confusableDistance } from "namespace-guard";

skeleton("pa\u0443pal"); // "paypal" skeleton form
areConfusable("paypal", "pa\u0443pal"); // true
confusableDistance("paypal", "pa\u0443pal"); // graded similarity + chainDepth + explainable steps
```

For measured visual scoring, pass the optional weights from confusable-vision release 2026.09.24 (322 pairs measured at running-text size by vector-outline raycasting). Each pair has a `danger` score (0–1), the share of text fonts where it holds; use `danger > 0.7` for the pairs alike almost everywhere. The `context` filter restricts to identifier-valid, domain-valid, or all pairs.

```typescript
import { confusableDistance } from "namespace-guard";
import { CONFUSABLE_WEIGHTS } from "namespace-guard/confusable-weights";

const result = confusableDistance("paypal", "pa\u0443pal", {
  weights: CONFUSABLE_WEIGHTS,
  context: "identifier",
});
// result.similarity, result.steps (including "visual-weight" reason for novel pairs)
```

### Realistic Domain Spoof Detection

For domain name validation, `isDomainSpoof()` only flags threats that could produce registrable domain names. ICANN registrars enforce single-script labels, so mixed-script spoofs (e.g., one Cyrillic letter in a Latin domain) are excluded — they can't actually be registered.

```typescript
import { isDomainSpoof } from "namespace-guard";
import { CONFUSABLE_WEIGHTS } from "namespace-guard/confusable-weights";

// Full-Cyrillic lookalike — registrable and deceptive
isDomainSpoof("\u0440\u0430\u0443\u0440\u0430\u04CF", "paypal", { weights: CONFUSABLE_WEIGHTS });
// { spoof: true, script: "cyrillic", danger: 0.91, substitutions: [...] }

// Mixed-script — not registrable, not flagged
isDomainSpoof("\u0440aypal", "paypal", { weights: CONFUSABLE_WEIGHTS });
// { spoof: false }

// Known-legitimate non-Latin domain — skip via allowlist
isDomainSpoof("\u0430\u0441\u0435", "ace", {
  weights: CONFUSABLE_WEIGHTS,
  allowlist: ["\u0430\u0441\u0435"],
});
// { spoof: false }
```

The `danger` score (0–1) is always returned when a script match is found, even if below the `minDanger` threshold (default 0.5). Set `minDanger: 0.7` for higher precision.

## Research

Two research tracks feed the library:

**Visual measurement.** Lookalike pairs measured by vector-outline raycasting ([RaySpace](https://paultendo.github.io/posts/rayspace-methodology/)) at the size and baseline position glyphs have in running text, across every macOS system font and Roboto, and calibrated against pairs with known answers. Release 2026.09.24 finds 857 pairs alike; the 322 that pass its thresholds ship here, including pairs between two non-Latin scripts (Cyrillic/Greek, Katakana/Hiragana, Han/Hangul) that no standard covers. The March 2026 measurements were blind to size and are superseded. Full dataset published as [confusable-vision](https://github.com/paultendo/confusable-vision) (CC-BY-4.0).

**Normalisation composability.** 31 characters where Unicode's confusables.txt and NFKC normalisation disagree. Two production maps (`CONFUSABLE_MAP` for NFKC-first, `CONFUSABLE_MAP_FULL` for raw-input pipelines), a benchmark corpus, and composability vectors wired into CLI drift baselines. Submitted to [Unicode public review (PRI #540)](https://www.unicode.org/review/pri540/) and published in [accumulated feedback](https://www.unicode.org/review/pri540/feedback.html).

- Technical reference: [docs/reference.md#how-the-anti-spoofing-pipeline-works](docs/reference.md#how-the-anti-spoofing-pipeline-works)
- Launch write-up: https://paultendo.github.io/posts/namespace-guard-launch/
- Denial of Spend: https://paultendo.github.io/posts/confusable-vision-llm-attack-tests/

## Built-in Profiles

Use `createNamespaceGuardWithProfile(profile, overrides, adapter)`:

- `consumer-handle`: strict defaults for public handles
- `org-slug`: workspace/org slugs
- `developer-id`: technical IDs with looser numeric rules

Profiles are defaults, not lock-in. Override only what you need.

## Zero-Dependency Moderation Integration

Core stays zero-dependency. You can use built-ins or plug in any external library.

```typescript
import {
  createNamespaceGuard,
  createPredicateValidator,
} from "namespace-guard";
import { createEnglishProfanityValidator } from "namespace-guard/profanity-en";

const guard = createNamespaceGuard(
  {
    sources: [
      { name: "user", column: "handleCanonical", scopeKey: "id" },
      { name: "organization", column: "slugCanonical", scopeKey: "id" },
    ],
    validators: [
      createEnglishProfanityValidator({ mode: "evasion" }),
      createPredicateValidator((identifier) => thirdPartyFilter.has(identifier)),
    ],
  },
  adapter
);
```

## CLI Workflow

```bash
# 1) Generate realistic attack variants
npx namespace-guard attack-gen paypal --json

# 2) Calibrate thresholds and CI gate suggestions from your dataset
npx namespace-guard recommend ./risk-dataset.json

# 3) Preflight canonical collisions before adding DB unique constraints
npx namespace-guard audit-canonical ./users-export.json --json

# 4) Compare TR39-full vs NFKC-filtered behaviour
npx namespace-guard drift --json
```

## Adapter Support

- Prisma
- Drizzle
- Kysely
- Knex
- TypeORM
- MikroORM
- Sequelize
- Mongoose
- Raw SQL

Adapter setup examples and migration guidance: [docs/reference.md#adapters](docs/reference.md#adapters)

## Production Recommendation: Canonical Uniqueness

For full protection against Unicode/canonicalization edge cases, enforce uniqueness on canonical columns (for example `handleCanonical`, `slugCanonical`) and point `sources[*].column` there.

Migration guides per adapter: [docs/reference.md#canonical-uniqueness-migration-per-adapter](docs/reference.md#canonical-uniqueness-migration-per-adapter)

## Documentation Map

- Full reference: [docs/reference.md](docs/reference.md)
- Config reference: [docs/reference.md#configuration](docs/reference.md#configuration)
- Validators (profanity, homoglyph, invisible): [docs/reference.md#async-validators](docs/reference.md#async-validators)
- Canonical preflight audit (`audit-canonical`): [docs/reference.md#audit-canonical-command](docs/reference.md#audit-canonical-command)
- Anti-spoofing pipeline and composability vectors: [docs/reference.md#how-the-anti-spoofing-pipeline-works](docs/reference.md#how-the-anti-spoofing-pipeline-works)
- LLM preprocessing (`canonicalise`, `scan`, `isClean`): [docs/reference.md#llm-pipeline-preprocessing](docs/reference.md#llm-pipeline-preprocessing)
- Benchmark corpus (`confusable-bench.v1`): [docs/reference.md#confusable-benchmark-corpus-artifact](docs/reference.md#confusable-benchmark-corpus-artifact)
- Advanced primitives (`skeleton`, `areConfusable`, `confusableDistance`): [docs/reference.md#advanced-security-primitives](docs/reference.md#advanced-security-primitives)
- Confusable weights (scored pairs, including cross-script): [docs/reference.md#confusable-weights-subpath](docs/reference.md#confusable-weights-subpath)
- Cross-script detection: [docs/reference.md#cross-script-detection](docs/reference.md#cross-script-detection)
- CLI reference: [docs/reference.md#cli](docs/reference.md#cli)
- API reference: [docs/reference.md#api-reference](docs/reference.md#api-reference)
- Framework integration (Next.js/Express/tRPC): [docs/reference.md#framework-integration](docs/reference.md#framework-integration)

## Support

If `namespace-guard` helped you, please star the repo. It helps the project a lot.

- GitHub Sponsors: https://github.com/sponsors/paultendo
- Buy me a coffee: https://buymeacoffee.com/paultendo

## Contributing

Contributions welcome. Please open an issue first to discuss larger changes.

## License

MIT © [Paul Wood FRSA (@paultendo)](https://github.com/paultendo)
