# Suggestions

When a name is taken, `check()` can offer free alternatives such as `sarah-2` or `sarah-dev`. This page covers the `suggest` option: the strategies that make the candidates, how to combine them or write your own, and how many you get back.

## Turn suggestions on

Add `suggest` to the guard's config. An empty object uses the defaults: the `sequential` and `random-digits` strategies, and up to 3 suggestions.

```ts run
const adapter = { findOne: async (source, value) => (value === "sarah" ? { id: "u1" } : null) };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  suggest: {},
}, adapter);

const result = await guard.check("sarah");
result.reason;             // → "taken"
result.suggestions.length; // → 3
result.suggestions[0];     // → "sarah-1"
result.suggestions[2];     // → "sarah1"
```

The first and third suggestions come from `sequential`, which is predictable. The second comes from `random-digits`, so it changes from run to run.

Suggestions only appear when the reason is `taken`. A name that is invalid or reserved gets none, since the person needs to change more than a suffix. They come from `check()`, and from `checkMany()` when you pass `{ skipSuggestions: false }`. `claim()` and the `assert` methods don't return them.

## How each suggestion is checked

A suggestion is a name that was free when the guard looked it up. Each candidate goes through the same checks as a typed name, apart from normalisation:

1. The format, the number-only rule and your reserved names, for every candidate at once. These need no queries.
2. Your validators, then a lookup in every source, for the candidates in batches of `max`, until `max` of them pass or the candidates run out.

If none pass, the result has no `suggestions` key. Because candidates aren't normalised, a custom generator has to return them in canonical form: lowercase, and matching your pattern.

> **Note** Suggestions aren't scored against your protected names. `claim()` does that when the person submits one.

## The strategies

Set `strategy` to one of these names. The examples are for `sarah` under the default pattern.

| Strategy | What it makes | For `sarah` |
|---|---|---|
| `sequential` | the name with 1 to 9 added, with and without a hyphen | `sarah-1`, `sarah1`, `sarah-2`, `sarah2` |
| `random-digits` | the name with a hyphen and a random number from 100 to 9999 | `sarah-4821`, `sarah-317` |
| `suffix-words` | the name with a hyphen and a word: dev, io, app, hq, pro, team, labs, hub, go, one | `sarah-dev`, `sarah-io`, `sarah-app` |
| `short-random` | the name with a hyphen and three random letters or digits | `sarah-x7k`, `sarah-m2p` |
| `scramble` | two neighbouring characters swapped | `asrah`, `sraah`, `saarh`, `sarha` |
| `similar` | one character dropped, one changed to a key next to it on a QWERTY keyboard, or a prefix (the, my, x, i) or suffix (x, o, i, z) added | `arah`, `sara`, `darah`, `thesarah`, `sarahx` |

A candidate longer than your pattern allows is dropped. `random-digits`, `suffix-words` and `short-random` only add to the name, so a name at the maximum length gets nothing from them. `sequential` makes room: for a name at or one short of the maximum, it also replaces the last character with a digit. `scramble` keeps the length, and `similar` includes names with one character dropped.

```ts run
const taken = new Set(["sarah", "sarah-1", "a-very-long-team-name-for-test"]);
const adapter = { findOne: async (source, value) => (taken.has(value) ? { id: "u1" } : null) };
const guardWith = (strategy) => createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  suggest: { strategy },
}, adapter);

(await guardWith("sequential").check("sarah")).suggestions;   // → ["sarah1", "sarah-2", "sarah2"]
(await guardWith("suffix-words").check("sarah")).suggestions; // → ["sarah-dev", "sarah-io", "sarah-app"]
(await guardWith("scramble").check("sarah")).suggestions;     // → ["asrah", "sraah", "saarh"]
(await guardWith("similar").check("sarah")).suggestions;      // → ["arah", "srah", "saah"]

// A 30-character name, the most the default pattern allows
(await guardWith("sequential").check("a-very-long-team-name-for-test")).suggestions;   // → ["a-very-long-team-name-for-tes1", "a-very-long-team-name-for-tes2", "a-very-long-team-name-for-tes3"]
(await guardWith("suffix-words").check("a-very-long-team-name-for-test")).suggestions; // → undefined
```

`sarah-1` is taken in this example, so `sequential` skips it and moves on to `sarah1`.

The random strategies give different names each time, so test their shape rather than their values:

```ts run
const adapter = { findOne: async (source, value) => (value === "sarah" ? { id: "u1" } : null) };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  suggest: { strategy: "short-random" },
}, adapter);

const { suggestions } = await guard.check("sarah");
suggestions.length;                                          // → 3
suggestions.every((name) => /^sarah-[a-z0-9]{3}$/.test(name)); // → true
```

> **Careful** `scramble` and `similar` make names that look like the taken one. They're the names an impersonator would try, and people who mix up `sarah` and `sarha` send messages to the wrong one. Use them where a near miss does no harm.

## Combine strategies

Pass an array, and the candidates are taken in turn: the first from each strategy in the order you list them, then the second from each, and so on. Repeats are dropped.

```ts run
const adapter = { findOne: async (source, value) => (value === "sarah" ? { id: "u1" } : null) };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  suggest: { strategy: ["suffix-words", "sequential"], max: 4 },
}, adapter);

(await guard.check("sarah")).suggestions; // → ["sarah-dev", "sarah-1", "sarah-io", "sarah1"]
```

The default, `["sequential", "random-digits"]`, works the same way: one predictable name, then one random one.

## Write your own

Pass a function instead of a name. It receives the canonical form of the taken name and returns candidates in the order you prefer them. They go through the same checks as the built-in strategies, so return more than you need.

```ts run
const adapter = { findOne: async (source, value) => (value === "sarah" ? { id: "u1" } : null) };
const guard = createNamespaceGuard({
  reserved: ["sarah-io"],
  sources: [{ name: "user", column: "handle" }],
  suggest: {
    strategy: (name) => [`${name}-io`, `The-Real-${name}`, `real-${name}`, `${name}-hq`],
  },
}, adapter);

(await guard.check("sarah")).suggestions; // → ["real-sarah", "sarah-hq"]
```

`sarah-io` is reserved and `The-Real-sarah` has capitals the pattern doesn't allow, so both are dropped.

The older `generate` option also takes a function. It still works, and if you set both, `generate` wins, but new code should use `strategy`.

## How many: max

`max` is the most suggestions returned, 3 by default. It is also the batch size: the guard validates and looks up `max` candidates at a time, each in every source, until it has enough. A larger `max` means more lookups for every taken name.

```ts run
const adapter = { findOne: async (source, value) => (value === "sarah" ? { id: "u1" } : null) };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  suggest: { strategy: "suffix-words", max: 5 },
}, adapter);

(await guard.check("sarah")).suggestions; // → ["sarah-dev", "sarah-io", "sarah-app", "sarah-hq", "sarah-pro"]
```

Your validators run on every candidate, so a moderation validator also keeps offensive suggestions out; see [Moderation](moderation.md). A validator that throws drops the candidate rather than failing the check.
