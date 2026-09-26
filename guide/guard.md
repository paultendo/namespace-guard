# The guard

A guard holds your configuration and your adapter, and has a method for each way of checking a name. This page covers every method: what it takes, what it does, what it returns, and when to use it.

## Create a guard

`createNamespaceGuard(config, adapter)` makes a guard from your config alone. `createNamespaceGuardWithProfile(profile, config, adapter)` starts from one of three profiles, `consumer-handle`, `org-slug` or `developer-id`, and puts your config on top. Both return the same kind of guard, typed `NamespaceGuard`.

```ts run
const adapter = { findOne: async () => null };

const plain = createNamespaceGuard({ sources: [{ name: "user", column: "handle" }] }, adapter);
const handles = createNamespaceGuardWithProfile("consumer-handle", { sources: [{ name: "user", column: "handle" }] }, adapter);

await plain.check("2024");    // → { available: true }
await handles.check("2024");  // → { available: false, reason: "invalid", message: "Identifiers cannot be purely numeric." }

let message;
try { createNamespaceGuardWithProfile("team", { sources: [] }, adapter); } catch (e) { message = e.message; }
message; // → "Unknown namespace profile: team"
```

Use a profile unless you need something none of them gives. [Configuration](configuration.md) lists every option, what each profile sets, and how the two combine.

