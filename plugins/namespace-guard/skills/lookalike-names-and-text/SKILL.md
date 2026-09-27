---
name: lookalike-names-and-text
description: Stops confusables (lookalike letters, also called homoglyphs) in names people choose and in text sent to an LLM, using the namespace-guard npm package. Use when building sign-up, usernames, handles, organisation or workspace slugs, or any name users pick; when reviewing code that stores or compares such names; or when documents, emails, web pages or other untrusted text go into a model. Covers impersonation and Unicode spoofing (a Cyrillic а for a, rn for m, paypa1), mixed-script and homograph tricks, invisible characters, profanity with evasions, race-safe claiming, and turning confusables back into plain letters before a model reads them, which prevents Denial of Spend (flooded text can take up to 5.7x the tokens). Built on Unicode TR39 confusables.txt plus measured data.
license: MIT
---

# Lookalike names and text

[namespace-guard](https://github.com/paultendo/namespace-guard) checks the names people choose and cleans text before an LLM reads it. Its core has no dependencies. Its lookalike data comes from Unicode's confusables.txt and from [confusable-vision](https://github.com/paultendo/confusable-vision), which measures 64,751 characters in 322 fonts.

Full docs, with examples that run in the page: https://paultendo.github.io/namespace-guard/docs/

```bash
npm install namespace-guard
```

## Names people choose

Use a profile (`consumer-handle`, `org-slug` or `developer-id`) and an adapter for your database (Prisma, Drizzle, Kysely, Knex, TypeORM, MikroORM, Sequelize, Mongoose or raw SQL).

```ts
import { createNamespaceGuardWithProfile } from "namespace-guard";
import { createPrismaAdapter } from "namespace-guard/adapters/prisma";

const guard = createNamespaceGuardWithProfile(
  "consumer-handle",
  {
    reserved: ["admin", "api", "settings", "login", "signup"],
    sources: [
      { name: "user", column: "handleCanonical", scopeKey: "id" },
      { name: "organization", column: "slugCanonical", scopeKey: "id" },
    ],
    risk: { protect: ["yourbrand", "support", "billing"] },
  },
  createPrismaAdapter(prisma),
);

// On submit: checks format, reserved names, lookalikes of protected names and every table, then writes
const result = await guard.claim(input.handle, async (canonical) =>
  prisma.user.create({ data: { handle: input.handle, handleCanonical: canonical } }),
);
if (!result.claimed) return { error: result.message };

// While someone types: a score and an action, without throwing
guard.checkRisk("paypa1").action; // "block" when "paypal" is protected
guard.checkRisk("githuh").action; // "warn": a typo, not a lookalike
```

Which call to use:

- `claim(name, write)` when someone submits. With a unique index on the canonical column, a write that loses a race comes back as taken, not as a database error.
- `assertClaimable(name)` throws if the name can't be had; `enforceRisk(name)` gives the same decision without throwing.
- `checkRisk(name)` for live feedback: `action` is `allow`, `warn` or `block`, with a `score` from 0 to 100 and the closest match.
- `normalize(name)` gives the canonical form to store.

Rules worth knowing:

- Store the canonical form in its own column with a unique index, and point `sources[].column` at it.
- With no `protect` list, `claim()`, `assertClaimable()` and `enforceRisk()` protect a built-in list (`admin`, `support`, `billing`, `login` and 11 more). `checkRisk()` doesn't: without `protect` it only scores against your reserved names.
- A typo (`githuh` for `github`) warns at most, and a protected word with letters added (`github-fan`) isn't matched. Add such names to `reserved` or write a validator if you want them refused.
- Digits standing for letters (`p4ypal`) only warn unless you set `risk: { leetspeak: true }`.
- `paypaI`, with a capital I, is stored as `paypai` but still blocked, because names are shown as typed.

For quick checks or tests without a database, pass `{ findOne: async () => null }` as the adapter.

Profanity, including evasions like `5h1t` and `s-h-i-t`, is an optional validator:

```ts
import { createNamespaceGuard } from "namespace-guard";
import { createEnglishProfanityValidator } from "namespace-guard/profanity-en";

const guard = createNamespaceGuard(
  { sources, validators: [createEnglishProfanityValidator({ mode: "evasion" })] },
  adapter,
);
```

It lets real names and places through (Scunthorpe, Dickson). Add your own users' names and towns with `allowlist`, and run it over the names you already have before switching it on.

## Text going to an LLM

Letters from other alphabets that look like Latin ones don't fool current models, but text flooded with them takes up to 5.7x the tokens to read, and the bill for each question can rise by up to 3.9x. Nobody reading the text can see the difference. Clean untrusted text before it reaches the model:

```ts
import { canonicalise, isClean, scan } from "namespace-guard";

canonicalise("shall поŧ be limited");                 // "shall not be limited"
canonicalise("Москва is the capital");                // unchanged: a real Russian word
canonicalise("поп-refundable", { strategy: "all" });  // "non-refundable"

isClean(text); // true only when canonicalise() would change nothing
scan(text);    // each finding, with a risk level
```

- The default strategy rewrites only words that show signs of tampering: mixed scripts, Latin letters no modern language uses, or odd capitals inside a word. Real Russian, Turkish or Sámi words are left alone, so it's safe on multilingual input.
- Use `strategy: "all"` only for text you know is Latin-script, such as English contracts. It also restores words where every letter was swapped.
- Keep the original for audit, and use `isClean()` to flag documents that were tampered with.
- A spending limit for each customer is worth having too.

## Comparing two strings

```ts
import { areConfusable, skeleton, confusableDistance, isDomainSpoof } from "namespace-guard";
import { CONFUSABLE_WEIGHTS } from "namespace-guard/confusable-weights";

areConfusable("paypal", "pa\u0443pal");   // true
skeleton("pa\u0443pal");                  // "paypal"
confusableDistance("paypal", "pa\u0443pal", { weights: CONFUSABLE_WEIGHTS }); // graded, with steps

// Domain labels: only registrable, single-script spoofs count
isDomainSpoof("\u0440\u0430\u0443\u0440\u0430\u04CF", "paypal", { weights: CONFUSABLE_WEIGHTS }); // { spoof: true, ... }
```

To find lookalike domains that are actually registered, use the `lookalike-domains` skill from the d0ma1n plugin.

## Command line

```bash
npx namespace-guard risk paypa1 --protect paypal          # score one name
npx namespace-guard audit-canonical ./users.json --json   # collisions before adding a unique index
npx namespace-guard attack-gen paypal --json              # realistic lookalikes to test with
```

## After upgrading

New releases can change what counts as a lookalike. Recompute any canonical or skeleton values you've stored after upgrading, and run `audit-canonical` before tightening a unique index.
