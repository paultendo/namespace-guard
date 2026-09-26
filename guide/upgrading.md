# Upgrading to 0.23

0.23 changes what counts as a lookalike. Most apps need no code changes, and most users won't notice anything except that fewer ordinary names are refused. Read this page if you store skeletons, tune risk thresholds, build risk results yourself, or use `canonicalise()`.

## At a glance

| If you | Then |
|---|---|
| store `skeleton()` output | recompute it: skeletons have changed |
| rely on `checkRisk()` blocking close spellings | they now warn; turn on `leetspeak` if you relied on it for `p4ypal` |
| build `RiskMatch` or `RiskCheckResult` objects yourself, in mocks or tests | add `evidence` and `canBlock` |
| write your own validators | they now get the name as typed as a second argument |
| use `canonicalise()`, `scan()` or `isClean()` | expect more of a tampered document to be rewritten |
| run the drift gate in CI | move the action-flip budget to 34 |

## Skeletons have changed

The maps now come from Unicode's latest confusables list (2026-08-06) and from confusable-vision's measurements, and they keep Unicode's ASCII entries: `1` and `|` as `l`, `0` as `o`, `m` as `rn`. So `microsoft` and `rnicrosoft` now share a skeleton, where before they didn't.

```ts run
skeleton("microsoft");                          // → "rnicrosoft"
skeleton("rnicrosoft");                         // → "rnicrosoft"
areConfusable("rnicrosoft", "microsoft");       // → true
areConfusable("paypa1", "paypal");              // → true
areConfusable("paypaI", "paypal");              // → true
```

If you store skeletons, for example in a column with a unique index to stop lookalike sign-ups, recompute them from the stored names after upgrading:

```ts title="A one-off backfill"
import { skeleton } from "namespace-guard";

for await (const user of db.user.findMany({ select: { id: true, handle: true } })) {
  await db.user.update({ where: { id: user.id }, data: { handleSkeleton: skeleton(user.handle) } });
}
```

Two existing names that now share a skeleton will make the backfill fail on the unique index. Run it without the index first and look at the collisions: they're the pairs that were already confusable.

## Risk scores: fewer false alarms

`checkRisk()` now blocks only when a name looks like a protected one. In 0.22, a name one or two letters from a protected or reserved name often blocked, whether or not the letters looked alike: `helper` against `help`, `gitlab` against `github`. On a 234,428-word dictionary, 0.22 blocked 10,525 words and warned on 166,642; 0.23 blocks 6, the reserved words themselves, and warns on 13.

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuard({
  reserved: ["help", "admin"],
  sources: [{ name: "user", column: "handle", scopeKey: "id" }],
  risk: { protect: ["github", "paypal"] },
}, adapter);

guard.checkRisk("helper").action;   // → "allow"
guard.checkRisk("gitlab").action;   // → "allow"
guard.checkRisk("githuh").action;   // → "warn"
guard.checkRisk("paypa1").action;   // → "block"
guard.checkRisk("hеlp").action;     // → "block"
```

What changed:

- **Close spellings warn.** One letter changed, added, dropped or swapped, where the letters don't look alike, scores at most one under the block threshold.
- **Added letters aren't matched.** `admins` and `paypal-support` show the protected word whole; the reader sees the extra letters.
- **Reserved names match by lookalikes only**, unless they're also in `protect`: `hell` is allowed, `hеlp` with a Cyrillic `е` blocks.
- **Leetspeak is an option.** `p4ypal` and `adm1n` warn by default. Set `risk: { leetspeak: true }` to block them, as 0.22 did by accident.
- **paypaI scores 100**, like `paypa1`.

See [Protect names](protect-names.md) for the full rules.

> **Careful** Two fields are new and required on risk results: `RiskMatch.evidence` (`"exact"`, `"lookalike"`, `"lookalike-extension"` or `"typo"`) and `RiskCheckResult.canBlock`. Code that only reads results needs nothing; mocks that build them need both. `matches` also lists the matches that can block first, whatever their scores.

## Validators get the name as typed

A validator is now called with the normalised name and, as a second argument, the name as typed. A capital and its lowercase form can look like different letters (Greek `Η` passes for `H`, `η` doesn't pass for `h`), so lookalike checks need the original.

```ts title="A custom validator"
const noCapitalI = async (normalized, context) =>
  /I/.test(context?.identifier ?? "") ? { available: false, message: "Use a lowercase l, not a capital I." } : null;
```

## Cleaning text for LLMs

`canonicalise()` now rewrites a word in full once it shows a sign of tampering, and folds letters with a stroke or hook (`ŧ`, `ɦ`) to the letter they're built on. On the flooded test contract, 0.22 left 1,485 of 1,532 lookalikes; 0.23 with `strategy: "all"` restores it byte for byte.

```ts run
canonicalise("shall поŧ be limited");   // → "shall not be limited"
isClean("Tɦİs");                        // → false
```

`isClean()` is now `true` exactly when `canonicalise()` would change nothing, and `scan()` reports letters folded this way with `source: "fold"`. A `threshold` you set is still a floor. [Text for LLMs](llm-text.md) has the details.

## Data and CI

- `CONFUSABLE_MAP_FULL` has 2,216 entries (was 1,425), `CONFUSABLE_MAP` 1,018 (was 613), and `CONFUSABLE_WEIGHTS` 2,300 pairs (was 322). See [Data and maps](data.md).
- The composability suite is `nfkc-tr39-divergence-v2`, with 34 vectors: set the drift gate's `--max-action-flips` to 34. A runtime whose Unicode predates 16.0 derives 31.
- The CLI's `calibrate` and `recommend` now sweep thresholds the way `checkRisk()` applies them, so their recommendations may shift a little. `namespace-guard risk` keeps the name's case, so `risk paypaI --protect paypal` blocks.

## Checklist

1. Upgrade: `npm install namespace-guard@0.23`.
2. If you store skeletons, recompute them.
3. If you relied on close spellings blocking, decide whether to turn on `leetspeak` or lower `blockThreshold`.
4. Update mocks that build risk results.
5. In CI, set the drift budget to 34.
6. Run your tests. The [CLI](cli.md) can score a sample of your real names before and after.

The full list is in the [changelog](changelog.md#v0-23-0).