Make one guard for your app and share it, as [One guard for the app](frameworks.md#one-guard-for-the-app) shows. Its cache, if you turn one on, only helps calls made through the same guard.

## Which method to use

| Method | Checks | Returns | Use it |
|---|---|---|---|
| `check(name, scope?)` | format, reserved, validators, database | `CheckResult` | while someone types |
| `checkMany(names, scope?, options?)` | the same, for each name | a record of `CheckResult` | imports, bulk checks |
| `checkRisk(name, options?)` | lookalikes of protected names | `RiskCheckResult` | to show a warning, or score a name |
| `enforceRisk(name, options?)` | the same, as a yes or no | `EnforceRiskResult` | a decision on lookalikes, without throwing |
| `assertAvailable(name, scope?)` | as `check()` | nothing, or throws | code that throws on bad input, where lookalikes don't matter |
| `assertClaimable(name, scope?, options?)` | `check()`, then `enforceRisk()` | nothing, or throws | the same, with lookalikes |
| `claim(name, write, options?)` | as `assertClaimable()`, then your write | `ClaimResult` | when someone submits |
| `validateFormat(name)` | format, reserved | a message or `null` | instant feedback, no database |
| `validateFormatOnly(name)` | format | a message or `null` | the same, without reserved names |
| `normalize(name)` | none | the canonical form | to store or compare a name |
| `clearCache()`, `cacheStats()` | none | nothing; counts | with `cache` turned on |

"Format" means the pattern, and the numbers-only rule when `allowPurelyNumeric` is `false`. [How it works](how-it-works.md) shows the order the checks run in.

## `check()`

`check(name, scope?, options?): Promise<CheckResult>`

Normalises the name, then checks its format, your reserved names, your validators, and every source, stopping at the first refusal. It doesn't score lookalikes of protected names; `claim()` and `assertClaimable()` add that.

It returns one of four shapes:

| Result | When |
|---|---|
| `{ available: true }` | the name is free |
| `{ available: false, reason: "invalid", message }` | it fails the pattern or the numbers-only rule, or a validator refuses it |
| `{ available: false, reason: "reserved", message, category }` | it's reserved; `category` is `"default"` unless you used categories |
| `{ available: false, reason: "taken", message, source, suggestions? }` | a source has it; `suggestions` only if `suggest` is set and some were found |

```ts run
const adapter = { findOne: async (source, value) => (value === "sarah" ? { id: "u1" } : null) };
const guard = createNamespaceGuard({
  reserved: ["admin"],
  sources: [{ name: "user", column: "handle", scopeKey: "id" }],
  suggest: { strategy: "suffix-words" },
}, adapter);

await guard.check("my-new-app");          // → { available: true }
await guard.check("a");                   // → { available: false, reason: "invalid", message: "Use 2-30 lowercase letters, numbers, or hyphens." }
await guard.check("Admin");               // → { available: false, reason: "reserved", category: "default", message: "That name is reserved. Try another one." }
await guard.check("sarah");               // → { available: false, reason: "taken", source: "user", message: "That name is already in use.", suggestions: ["sarah-dev", "sarah-io", "sarah-app"] }
await guard.check("sarah", { id: "u1" }); // → { available: true } (sarah's own row)
```

`scope` holds the caller's IDs, so a row that belongs to them doesn't count as taken; see [Let people keep their own name](claiming.md#let-people-keep-their-own-name). Pass `{ skipSuggestions: true }` as the third argument to skip suggestions for one call.

Use `check()` while someone types a name, to show whether it's free. It doesn't reserve the name, so check again when they submit; `claim()` does both.

## `checkMany()`

`checkMany(names, scope?, options?): Promise<Record<string, CheckResult>>`

Runs `check()` on every name at once, with the same scope, and returns the results keyed by each name as you passed it. Suggestions are skipped unless you pass `{ skipSuggestions: false }`, since they cost extra lookups for every taken name.

```ts run
const adapter = { findOne: async (source, value) => (value === "sarah" ? { id: "u1" } : null) };
const guard = createNamespaceGuard({
  reserved: ["admin"],
  sources: [{ name: "user", column: "handle" }],
}, adapter);

await guard.checkMany(["sarah", "admin", "new-team", "a"]); // → { sarah: { reason: "taken" }, admin: { reason: "reserved" }, "new-team": { available: true }, a: { reason: "invalid" } }
```

Use it for imports, forms that create several names at once, or a list you want to check before a migration. Every name queries every source at the same time, so split a long list into chunks. See [Check many names at once](claiming.md#check-many-names-at-once).

## `checkRisk()`

`checkRisk(name, options?): RiskCheckResult`

Scores how closely a name passes for one of your protected names, from 0 to 100, and turns the score into an action. It's synchronous and doesn't query the database, check the format or run validators. The protected names are `risk.protect` and, unless `includeReserved` is `false`, your reserved names.

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuard({
  reserved: ["admin"],
  sources: [{ name: "user", column: "handle" }],
  risk: { protect: ["paypal", "github", "microsoft"] },
}, adapter);

const risk = guard.checkRisk("paypa1");
risk.score;       // → 100
risk.level;       // → "high"
risk.action;      // → "block"
risk.canBlock;    // → true
risk.matches[0];  // → { target: "paypal", score: 94, distance: 0.35, chainDepth: 1, skeletonEqual: true, evidence: "lookalike", reasons: ["TR39 skeleton collision"] }
risk.reasons;     // → [{ code: "confusable-target", weight: 94 }, { code: "skeleton-collision", weight: 20 }]

guard.checkRisk("githuh");     // → { score: 69, action: "warn", canBlock: false }
guard.checkRisk("my-new-app"); // → { score: 0, level: "low", action: "allow", canBlock: false, reasons: [], matches: [] }
```

Use it to show a warning while someone types, or to log how close a name came. To refuse names, use `claim()` or `assertClaimable()`, which call `enforceRisk()` for you.

### The result

| Field | What it is |
|---|---|
| `identifier` | the name as you passed it |
| `normalized` | its canonical form |
| `score` | 0 to 100: the sum of the reasons' weights, up to 100 |
| `level` | `"low"` below the warn threshold, `"medium"` from it, `"high"` from the block threshold |
| `action` | `"allow"`, `"warn"` or `"block"`, on the same thresholds |
| `canBlock` | `false` when nothing in the name is visual; its score is then held one under the block threshold |
| `reasons` | what added to the score, highest weight first: `{ code, message, weight }` |
| `matches` | the closest protected names, up to `maxMatches`, those that can block first |

Each match has:

| Field | What it is |
|---|---|
| `target` | the protected name |
| `score` | how close the name comes to it, 0 to 100 |
| `distance` | the weighted edit distance from [`confusableDistance()`](comparing-names.md#confusabledistance) |
| `chainDepth` | how many steps of that path aren't matches |
| `skeletonEqual` | whether the two share a skeleton |
| `evidence` | how the name matched, below |
| `reasons` | the signals for this match, as text |

### Evidence and canBlock

A match's `evidence` says what the name shows of the protected name, and decides whether it can block:

| `evidence` | What it means | Example | At most |
|---|---|---|---|
| `"exact"` | it is the protected name | `paypal` for `paypal` | block |
| `"lookalike"` | the same skeleton, with or without case, or only lookalikes and invisible characters differ | `paypa1` for `paypal` | block |
| `"lookalike-extension"` | a lookalike of the whole protected name, with letters added | `rnicrosoft-support` for `microsoft` | warn |
| `"typo"` | one letter changed, added, dropped or swapped, not a lookalike, against a name in `protect` | `githuh` for `github` | warn |

A reserved name that isn't also in `protect` matches by lookalikes only, never as a typo. A protected name with letters added or dropped at either end, such as `paypal-fan` or `admins`, isn't matched at all.

`canBlock` is `true` when the top match is `exact` or `lookalike`, or when the name has lookalike, invisible or mixed-script characters of its own. When it's `false`, the score stops one under the block threshold, so the name can warn but not block:

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  risk: { protect: ["microsoft"] },
}, adapter);

guard.checkRisk("rnicrosoft-support").matches[0].evidence; // → "lookalike-extension"
guard.checkRisk("rnicrosoft-support");                     // → { score: 69, action: "warn", canBlock: false }
guard.checkRisk("microsoſt");                              // → { normalized: "microsost", score: 69, action: "warn", canBlock: false }
guard.checkRisk("sаrah");                                  // → { score: 35, action: "allow", canBlock: true } (a Cyrillic а, but no protected name near)
```

The reason codes:

| Code | Added when |
|---|---|
| `confusable-target` | there's a match; its weight is the top match's score |
| `skeleton-collision` | the top match shares the name's skeleton |
| `mixed-script` | the name mixes Latin letters with letters of another script |
| `invisible-character` | the name has default-ignorable characters, such as a zero-width space |
| `confusable-character` | the name has non-ASCII characters from the lookalike map |
| `divergent-mapping` | the name has characters that NFKC and Unicode's list read differently, such as `ſ` |
| `deep-chain` | the top match is a lookalike that took two or more swaps |

### Options

Each option overrides the guard's `risk` config for this call.

| Option | Default | What it does |
|---|---|---|
| `protect` | `risk.protect` | the names to protect; replaces the configured list for this call |
| `includeReserved` | `true` | protect reserved names too |
| `leetspeak` | `false` | count digits and symbols standing for letters as lookalikes |
| `warnThreshold` | `45` | the score at which the action is `warn` |
| `blockThreshold` | `70` | the score at which it's `block` |
| `maxMatches` | `3` | how many matches to return |
| `map` | `CONFUSABLE_MAP_FULL` | the character map used for skeletons and distances |

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  risk: { protect: ["paypal"] },
}, adapter);

guard.checkRisk("paypa1", { protect: ["github"] }).action;  // → "allow" (paypal isn't protected for this call)
guard.checkRisk("p4ypal").action;                           // → "warn"
guard.checkRisk("p4ypal", { leetspeak: true }).action;      // → "block"
```

With no `protect` list anywhere, `checkRisk()` scores against your reserved names only. It doesn't fall back to the built-in list that `enforceRisk()` uses. [Protect names](protect-names.md) explains the scores in full.

## `enforceRisk()`

`enforceRisk(name, options?): EnforceRiskResult`

Runs `checkRisk()` and turns the action into a decision: `{ allowed, action, message?, risk }`. `message` is set only when the name isn't allowed, and `risk` is the full `checkRisk()` result.

| Option | Default | What it does |
|---|---|---|
| `failOn` | `"block"` | `"block"` refuses blocked names only; `"warn"` refuses warned names too |
| `messages` | see below | `{ warn, block }`: the message for a refused name at each level |
| the `checkRisk()` options | as above | `protect`, `includeReserved`, `leetspeak`, the thresholds, `maxMatches` and `map` |

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  risk: { protect: ["paypal", "github"] },
}, adapter);

guard.enforceRisk("paypa1");                    // → { allowed: false, action: "block", message: "Identifier is too confusable with a protected name. Closest protected target: \"paypal\"." }
guard.enforceRisk("githuh");                    // → { allowed: true, action: "warn" }
guard.enforceRisk("githuh", { failOn: "warn" }); // → { allowed: false, action: "warn", message: "Identifier is potentially confusable with a protected name. Closest protected target: \"github\"." }
guard.enforceRisk("githuh", { failOn: "warn", messages: { warn: "That's too close to GitHub." } }).message; // → "That's too close to GitHub."
```

If neither the call nor the config sets `protect`, `enforceRisk()` protects `DEFAULT_PROTECTED_TOKENS`: `admin`, `administrator`, `support`, `help`, `security`, `billing`, `payments`, `staff`, `moderator`, `root`, `system`, `api`, `www`, `mail` and `login`.

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuard({ sources: [{ name: "user", column: "handle" }] }, adapter);

guard.checkRisk("adrnin").action;     // → "allow" (no protected names)
guard.enforceRisk("adrnin").allowed;  // → false (admin is on the built-in list)
```

Use it when you want the decision without throwing, or when you want to refuse warnings too. `assertClaimable()` and `claim()` take the same options and call it for you.

## `assertAvailable()`

`assertAvailable(name, scope?): Promise<void>`

Runs `check()`, and throws an `Error` with the result's message if the name isn't available. Returns nothing when it is.

```ts run
const adapter = { findOne: async (source, value) => (value === "sarah" ? { id: "u1" } : null) };
const guard = createNamespaceGuard({
  reserved: ["admin"],
  sources: [{ name: "user", column: "handle", scopeKey: "id" }],
}, adapter);

await guard.assertAvailable("admin").catch((e) => e.message);        // → "That name is reserved. Try another one."
await guard.assertAvailable("sarah").catch((e) => e.message);        // → "That name is already in use."
await guard.assertAvailable("sarah", { id: "u1" }).then(() => "ok"); // → "ok"
```

Use it in code that throws on bad input, such as a server action or tRPC procedure, for names nobody else sees. It doesn't check lookalikes of protected names; for public names use `assertClaimable()`.

## `assertClaimable()`

`assertClaimable(name, scope?, options?): Promise<void>`

Runs `check()`, then `enforceRisk()` with your options, and throws an `Error` with the message of the first that refuses the name. The options are those of `enforceRisk()`.

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  risk: { protect: ["paypal", "github"] },
}, adapter);

await guard.assertClaimable("my-new-app").then(() => "ok");                     // → "ok"
await guard.assertClaimable("paypa1").catch((e) => e.message);                  // → "Identifier is too confusable with a protected name. Closest protected target: \"paypal\"."
await guard.assertClaimable("githuh").then(() => "ok");                         // → "ok"
await guard.assertClaimable("githuh", {}, { failOn: "warn" }).catch(() => "refused"); // → "refused"
```

Use it where you write the name yourself and want a throw on anything wrong. It leaves a gap between the check and your write; `claim()` closes it. [assertAvailable or assertClaimable](claiming.md#assertavailable-or-assertclaimable) compares the three.

## `claim()`

`claim(name, write, options?): Promise<ClaimResult<T>>`

Runs the same checks as `assertClaimable()`, then calls `write` with the name's canonical form. If your write throws a unique-constraint error, because someone else took the name in the meantime, `claim()` returns a refusal instead of throwing. Any other error is thrown again.

It returns `{ claimed: true, normalized, value }`, where `value` is what your write returned, or `{ claimed: false, normalized, reason: "unavailable", message }`.

```ts run
const handles = new Set(["sarah"]);
const adapter = { findOne: async (source, value) => (handles.has(value) ? { id: "u1" } : null) };
const insert = async (canonical) => { handles.add(canonical); return { handle: canonical }; };

const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle_canonical", scopeKey: "id" }],
  risk: { protect: ["paypal"] },
}, adapter);

await guard.claim("  Tom ", insert);  // → { claimed: true, normalized: "tom", value: { handle: "tom" } }
await guard.claim("sarah", insert);   // → { claimed: false, reason: "unavailable", message: "That name is already in use." }
await guard.claim("paypa1", insert);  // → { claimed: false, reason: "unavailable" }
```

| Option | Default | What it does |
|---|---|---|
| `scope` | none | the caller's IDs, as for `check()` |
| `isUniqueViolation` | `isLikelyUniqueViolationError` | decides whether a write error means the name was taken |
| `takenMessage` | "That name is already in use." | the message when the write loses the race |
| the `enforceRisk()` options | as above | `failOn`, `messages`, `protect` and the rest |

Use it when someone submits a name. Store the canonical form it passes to your write, in a column with a unique index. [Claiming names](claiming.md) covers the index, the race and ownership.

## `validateFormat()` and `validateFormatOnly()`

`validateFormat(name): string | null`

`validateFormatOnly(name): string | null`

Both normalise the name and return the message a refusal would show, or `null` if the name passes. Neither queries the database or runs validators, and both are synchronous.

- `validateFormat()` checks the pattern, the numbers-only rule and your reserved names.
- `validateFormatOnly()` checks the pattern and the numbers-only rule.

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuardWithProfile("consumer-handle", {
  reserved: ["admin"],
  sources: [{ name: "user", column: "handle" }],
}, adapter);

guard.validateFormat("Admin");      // → "That name is reserved. Try another one."
guard.validateFormat("a");          // → "Use 2-30 lowercase letters, numbers, or hyphens."
guard.validateFormat("2024");       // → "Identifiers cannot be purely numeric."
guard.validateFormat("sarah");      // → null
guard.validateFormatOnly("Admin");  // → null
```

Use them for feedback on every keystroke, before a name is worth a database query. `validateFormatOnly()` checks the shape of a name alone; the CLI's `attack-gen` uses it to tell which generated names your pattern accepts.

## `normalize()`

`normalize(name, options?): string`

The canonical form of a name: trimmed, NFKC-normalised, lowercase, without a leading `@`. It's the standalone [`normalize()`](functions.md#normalize), so it applies NFKC whatever the guard's `normalizeUnicode` setting; pass `{ unicode: false }` to skip it.

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuard({ sources: [] }, adapter);

guard.normalize("  @Sarah ");  // → "sarah"
guard.normalize("ｈｅｌｌｏ");   // → "hello"
```

Use it to write the canonical column outside `claim()`, such as in a backfill, or to compare names the way the guard does.

## `clearCache()` and `cacheStats()`

`clearCache(): void`

`cacheStats(): { size, hits, misses }`

With `cache` set in the config, the guard keeps adapter results in memory. `cacheStats()` reports how many results are held and how many lookups were answered from the cache or missed it. `clearCache()` empties the cache and resets the counts. Without `cache`, both work and the counts stay at zero.

```ts run
let queries = 0;
const adapter = { findOne: async () => { queries++; return null; } };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  cache: { ttl: 5000 },
}, adapter);

await guard.check("sarah");
await guard.check("Sarah");
queries;             // → 1
guard.cacheStats();  // → { size: 1, hits: 1, misses: 1 }
guard.clearCache();
guard.cacheStats();  // → { size: 0, hits: 0, misses: 0 }
```

Call `clearCache()` after your own writes if you show `check()` results straight after them, and after a database error if you retry at once. See [Cache lookups](adapters.md#cache-lookups).
