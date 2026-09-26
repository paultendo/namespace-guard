# Protect names

Some names matter more than others: your brand, your staff, your biggest customers. namespace-guard refuses names made to pass for them, such as `rnicrosoft` for `microsoft`, `paypaI` with a capital I for `paypal`, or `раураl` spelt in Cyrillic.

## Say what to protect

List the names in `risk.protect`. Reserved names are protected too, against lookalikes only, so `аdmin` with a Cyrillic `а` is refused but `hell` isn't refused for being close to `help`. Set `includeReserved: false` to leave reserved names out.

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuardWithProfile("consumer-handle", {
  reserved: ["admin", "support"],
  sources: [{ name: "user", column: "handle", scopeKey: "id" }],
  risk: { protect: ["microsoft", "paypal", "github"] },
}, adapter);

guard.checkRisk("rnicrosoft").action;   // → "block"
guard.checkRisk("paypa1").action;       // → "block"
guard.checkRisk("paypaI").action;       // → "block"
guard.checkRisk("раураl").action;       // → "block"
guard.checkRisk("my-new-app").action;   // → "allow"
guard.checkRisk("аdmin").action;        // → "block"
guard.checkRisk("admit").action;        // → "allow"
```

`assertClaimable()` and `claim()` run this for you. `checkRisk()` is for when you want the score itself, for instance to show a warning while someone types.

## What counts as passing for a name

A name is blocked when it looks like a protected one: its letters are the protected name's letters or their lookalikes, and nothing else. That covers:

- lookalikes from Unicode's list and from [confusable-vision's measurements](where-the-data-comes-from.md): Cyrillic `а` for `a`, Greek `ο` for `o`;
- ASCII tricks Unicode lists: `rn` for `m`, `1` and `|` for `l`, `0` for `o`;
- a capital I for l, which reads the same where names are shown as typed: `paypaI` is stored as `paypai` but displayed as `paypaI`.

A name that is only close in spelling, one letter changed, added, dropped or swapped where the letters don't look alike, is a typo, not a lookalike. It warns at most:

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle", scopeKey: "id" }],
  risk: { protect: ["github", "paypal"] },
}, adapter);

guard.checkRisk("githuh").action;   // → "warn"
guard.checkRisk("paypax").action;   // → "warn"
guard.checkRisk("gitlab").action;   // → "allow"
guard.checkRisk("helper").action;   // → "allow"
```

`gitlab` differs from `github` by two letters that don't look alike, so a reader sees a different word. A protected word with letters added, such as `github-fan`, isn't matched either: the reader sees the whole protected word and the extra letters. If you want names that start with a protected word refused, add them to `reserved` or write a validator.

## Leetspeak

Digits and symbols standing for letters, such as `p4ypal` or `adm1n`, read as the word to many people, but they don't look like it, so by default they only warn. Turn on `leetspeak` to count them as lookalikes:

```ts run
const adapter = { findOne: async () => null };
const strict = createNamespaceGuard({
  sources: [{ name: "user", column: "handle", scopeKey: "id" }],
  risk: { protect: ["paypal"], leetspeak: true },
}, adapter);

strict.checkRisk("p4ypal").action;   // → "block"
strict.checkRisk("p4yp4l").action;   // → "block"
```

## Scores and thresholds

`checkRisk()` gives a score from 0 to 100. At 45 or more it warns; at 70 or more it blocks. Change them with `warnThreshold` and `blockThreshold`:

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle", scopeKey: "id" }],
  risk: { protect: ["paypal"] },
}, adapter);

const risk = guard.checkRisk("paypa1");
risk.score;                   // → 100
risk.action;                  // → "block"
risk.matches[0].target;       // → "paypal"
```

`matches` lists the closest protected names, with their scores and the reasons: a skeleton collision (both names reduce to the same thing once lookalikes are replaced), the number of lookalike swaps, a change of script.

`enforceRisk()` turns the score into a yes or no, and can fail on warnings too:

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle", scopeKey: "id" }],
  risk: { protect: ["github"] },
}, adapter);

guard.enforceRisk("githuh").allowed;                     // → true
guard.enforceRisk("githuh", { failOn: "warn" }).allowed; // → false
```

> **Tip** Tune thresholds on your own names rather than by feel. The [CLI](cli.md) can generate attacks against your protected names, score a sample of real sign-ups, and suggest thresholds that block the attacks without refusing real people.

## Options

| Option | Default | What it does |
|---|---|---|
| `protect` | none | names to protect |
| `includeReserved` | `true` | protect your reserved names too |
| `leetspeak` | `false` | count digits and symbols standing for letters (`4` for `a`) as lookalikes |
| `warnThreshold` | `45` | the score at which `checkRisk()` warns |
| `blockThreshold` | `70` | the score at which it blocks |
| `maxMatches` | `3` | how many close protected names to return |
