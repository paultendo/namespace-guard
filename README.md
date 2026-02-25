# namespace-guard

[![npm version](https://img.shields.io/npm/v/namespace-guard.svg)](https://www.npmjs.com/package/namespace-guard)
[![bundle size](https://img.shields.io/bundlephobia/minzip/namespace-guard)](https://bundlephobia.com/package/namespace-guard)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Claim safe slugs in one line**: availability, reserved names, spoofing protection, and moderation hooks.

- Live demo: https://paultendo.github.io/namespace-guard/
- Blog post: https://paultendo.github.io/posts/namespace-guard-launch/

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

## Research-Backed Differentiation

We started by auditing how major Unicode-confusable implementations compose normalization and mapping in practice (including ICU, Chromium, Rust, and django-registration), then converted that gap into a reproducible library design.

- Documented a 31-entry NFKC vs TR39 divergence set and shipped it as a named regression suite: `nfkc-tr39-divergence-v1`.
- Ship two maps for two real pipelines:
  `CONFUSABLE_MAP` (NFKC-first) and `CONFUSABLE_MAP_FULL` (TR39/NFD/raw-input pipelines).
- Export the vectors as JSON (`docs/data/composability-vectors.json`) and wire them into CLI drift baselines.
- Publish a labeled benchmark corpus (`docs/data/confusable-bench.v1.json`) for cross-tool evaluation and CI regressions.
- Submitted the findings for Unicode public review (PRI #540): https://www.unicode.org/review/pri540/
- Validated the 31 divergence vectors empirically by rendering each character across 12 fonts and measuring SSIM similarity: TR39 is visually correct for letter-shape confusables, NFKC for digit confusables, and 61% are ties where both targets are near-identical ([confusable-vision](https://github.com/paultendo/confusable-vision)).

Details:
- Technical reference: [docs/reference.md#how-the-anti-spoofing-pipeline-works](docs/reference.md#how-the-anti-spoofing-pipeline-works)
- Launch write-up: https://paultendo.github.io/posts/namespace-guard-launch/

## What You Get

- Cross-table collision checks (users, orgs, teams, etc.)
- Reserved-name blocking with category-aware messages
- Unicode anti-spoofing (NFKC + confusable detection + mixed-script/risk controls)
- Invisible character detection (default-ignorable + bidi controls, optional combining-mark blocking)
- Optional profanity/evasion validation
- Suggestion strategies for taken names
- CLI for red-team generation, calibration, drift, and CI gates

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

# 4) Compare TR39-full vs NFKC-filtered behavior
npx namespace-guard drift --json
```

## Advanced Security Primitives (Optional)

Use these when you need custom scoring, explainability, or pairwise checks outside the default claim flow:

```typescript
import { skeleton, areConfusable, confusableDistance } from "namespace-guard";

skeleton("pa\u0443pal"); // "paypal" skeleton form
areConfusable("paypal", "pa\u0443pal"); // true
confusableDistance("paypal", "pa\u0443pal"); // graded similarity + chainDepth + explainable steps
```

For measured visual scoring, pass the optional weights from confusable-vision (903 SSIM-scored pairs across 230 fonts). The `context` filter restricts to identifier-valid, domain-valid, or all pairs.

```typescript
import { confusableDistance } from "namespace-guard";
import { CONFUSABLE_WEIGHTS } from "namespace-guard/confusable-weights";

const result = confusableDistance("paypal", "pa\u0443pal", {
  weights: CONFUSABLE_WEIGHTS,
  context: "identifier",
});
// result.similarity, result.steps (including "visual-weight" reason for novel pairs)
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
- Benchmark corpus (`confusable-bench.v1`): [docs/reference.md#confusable-benchmark-corpus-artifact](docs/reference.md#confusable-benchmark-corpus-artifact)
- Advanced primitives (`skeleton`, `areConfusable`, `confusableDistance`): [docs/reference.md#advanced-security-primitives](docs/reference.md#advanced-security-primitives)
- Confusable weights (SSIM-scored pairs): [docs/reference.md#confusable-weights-subpath](docs/reference.md#confusable-weights-subpath)
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
