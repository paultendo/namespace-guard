# Unicode names

By default namespace-guard accepts only lowercase ASCII letters, digits and hyphens. That alone refuses a Cyrillic `а` in `аdmin`, a zero-width space hidden inside `paypal` and a right-to-left override. This page covers what normalisation and the Unicode validators add, the order they run in, and what to set up if you decide to allow names in other scripts.

## What the default pattern refuses

Every profile, and a guard with no `pattern`, uses `/^[a-z0-9][a-z0-9-]{1,29}$/` or the same with a longer limit. A name with any other character fails the format check, before the validators or the database see it.

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuardWithProfile("consumer-handle", {
  sources: [{ name: "user", column: "handle" }],
}, adapter);

await guard.check("аdmin");       // → { available: false, reason: "invalid", message: "Use 2-30 lowercase letters, numbers, or hyphens." } (Cyrillic а)
await guard.check("pay\u200Bpal"); // → { available: false, reason: "invalid" } (zero-width space)
await guard.check("ｈｅｌｌｏ");      // → { available: true } (NFKC turns it into hello first)
await guard.check("Sarah");       // → { available: true } (checked as sarah)
```

The validators on this page are a second layer for this setup, in case the pattern changes later. They do real work once your pattern allows more than ASCII.

## Normalisation

Before any check, the guard normalises the name: it trims spaces, applies Unicode NFKC normalisation, lowercases, and drops a leading `@`. The result is the canonical form, which the guard checks and your database should store. `normalize()` is the same function, exported.

NFKC folds characters that are compatibility forms of others: fullwidth letters, ligatures, superscripts, Roman numerals and the like. Without it, `ｈｅｌｌｏ` and `hello` would be different names that look the same.

```ts run
normalize("  @Sarah ");  // → "sarah"
normalize("ｈｅｌｌｏ");    // → "hello"
normalize("ﬁnance");     // → "finance"
normalize("x²");         // → "x2"
normalize("Ⅻ");          // → "xii"
normalize("ſ");          // → "s" (long s)
```

`normalizeUnicode: false` turns NFKC off for a guard. Leave it on unless you have stored names that depend on the difference. With it off, `normalize(name, { unicode: false })` gives the same canonical form. `guard.normalize()` always applies NFKC, whatever the setting.

## Case

The guard lowercases every name, so `Sarah` and `sarah` are the same name, and it looks names up in lowercase. A column that holds names as typed won't match: a lookup for `sarah` misses a stored `Sarah`. There are two fixes:

- **Store a canonical column** and look names up there. This is the better fix, since an exact match can use the unique index. See [Claiming names](claiming.md#store-a-canonical-column).
- **Set `caseInsensitive: true`**, and each adapter compares without case, with `ILIKE`, `LOWER()` or a collation. See [Adapters](adapters.md) for how each does it.

> **Note** With Drizzle, Kysely, TypeORM and MikroORM, `caseInsensitive` uses `ILIKE`. The adapters escape its wildcards, `_` and `%`, so a lookup for `a_b` finds only `a_b`. A canonical column is still simpler: it needs no `ILIKE` at all.

Lowercasing isn't the same as comparing without case in every language. JavaScript's `toLowerCase()` keeps `ß`, so `Straße` and `STRASSE` stay different names, and it turns Turkish `İ` into `i` followed by a combining dot.

```ts run
normalize("Straße");          // → "straße"
normalize("STRASSE");         // → "strasse"
normalize("İstanbul").length; // → 9 (i, a combining dot, then 7 letters)
```

## What the validators add

The validators are functions you list in `validators`. Each receives the canonical form, and the name as typed.

### Invisible characters

`createInvisibleCharacterValidator()` refuses characters that change a name without showing up: zero-width spaces and joiners, soft hyphens, variation selectors and other default-ignorable characters, and the controls that reverse the direction of text.

```ts run
const invisible = createInvisibleCharacterValidator();

await invisible("pay\u200Bpal");  // → { available: false, message: "That name contains invisible or direction-control characters." }
await invisible("pay\u00ADpal");  // → { available: false } (soft hyphen)
await invisible("\u202Egnp.exe"); // → { available: false } (right-to-left override)
await invisible("sarah");         // → null
```

| Option | Default | What it refuses |
|---|---|---|
| `rejectDefaultIgnorables` | `true` | Unicode's default-ignorable characters, such as U+200B zero-width space and U+00AD soft hyphen |
| `rejectBidiControls` | `true` | direction marks, embeddings, overrides and isolates, such as U+202E |
| `rejectCombiningMarks` | `false` | every combining mark (see [below](#combining-marks)) |
| `message` | as above | the message for a refused name |

### Lookalike characters

`createHomoglyphValidator()` refuses a name that contains any character in `CONFUSABLE_MAP`: 1,018 characters that look like a Latin letter or digit, from Unicode's confusables list, Latin small capitals, and lookalikes that [confusable-vision](where-the-data-comes-from.md) measured. It checks the name as typed as well as the canonical form, since lowercasing can turn a lookalike capital into a letter that isn't one: Cherokee `Ꭱ`, which looks like R, lowercases to `ꭱ`.

```ts run
const lookalikes = createHomoglyphValidator();

