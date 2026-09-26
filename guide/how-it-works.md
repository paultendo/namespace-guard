# How it works

A name goes through the same steps every time, in the same order, and the first step it fails decides the answer. This page walks through them and shows which call runs which.

## The steps

1. **Normalise.** Trim spaces, apply NFKC (so fullwidth `ｈｅｌｌｏ` becomes `hello`), lowercase, and drop a leading `@`. The result is the name's canonical form: the one you store and compare.
2. **Format.** The canonical form must match the pattern: by default 2 to 30 lowercase letters, digits and hyphens, not starting with a hyphen. Profiles can also refuse names made only of digits.
3. **Reserved.** Names you hold back, such as `admin` or your brand, in categories with their own messages.
4. **Validators.** Checks you add: lookalike characters, invisible characters, profanity, or anything of your own. They run in the order you list them.
5. **Database.** Every source is queried in parallel. If any has the name, it's taken, unless it belongs to the person asking (see [ownership scoping](claiming.md)).
6. **Protected names.** Separately, the name is scored against the names you protect: `rnicrosoft` against `microsoft`. A high enough score blocks it.

```ts run
normalize("  @Sarah ");        // → "sarah"
normalize("ｈｅｌｌｏ");          // → "hello"
normalize("Straße");           // → "straße"
```

Steps 1 to 5 answer "is it free?". Step 6 answers "does it pass for someone else?". They're separate because you may want to treat them differently: refuse a taken name outright, but show a softer message for one that is close to a protected name.

## Which call runs which

| Call | Steps | What you get |
|---|---|---|
| `guard.check(name)` | 1 to 5 | a result: `{ available: true }` or `{ available: false, reason, message }` |
| `guard.assertAvailable(name)` | 1 to 5 | nothing, or it throws with the message |
| `guard.checkRisk(name)` | 1, 6 | a score from 0 to 100, an action (`allow`, `warn` or `block`) and the closest protected names |
| `guard.enforceRisk(name)` | 1, 6 | `{ allowed, action, risk }` under your thresholds |
| `guard.assertClaimable(name)` | 1 to 6 | nothing, or it throws with the message |
| `guard.claim(name, write)` | 1 to 6, then your write | `{ claimed: true, normalized, value }` or `{ claimed: false, normalized, reason: "unavailable", message }` |
| `guard.checkMany(names)` | 1 to 5, for each | a record of results |

Use `check()` while someone types, to show whether a name is free. Use `claim()` when they submit, so the check and the write happen together.

```ts run
const adapter = { findOne: async (source, value) => (value === "sarah" ? { id: "u1" } : null) };
const guard = createNamespaceGuardWithProfile("consumer-handle", {
  reserved: ["admin"],
  sources: [{ name: "user", column: "handle", scopeKey: "id" }],
  risk: { protect: ["paypal"] },
}, adapter);

(await guard.check("paypa1")).available;         // → true
guard.checkRisk("paypa1").action;                // → "block"
(await guard.claim("paypa1", async () => "saved")).claimed; // → false
(await guard.claim("my-new-app", async () => "saved")).claimed; // → true
```

`paypa1` is free, since nobody has it, but it passes for `paypal`, so `claim()` refuses it.

## What a result looks like

`check()` returns `{ available: true }`, or `{ available: false }` with a `reason` and a `message` you can show:

| `reason` | Why | Also |
|---|---|---|
| `invalid` | the format, a number-only name, or a validator refused it | `message` |
| `reserved` | it's on your reserved list | `category`: the category's name, or `"default"` for a plain list |
| `taken` | a source already has it | `source`, and `suggestions` if you turned them on |

Messages can be changed with the `messages` option; see [Configuration](configuration.md).

## Where the lookalike data comes from

The characters that pass for Latin letters come from Unicode's confusables list and from [confusable-vision](where-the-data-comes-from.md), which measures how alike characters look in 322 fonts at the size people read them. [Protect names](protect-names.md) explains how the score in step 6 uses them.
