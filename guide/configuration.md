# Configuration

`createNamespaceGuard(config, adapter)` and `createNamespaceGuardWithProfile(profile, config, adapter)` take the same config object. Only `sources` is required. This page lists every option, then the three profiles and how your settings combine with them.

## All options

| Option | Type | Default | What it does |
|---|---|---|---|
| `sources` | `NamespaceSource[]` | required | the tables a name is looked up in; it must be free in all of them |
| `reserved` | `string[]`, `Set<string>` or `Record<string, string[]>` | none | names nobody can claim, optionally in categories with their own messages |
| `pattern` | `RegExp` | `/^[a-z0-9][a-z0-9-]{1,29}$/` | the format a name's canonical form must match |
| `allowPurelyNumeric` | `boolean` | `true` | accept names made only of digits, such as `123` or `12-34` |
| `normalizeUnicode` | `boolean` | `true` | apply NFKC when a name is normalised |
| `caseInsensitive` | `boolean` | `false` | ask the adapter to compare without case |
| `messages` | object | see [messages](#messages) | the messages for invalid, reserved, taken and numbers-only names |
| `validators` | `NamespaceValidator[]` | none | checks of your own, run before the database |
| `suggest` | object | off | offer free names when a name is taken |
| `cache` | object | off | keep adapter results in memory for a while |
| `risk` | object | see [risk](#risk) | how names that pass for protected ones are scored |

A profile sets `pattern`, `allowPurelyNumeric`, `normalizeUnicode`, the `invalid` message and `risk` for you; see [Profiles](#profiles).

## `sources`

A source is a table, collection or model that holds names. The guard asks the adapter about every source at once, and a name is taken if any of them has it.

| Field | Default | What it is |
|---|---|---|
| `name` | required | the table or model, as your adapter knows it (see [Adapters](adapters.md#pick-an-adapter)) |
| `column` | required | the column that holds the name; point it at a canonical column if you have one |
| `idColumn` | `"id"` | the primary key, compared with the scope to find the caller's own row. The Mongoose adapter looks up `_id` when it's unset |
| `scopeKey` | none | the key in the ownership scope that holds the caller's ID for this source; see [Let people keep their own name](claiming.md#let-people-keep-their-own-name) |

```ts run
const rows = { user: ["sarah"], organization: ["acme"] };
const adapter = { findOne: async (source, value) => (rows[source.name].includes(value) ? { id: "1" } : null) };

const guard = createNamespaceGuard({
  sources: [
    { name: "user", column: "handle_canonical", scopeKey: "id" },
    { name: "organization", column: "slug_canonical", scopeKey: "id" },
  ],
}, adapter);

await guard.check("acme");     // → { available: false, reason: "taken", source: "organization" }
await guard.check("sarah");    // → { available: false, reason: "taken", source: "user" }
await guard.check("new-team"); // → { available: true }
```

When more than one source has the name, `source` is the first of them in the order you listed. `sources: []` is allowed: the guard then checks format, reserved names and validators, and never calls the adapter.

## `reserved`

Names held back from everyone: routes such as `admin` and `settings`, your brand, words you don't want used. It takes three forms:

- a list, `["admin", "api"]`
- a `Set`, `new Set(["admin", "api"])`
- categories, `{ system: ["admin", "api"], brand: ["acme"] }`, each of which can have its own message

A reserved name gets `reason: "reserved"` and a `category`. With a list or a `Set`, the category is `"default"`.

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuard({
  reserved: {
    system: ["admin", "api", "settings"],
    brand: ["acme"],
    offensive: ["badword"],
  },
  sources: [{ name: "user", column: "handle" }],
  messages: {
    reserved: {
      system: "That's a page on our site.",
      brand: "That name belongs to Acme.",
    },
  },
}, adapter);

await guard.check("Admin");   // → { available: false, reason: "reserved", category: "system", message: "That's a page on our site." }
await guard.check("acme");    // → { available: false, reason: "reserved", category: "brand", message: "That name belongs to Acme." }
await guard.check("badword"); // → { available: false, reason: "reserved", category: "offensive", message: "That name is reserved. Try another one." }
```

A category without a message of its own gets the default. Set `messages.reserved` to a string to use one message for every category.

> **Note** Reserved names are normalised like any name, so `Admin` or a fullwidth `ＡＤＭＩＮ` in the list reserves `admin`. Before 0.23 the list was compared as written, and `Admin` matched nothing.

Reserved names are also protected against lookalikes, so `аdmin` with a Cyrillic `а` is refused by `claim()` and `assertClaimable()`. See [Protect names](protect-names.md#say-what-to-protect).

## `pattern`

The format a name must have, tested against its canonical form: trimmed, NFKC-normalised, lowercase, without a leading `@`. The default is `/^[a-z0-9][a-z0-9-]{1,29}$/`: 2 to 30 lowercase letters, digits and hyphens, not starting with a hyphen.

The canonical form is always lowercase, so a pattern that needs capitals never matches. When you change the pattern, change `messages.invalid` to describe it, since the default message describes the default pattern:

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  pattern: /^[a-z][a-z0-9_]{2,19}$/,
  messages: { invalid: "Use 3 to 20 letters, numbers or underscores, starting with a letter." },
}, adapter);

await guard.check("sarah_k");  // → { available: true }
await guard.check("Sarah_K");  // → { available: true } (checked as sarah_k)
await guard.check("sarah-k");  // → { available: false, reason: "invalid", message: "Use 3 to 20 letters, numbers or underscores, starting with a letter." }
await guard.check("1sarah");   // → { available: false, reason: "invalid" }
```

Suggestions read the longest name your pattern allows and don't offer anything longer. To allow names in other scripts, see [When to allow Unicode names](unicode-names.md#when-to-allow-unicode-names).

## `allowPurelyNumeric`

Set it to `false` to refuse names made only of digits, alone or in groups joined by hyphens: `123`, `2024`, `12-34`. A name with any letter in it passes. It's `true` for `createNamespaceGuard()`, and the `consumer-handle` and `org-slug` profiles set it to `false`.

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  allowPurelyNumeric: false,
  messages: { purelyNumeric: "Add at least one letter." },
}, adapter);

await guard.check("2024");   // → { available: false, reason: "invalid", message: "Add at least one letter." }
await guard.check("12-34");  // → { available: false, reason: "invalid" }
await guard.check("2024a");  // → { available: true }
```

## `normalizeUnicode`

With `true`, the default, a name goes through NFKC before anything else, so fullwidth `ｈｅｌｌｏ` becomes `hello`. With `false`, the guard only trims, lowercases and drops a leading `@`, and `ｈｅｌｌｏ` fails the default pattern:

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  normalizeUnicode: false,
}, adapter);

await guard.check("ｈｅｌｌｏ");  // → { available: false, reason: "invalid" }
normalize("ｈｅｌｌｏ", { unicode: false }); // → "ｈｅｌｌｏ"
```

Leave it on unless you have stored names that depend on the difference. If you turn it off, write your canonical column with `normalize(name, { unicode: false })`, or with the value `claim()` passes to your write. [Normalisation](unicode-names.md#normalisation) explains what NFKC folds.

## `caseInsensitive`

The guard lowercases a name before it looks it up, so an exact match only finds rows stored in lowercase. If your column holds names as people typed them, set `caseInsensitive: true` and the guard passes `{ caseInsensitive: true }` to every `findOne` call, so each adapter compares without case:

```ts run
const seen = [];
const adapter = { findOne: async (source, value, options) => { seen.push(options); return null; } };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  caseInsensitive: true,
}, adapter);

await guard.check("Sarah");
seen[0]; // → { caseInsensitive: true }
```

A canonical column is the better fix, since an exact match can use its unique index. See [Case-insensitive matching](adapters.md#case-insensitive-matching) for what each adapter sends, and [Store a canonical column](claiming.md#store-a-canonical-column).

## `messages`

| Message | Default | Used for |
|---|---|---|
| `invalid` | "Use 2-30 lowercase letters, numbers, or hyphens." | a name that doesn't match `pattern` |
| `purelyNumeric` | "Identifiers cannot be purely numeric." | a name of digits, when `allowPurelyNumeric` is `false` |
| `reserved` | "That name is reserved. Try another one." | a reserved name; a string, or one message per category |
| `taken` | "That name is already in use." | a name a source already has; a function that receives the source's `name` |

`taken` is a function, so the message can depend on where the name was found:

```ts run
const rows = { user: ["sarah"], organization: ["acme"] };
const adapter = { findOne: async (source, value) => (rows[source.name].includes(value) ? { id: "1" } : null) };
const guard = createNamespaceGuard({
  sources: [
    { name: "user", column: "handle" },
    { name: "organization", column: "slug" },
  ],
  messages: {
    taken: (source) => (source === "organization" ? "An organisation already uses that name." : "Someone already has that name."),
  },
}, adapter);

(await guard.check("acme")).message;  // → "An organisation already uses that name."
(await guard.check("sarah")).message; // → "Someone already has that name."
```

Other messages are set elsewhere:

- a validator returns its own message;
- a name refused as a lookalike of a protected name gets `enforceRisk()`'s message, which you change with the `messages` option of `enforceRisk()`, `assertClaimable()` or `claim()` (see [The guard](guard.md#enforcerisk));
- a write that loses the race in `claim()` gets its `takenMessage` option (see [Claiming names](claiming.md#options)).

## `validators`

Functions that check a name in ways the pattern can't: lookalike characters, invisible characters, offensive words, or a rule of your own. They run in the order you list them, after the format and reserved checks and before the database, so a refused name costs no query.

A validator receives the canonical form, and a second argument with the name as typed, `{ identifier }`. It resolves to `null` to let the name through, or `{ available: false, message }` to refuse it. If it throws, the name is refused with the error's message.

```ts run
const noDoubleHyphens = async (name) =>
  name.includes("--") ? { available: false, message: "Use one hyphen at a time." } : null;

const adapter = { findOne: async () => null };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  validators: [createInvisibleCharacterValidator(), noDoubleHyphens],
}, adapter);

await guard.check("sarah--k");  // → { available: false, reason: "invalid", message: "Use one hyphen at a time." }
await guard.check("sarah-k");   // → { available: true }
```

Validators also run on every suggestion, and one that throws drops that suggestion rather than failing the check. The built-in validators are covered in [Unicode names](unicode-names.md#what-the-validators-add) and [Moderation](moderation.md), and listed in [Functions](functions.md).

## `suggest`

When a name is taken, `check()` can offer free alternatives. Suggestions are off until you set `suggest`; `suggest: {}` turns them on with the defaults.

| Field | Default | What it does |
|---|---|---|
| `strategy` | `["sequential", "random-digits"]` | a strategy's name, a list of names taken in turn, or a function that returns candidates |
| `max` | `3` | the most suggestions returned, and how many candidates are checked at a time |
| `generate` | none | the older way to pass a function; if you set both, `generate` wins |

```ts run
const adapter = { findOne: async (source, value) => (value === "sarah" ? { id: "u1" } : null) };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  suggest: { strategy: "suffix-words", max: 2 },
}, adapter);

(await guard.check("sarah")).suggestions; // → ["sarah-dev", "sarah-io"]
```

[Suggestions](suggestions.md) covers the six strategies, combining them and writing your own.

## `cache`

Keeps each adapter result in memory, so the lookups repeated while someone types don't reach the database each time. Off until you set it; `cache: {}` turns it on with the defaults.

| Field | Default | What it does |
|---|---|---|
| `ttl` | `5000` | how long a result is kept, in milliseconds |
| `maxSize` | `1000` | how many results are kept; past this, the least recently used goes first |

The cache lives in one process's memory. [Cache lookups](adapters.md#cache-lookups) covers what to know before turning it on, and [The guard](guard.md#clearcache-and-cachestats) covers `clearCache()` and `cacheStats()`.

## `risk`

The defaults for scoring names against the names you protect. `checkRisk()`, `enforceRisk()`, `assertClaimable()` and `claim()` use them, and options passed to a call override them for that call.

| Field | Default | What it does |
|---|---|---|
| `protect` | none | the names to protect |
| `includeReserved` | `true` | protect your reserved names too, against lookalikes only |
| `leetspeak` | `false` | count digits and symbols standing for letters (`4` for `a`) as lookalikes |
| `warnThreshold` | `45` | the score at which the action is `warn` |
| `blockThreshold` | `70` | the score at which the action is `block` |
| `maxMatches` | `3` | how many close protected names a result lists |

Thresholds are rounded and kept between 0 and 100, and a `blockThreshold` at or below `warnThreshold` is raised to one above it.

> **Note** With no `protect` list, `enforceRisk()`, `assertClaimable()` and `claim()` protect a built-in list, `DEFAULT_PROTECTED_TOKENS` (`admin`, `support`, `billing`, `login` and 11 more). `checkRisk()` doesn't: with no `protect` list it scores against your reserved names only. Setting `protect` replaces the built-in list.

[Protect names](protect-names.md) explains the scores, what counts as a lookalike, and how to tune the thresholds.

## Profiles

`createNamespaceGuardWithProfile(profile, config, adapter)` starts from one of three sets of defaults. They're exported as `NAMESPACE_PROFILES`:

| Setting | `consumer-handle` | `org-slug` | `developer-id` |
|---|---|---|---|
| For | public usernames | team and workspace URLs | package names, internal IDs |
| `pattern` | `/^[a-z0-9][a-z0-9-]{1,29}$/` | `/^[a-z0-9][a-z0-9-]{1,39}$/` | `/^[a-z0-9][a-z0-9-]{1,49}$/` |
| Length | 2 to 30 | 2 to 40 | 2 to 50 |
| `invalid` message | "Use 2-30 lowercase letters, numbers, or hyphens." | "Use 2-40 lowercase letters, numbers, or hyphens." | "Use 2-50 lowercase letters, numbers, or hyphens." |
| `allowPurelyNumeric` | `false` | `false` | `true` |
| `normalizeUnicode` | `true` | `true` | `true` |
| `risk.warnThreshold` | `45` | `40` | `35` |
| `risk.blockThreshold` | `70` | `65` | `60` |
| `risk.maxMatches` | `3` | `5` | `5` |
| `risk.includeReserved` | `true` | `true` | `true` |
| `risk.leetspeak` | `false` | `false` | `false` |
| `risk.protect` | `[]` | `[]` | `[]` |

```ts run
NAMESPACE_PROFILES["org-slug"].risk.blockThreshold;   // → 65
NAMESPACE_PROFILES["developer-id"].allowPurelyNumeric; // → true
Object.keys(NAMESPACE_PROFILES);                        // → ["consumer-handle", "org-slug", "developer-id"]
```

The lower thresholds of `org-slug` and `developer-id` warn and block on names a little further from a protected one. A close spelling scores at most one under the block threshold, so under `org-slug` it scores at most 64.

## How your settings combine with a profile

Your config goes on top of the profile:

- **`pattern`, `allowPurelyNumeric` and `normalizeUnicode`**: yours if you set them, otherwise the profile's.
- **`messages.invalid`**: the profile's message describes the profile's pattern, so it's used only when you set neither `pattern` nor `messages.invalid`. If you set a pattern of your own, set its message too, or you get the default "Use 2-30 lowercase letters, numbers, or hyphens.".
- **`risk`**: merged field by field. `risk: { protect: ["acme"] }` adds your protected names and keeps the profile's thresholds.
- **Everything else** (`sources`, `reserved`, `caseInsensitive`, the other `messages`, `validators`, `suggest`, `cache`) comes from your config alone, since profiles don't set it.

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuardWithProfile("org-slug", {
  sources: [{ name: "organization", column: "slug" }],
  risk: { protect: ["github"] },
}, adapter);

await guard.check("a");            // → { available: false, reason: "invalid", message: "Use 2-40 lowercase letters, numbers, or hyphens." }
await guard.check("2024");         // → { available: false, reason: "invalid", message: "Identifiers cannot be purely numeric." }
guard.checkRisk("githuh").score;   // → 64 (org-slug's block threshold is 65)
guard.checkRisk("paypa1").action;  // → "allow" (paypal isn't protected here)

const own = createNamespaceGuardWithProfile("consumer-handle", {
  sources: [{ name: "user", column: "handle" }],
  pattern: /^[a-z0-9_]{3,15}$/,
  messages: { invalid: "Use 3 to 15 letters, numbers or underscores." },
  allowPurelyNumeric: true,
  risk: { protect: ["github"], blockThreshold: 80 },
}, adapter);

await own.check("ab");             // → { available: false, reason: "invalid", message: "Use 3 to 15 letters, numbers or underscores." }
await own.check("2024");           // → { available: true }
own.checkRisk("githuh").score;     // → 79 (a close spelling stays one under your block threshold)
```