await lookalikes("аdmin");   // → { available: false, message: "That name contains characters that could be confused with other letters." }
await lookalikes("東京");     // → null
await lookalikes("zoë");     // → null
await lookalikes("москва");  // → { available: false } (о, с and а look like Latin letters)
await lookalikes("maría");   // → { available: false } (í is listed as a lookalike of i)
```

> **Careful** The validator refuses a listed character wherever it appears, not only among Latin letters. Most names in Cyrillic, Greek, Hebrew and Arabic contain one, so it refuses them too, and some Latin letters used in European languages are listed, among them `í`, dotless `ı`, `æ`, `œ` and `þ`. Names in Han or Devanagari usually pass, since those scripts have only a few listed characters, and so do most accented Latin letters.

`additionalMappings` adds characters of your own to the map, as `{ character: "latin" }`. `message` changes the message.

### Mixed scripts

`createHomoglyphValidator({ rejectMixedScript: true })` also refuses a name that mixes Latin letters with letters of any other script, such as `tokyo東京`. It catches lookalikes the map doesn't list. Only letters count, so digits, hyphens and combining marks don't make a name mixed, and a Japanese name that mixes Han and Hiragana isn't mixed either, since neither is Latin. Both rules give the same message.

### Combining marks

A combining mark attaches to the character before it: an accent, a dot, a line through. NFKC already joins `e` and a combining acute into `é`, so an ordinary accent typed as two characters passes. Marks with no joined form stay separate, and they can be stacked or used to strike through letters.

`rejectCombiningMarks: true` on the invisible character validator refuses every combining mark. It's off by default because many scripts write vowels with marks: it refuses Hindi `नमस्ते`, and the dot that lowercasing leaves after Turkish `İ`.

```ts run
const marks = createInvisibleCharacterValidator({ rejectCombiningMarks: true });

await marks("z\u0336a\u0336l\u0336g\u0336o\u0336"); // → { available: false } (a stroke through each letter)
await marks(normalize("cafe\u0301"));               // → null (NFKC made it café)
await marks("नमस्ते");                              // → { available: false } (Devanagari vowel signs)
```

## How the checks run

`check()` and everything built on it take a name through these steps, and the first refusal decides the answer:

1. **Normalise**: trim, NFKC, lowercase, drop a leading `@`.
2. **Format**: the pattern, and the number-only rule if it's on (`allowPurelyNumeric: false`).
3. **Reserved**: your reserved names.
4. **Validators**: in the order you list them. A validator that throws refuses the name, with the error's message.
5. **Database**: every source, in parallel.

The validators run after the cheap checks and before the database, so a refused name costs no query. [How it works](how-it-works.md) shows which method runs which steps.

For lookalikes, three of these work together:

- **NFKC** (step 1) folds compatibility forms, such as fullwidth `Ｉ` to `I` and the ligature `ﬁ` to `fi`, before anything else looks at the name.
- **The lookalike map** (step 4) catches characters that survive NFKC and still pass for Latin letters: Cyrillic `а`, Greek `ο`, Cherokee `Ꭺ`.
- **The mixed-script rule** (step 4, with `rejectMixedScript`) catches Latin mixed with anything else, including lookalikes the map doesn't list.

Each stage assumes the one before it has run. Unicode's confusables list and NFKC disagree about 34 characters: the list says long `ſ` looks like `f`, but NFKC turns it into `s`. After NFKC, the list's entry can never apply. So there are two maps:

- `CONFUSABLE_MAP`, which the lookalike validator uses, is for text that has been through NFKC.
- `CONFUSABLE_MAP_FULL` holds every entry, 2,216 in all, for text that hasn't. `skeleton()` and `areConfusable()` use it by default; see [Comparing names](comparing-names.md).

```ts run
CONFUSABLE_MAP_FULL["ſ"]; // → "f"
normalize("ſ");           // → "s"
CONFUSABLE_MAP["ſ"];      // → undefined
```

## When to allow Unicode names

Keep the default ASCII pattern if your users write in Latin script, or if names appear in places where people copy them by eye, such as URLs and mentions. It refuses every non-ASCII trick at once.

Allow Unicode names when people should be able to use the names they're known by in their own script. Then set up:

1. **A pattern that admits letters.** Use the `u` flag and Unicode classes, and change the `invalid` message to match.
2. **The invisible character validator**, with its defaults.
3. **A rule against mixed scripts.** `createHomoglyphValidator({ rejectMixedScript: true })` is the strict choice, but it refuses most Cyrillic, Greek, Hebrew and Arabic names (see above). If you want those, write your own mixed-script rule with `createPredicateValidator()`, as below.
4. **Protected names**, so a name written wholly in another script, such as `раураӏ` for `paypal`, is still refused. A mixed-script rule can't catch that; see [Protect names](protect-names.md).
5. **A canonical column** with a unique index; see [Claiming names](claiming.md#store-a-canonical-column).

```ts run
// Refuse Latin letters mixed with letters of another script, and nothing else
const mixesLatin = (name) => /\p{Script=Latin}/u.test(name) && /(?!\p{Script=Latin})\p{L}/u.test(name);

const adapter = { findOne: async () => null };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle_canonical" }],
  pattern: /^[\p{L}\p{N}][\p{L}\p{M}\p{N}-]{1,29}$/u,
  messages: { invalid: "Use 2 to 30 letters, numbers or hyphens." },
  validators: [
    createInvisibleCharacterValidator(),
    createPredicateValidator(mixesLatin, { message: "Use letters from one alphabet." }),
  ],
  risk: { protect: ["paypal"] },
}, adapter);

await guard.check("москва");  // → { available: true }
await guard.check("maría");   // → { available: true }
await guard.check("東京");     // → { available: true }
await guard.check("pаypal");  // → { available: false, message: "Use letters from one alphabet." } (Cyrillic а)
(await guard.claim("раураӏ", async () => "saved")).claimed; // → false (all Cyrillic, but it passes for paypal)
```
