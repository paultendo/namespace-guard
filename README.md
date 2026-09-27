# namespace-guard

[![npm version](https://img.shields.io/npm/v/namespace-guard.svg)](https://www.npmjs.com/package/namespace-guard)
[![npm downloads](https://img.shields.io/npm/dw/namespace-guard.svg)](https://www.npmjs.com/package/namespace-guard)
[![bundle size](https://img.shields.io/bundlephobia/minzip/namespace-guard)](https://bundlephobia.com/package/namespace-guard)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Lookalike detection built on the world's first font-by-font confusables dataset, measured in 322 fonts, including pairs between two non-Latin scripts that Unicode's confusables list leaves out.** Slug claimability, Unicode anti-spoofing, and LLM [Denial of Spend](https://paultendo.github.io/posts/confusable-vision-llm-attack-tests/) defence in one zero-dependency package.

The measured pairs come from [confusable-vision](https://github.com/paultendo/confusable-vision), which [addons.mozilla.org](https://addons.mozilla.org/) uses to check add-on names for lookalikes, [credited by name in Mozilla's source](https://github.com/mozilla/addons-server/blob/master/src/olympia/amo/confusables.py#L4-L6).

- Live demo: https://paultendo.github.io/namespace-guard/
- Docs: https://paultendo.github.io/namespace-guard/docs/
- Blog post: https://paultendo.github.io/posts/namespace-guard-launch/

## Used by

- **[agent-sanitizer](https://github.com/AlexanderMattTurner/agent-sanitizer)** cleans untrusted text before an AI agent reads it, and uses namespace-guard as its default engine for folding lookalike characters in tool-call input (paths and commands) to ASCII. [Dependents on deps.dev](https://deps.dev/npm/namespace-guard/0.20.0/dependents).
- **[d0ma1n](https://d0ma1n.app)** finds the lookalikes of a domain that are already registered, scored with namespace-guard's measured weights.
- **[Mozilla addons.mozilla.org](https://addons.mozilla.org/)** checks add-on names for lookalikes with characters from **[confusable-vision](https://github.com/paultendo/confusable-vision#used-by)**, where these measured pairs come from ([`confusables.py`](https://github.com/mozilla/addons-server/blob/master/src/olympia/amo/confusables.py#L4-L6) in [addons-server](https://github.com/mozilla/addons-server)). [disarm](https://disarm.dev/) and [SilverSpeak](https://acmcmc.github.io/silverspeak/) use confusable-vision's data too.

## Cross-script confusable detection

Unicode's confusables list (TR39), which IDNA and most tools build on, maps each lookalike to one prototype, usually a Latin letter. Two non-Latin characters that look alike are only paired when they happen to share a prototype, so many pairs *between* two non-Latin scripts are missing.

namespace-guard ships measured lookalike pairs from [confusable-vision](https://github.com/paultendo/confusable-vision) release 2026.09.26 (vector-outline raycasting, [RaySpace](https://paultendo.github.io/posts/rayspace-methodology/), at the size and baseline position glyphs have in running text, in 322 fonts: every macOS font, Roboto, Noto and DejaVu). They include pairs between two non-Latin scripts that no standard covers:

```typescript
import { areConfusable, detectCrossScriptRisk } from "namespace-guard";
import { CONFUSABLE_WEIGHTS } from "namespace-guard/confusable-weights";

// Hangul ㅣ and Han 丨 are alike in every text font that draws both. Unicode's list doesn't pair them,
// so only the measured weights catch it
areConfusable("\u3163", "\u4E28", { weights: CONFUSABLE_WEIGHTS }); // true
areConfusable("\u3163", "\u4E28");                                  // false

// Cyrillic ј and Greek ϳ (alike in 92% of text fonts), and Cyrillic І and Greek Ι (identical outlines in 51 fonts),
// both map to a Latin letter in Unicode's list, so they match with or without weights
areConfusable("\u0458", "\u03F3"); // true
areConfusable("\u0406", "\u0399"); // true

// Analyze an identifier for cross-script risk
const risk = detectCrossScriptRisk("\u3163\u4E28", { weights: CONFUSABLE_WEIGHTS });
// { riskLevel: "high", scripts: ["han", "hangul"], crossScriptPairs: [...] }
```

2,300 pairs ship, each found alike at running-text size within one font or across fonts, where one character is an ASCII letter or digit or the two are in different scripts. A pair's `danger` (0–1) is the share of text fonts (or font combinations) where it holds; filter at `danger > 0.7` (1,079 pairs) for the pairs alike almost everywhere. `namespace-guard/font-specific-weights` gives the pairs found within one font per font (1,417 pairs in 166 fonts), for saying which font makes a lookalike most convincing. Data licensed CC-BY-4.0.

## Installation

```bash
npm install namespace-guard
```

## Use it from an AI agent

A skill teaches Claude Code, Codex and other agents to use namespace-guard when they write sign-up code or send untrusted text to a model:

```bash
claude plugin marketplace add paultendo/skills
claude plugin install namespace-guard@paultendo
```

For Codex or another agent, copy [`plugins/namespace-guard/skills/lookalike-names-and-text`](plugins/namespace-guard/skills/lookalike-names-and-text) into its skills folder.

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

To check and write in one step, use `claim()`. With a unique index on the canonical column, a write that loses a race comes back as "taken" rather than as a database error. If users and organisations share one namespace, add a shared names table too; see [Names shared by several tables](https://paultendo.github.io/namespace-guard/docs/claiming/#names-shared-by-several-tables).

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

**Lookalike letters can't fool an LLM. They can make it cost up to 5.7x as much to read.**

I flooded a contract with characters that pass for Latin letters and gave it to seven GPT and Claude models: GPT-6 Astra, Sol and Luna, and Claude Fable 5.1, Opus 5.5, Sonnet 5 and Haiku 4.5. Every one still read every negation correctly. But the contract grew from about a thousand tokens to more than four thousand, and you pay for every one of them. I call this **Denial of Spend**: an attack that can't change what the service does, but can multiply what it costs to run.

Reading is only part of the bill. The model's answer isn't flooded, and output tokens cost more, so on a short contract the bill for each question rose by up to 3.9x, depending on how much the model wrote back. For work that is all reading, such as embedding documents for search, the bill rises by the full 4x to 5.7x ([results](https://github.com/paultendo/confusable-vision/blob/main/data/output/denial-of-spend/RESULTS.md)).

The first test, in February 2026, covered 4 models, 8 attack types and 130+ API calls, with the same result: no meaning flips, and 5.2x the tokens for the flooded contract.

`canonicalise()` rewrites any word that shows a sign of tampering: one that mixes Latin with another script, has a Latin letter no modern language uses (ɦ, ꞡ), or has a non-ASCII capital inside a lowercase word. Every lookalike in such a word goes back to its Latin letter, in the case of the word around it; ordinary Turkish, Russian or Sámi words are left alone. With `strategy: "all"` it turns the flooded contract back into the clean one, byte for byte, so it takes as many tokens as the clean one; the default leaves 9 short words (1.02x to 1.03x the clean contract's tokens). The flooded contract takes under 2 ms.

```typescript
import { canonicalise, scan, isClean } from "namespace-guard";

const raw = "The seller аssumes аll liаbility.";

const report = scan(raw);        // detailed findings + risk level
const clean = canonicalise(raw); // "The seller assumes all liability."
const ok = isClean(raw);         // false: true only when canonicalise() would change nothing

canonicalise("shall поŧ be limited"); // "shall not be limited" (Cyrillic п, о; Latin t with stroke)
canonicalise("Tɦİs ƙİŧe İstanbul");   // "This kite İstanbul" (İstanbul shows no sign of tampering)

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

For measured visual scoring, pass the optional weights from confusable-vision release 2026.09.26 (2,300 pairs measured at running-text size by vector-outline raycasting). Each pair has a `danger` score (0–1), the share of text fonts where it holds; use `danger > 0.7` for the pairs alike almost everywhere. The `context` filter restricts to identifier-valid, domain-valid, or all pairs.

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
// { spoof: true, script: "cyrillic", danger: 0.781, substitutions: [...] }

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

**Visual measurement.** Lookalike pairs measured by vector-outline raycasting ([RaySpace](https://paultendo.github.io/posts/rayspace-methodology/)) at the size and baseline position glyphs have in running text, in 322 fonts (every macOS font, Roboto, Noto and DejaVu), and calibrated against pairs with known answers. Release 2026.09.26 compares every letter and digit each font draws; the 2,300 pairs that pass its thresholds and involve an ASCII letter or two scripts ship here, including pairs between two non-Latin scripts (Cyrillic/Greek, Katakana/Hiragana, Han/Hangul) that no standard covers. Its lookalikes of ASCII letters are also checked in place, set between other letters in common fonts at text size; those that Unicode does not list are in `CONFUSABLE_MAP_FULL` and `MEASURED_CONFUSABLES`. Earlier releases compared only part of this and are superseded. Full dataset published as [confusable-vision](https://github.com/paultendo/confusable-vision) (CC-BY-4.0).

**Normalisation composability.** 34 characters where Unicode's confusables.txt (August 2026) and NFKC normalisation disagree, up from 31 with the previous file. Three of them are Unicode 16 characters, so a runtime whose NFKC predates Unicode 16 derives 31. Two production maps (`CONFUSABLE_MAP` for NFKC-first, `CONFUSABLE_MAP_FULL` for raw-input pipelines), a benchmark corpus, and composability vectors wired into CLI drift baselines. Submitted to [Unicode public review (PRI #540)](https://www.unicode.org/review/pri540/) and published in [accumulated feedback](https://www.unicode.org/review/pri540/feedback.html).

- Technical reference: [how a name is checked](https://paultendo.github.io/namespace-guard/docs/how-it-works/) and [Unicode names](https://paultendo.github.io/namespace-guard/docs/unicode-names/)
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

The English list comes with an allowlist of names, places and common words that contain a listed word (Scunthorpe, Dickson, Kirkland). With its defaults it refuses 0.4% of dictionary words and 11 of the 38,970 first names given to babies in England and Wales since 1996, and it leaves out names and places that look like a slur. Add your own users' names and towns with `allowlist`, and run it over the names you already have before you switch it on: see [Moderation](https://paultendo.github.io/namespace-guard/docs/moderation/).

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

Adapter setup examples and migration guidance: [Adapters](https://paultendo.github.io/namespace-guard/docs/adapters/)

## Production Recommendation: Canonical Uniqueness

For full protection against Unicode/canonicalization edge cases, enforce uniqueness on canonical columns (for example `handleCanonical`, `slugCanonical`) and point `sources[*].column` there.

Adding a canonical column, per adapter: [Claiming names](https://paultendo.github.io/namespace-guard/docs/claiming/#store-a-canonical-column) and [Adapters](https://paultendo.github.io/namespace-guard/docs/adapters/)

## Documentation Map

The docs live at **[paultendo.github.io/namespace-guard/docs](https://paultendo.github.io/namespace-guard/docs/)**, with search and examples you can run in the page. The pages are Markdown in [`guide/`](guide/), and every example in them runs in the test suite.

- [Getting started](https://paultendo.github.io/namespace-guard/docs/getting-started/) and [how a name is checked](https://paultendo.github.io/namespace-guard/docs/how-it-works/)
- Guides: [protect names](https://paultendo.github.io/namespace-guard/docs/protect-names/), [Unicode names](https://paultendo.github.io/namespace-guard/docs/unicode-names/), [claiming names](https://paultendo.github.io/namespace-guard/docs/claiming/), [suggestions](https://paultendo.github.io/namespace-guard/docs/suggestions/), [moderation](https://paultendo.github.io/namespace-guard/docs/moderation/), [text for LLMs](https://paultendo.github.io/namespace-guard/docs/llm-text/), [domain names](https://paultendo.github.io/namespace-guard/docs/domains/), [comparing names](https://paultendo.github.io/namespace-guard/docs/comparing-names/), [the CLI](https://paultendo.github.io/namespace-guard/docs/cli/), [upgrading to 0.23](https://paultendo.github.io/namespace-guard/docs/upgrading/)
- Reference: [configuration](https://paultendo.github.io/namespace-guard/docs/configuration/), [the guard](https://paultendo.github.io/namespace-guard/docs/guard/), [functions](https://paultendo.github.io/namespace-guard/docs/functions/), [data and maps](https://paultendo.github.io/namespace-guard/docs/data/), [adapters](https://paultendo.github.io/namespace-guard/docs/adapters/), [frameworks](https://paultendo.github.io/namespace-guard/docs/frameworks/), [TypeScript](https://paultendo.github.io/namespace-guard/docs/typescript/)
- [Changelog](https://paultendo.github.io/namespace-guard/docs/changelog/)

## Support

If `namespace-guard` helped you, please star the repo. It helps the project a lot.

- GitHub Sponsors: https://github.com/sponsors/paultendo
- Buy me a coffee: https://buymeacoffee.com/paultendo

## Contributing

Contributions welcome. Please open an issue first to discuss larger changes.

## License

MIT © [Paul Wood FRSA (@paultendo)](https://github.com/paultendo)
