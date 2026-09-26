# Moderation

namespace-guard can refuse offensive names using a word list of your own, a curated English list, or a checker you already use. Each of these is a validator: it runs after the format and reserved checks and before the database, so a refused name costs no query. Validators also run on every suggestion, so the guard doesn't offer a name your filter would refuse.

## Block words from your own list

`createProfanityValidator(words, options?)` refuses a name that contains a word from your list. Add it to `validators`:

```ts run
const adapter = { findOne: async () => null };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  validators: [
    createProfanityValidator(["shit"], { message: "Please choose another name." }),
  ],
}, adapter);

await guard.check("5h1t");  // → { available: false, reason: "invalid", message: "Please choose another name." }
await guard.check("sarah"); // → { available: true }
```

A refused name gets `reason: "invalid"` and your message, or "That name is not allowed." by default. The message is the same whichever word matched, so it doesn't repeat the word back or show people what to change to get past it.

| Option | Default | What it does |
|---|---|---|
| `message` | "That name is not allowed." | the message for a refused name |
| `mode` | `"evasion"` | `"evasion"` reads disguised letters as the letters they stand for; `"basic"` matches the name as it is |
| `variantProfile` | `"balanced"` | which digits and symbols count as letters in evasion mode |
| `checkSubstrings` | `true` | also refuse names that contain a listed word, not only names that are one |
| `minSubstringLength` | `4` | the fewest letters a listed word needs to be looked for inside longer words |
| `allowlist` | none | names, places and other words that contain a listed word but are fine |
| `maxFoldVariants` | `64` | the most readings of one name that evasion mode compares |
| `map` | lookalike letters from `CONFUSABLE_MAP_FULL` | the characters evasion mode reads as other letters |

## What evasion mode catches

People who want an offensive name through a filter disguise it. In evasion mode, the default, the validator reads the name the way a person would before it compares:

- **Lookalike letters from other scripts** become the Latin letter: Cyrillic `ѕ` reads as `s`, Cyrillic `і` as `i`.
- **Digits and symbols** can stand for letters: `0` for o, `1` for i, `3` for e, `4` for a, `5` for s, `7` for t, `@` for a, `$` for s, `+` for t, and `!` or `|` for i.
- **Separators** can be dropped, so `s-h-i-t` reads as one word.
- **Repeated letters**: a letter written three or more times in a row reads as a repeat, so `shiiit` reads as `shit`. Two in a row are ordinary spelling and read as written.
- **Fullwidth and other compatibility forms** become plain letters through NFKC.

A digit can be a digit or a letter, so the validator tries each reading, up to `maxFoldVariants` of them, and refuses the name if any matches. `"basic"` mode does none of this: it matches the lowercase name against the list as it is.

```ts run
const evasion = createProfanityValidator(["shit"]);
const basic = createProfanityValidator(["shit"], { mode: "basic" });

await evasion("5h1t");    // → { available: false, message: "That name is not allowed." }
await evasion("s-h-i-t"); // → { available: false }
await evasion("ѕhit");    // → { available: false } (Cyrillic ѕ)
await basic("5h1t");      // → null
await basic("shit");      // → { available: false }
```

A validator returns `null` when it has no objection. Called on its own like this, it expects the name as the guard passes it: normalised, so lowercase. Call `normalize()` first if you use one outside a guard.

## Balanced or aggressive

`variantProfile` decides which digits and symbols evasion mode reads as letters.

| Profile | Digits and symbols read as letters |
|---|---|
| `"balanced"` | `0` o, `1` i, `3` e, `4` a, `5` s, `7` t, `@` a, `$` s, `+` t, `!` i, `\|` i |
| `"aggressive"` | the same, and also `1`, `!` and `\|` as l, `2` as z, `6` and `9` as g, `8` as b |

`"aggressive"` catches more disguises, and refuses more ordinary names with digits in them. Start with `"balanced"`.

```ts run
const balanced = createProfanityValidator(["hell"]);
const aggressive = createProfanityValidator(["hell"], { variantProfile: "aggressive" });

await balanced("he11");   // → null (1 reads only as i)
await aggressive("he11"); // → { available: false } (1 can read as l)
```

## Substrings and whole words

With `checkSubstrings` on, the default, a name is also refused when it contains a listed word. How depends on the word:

- A word written as one word, with at least `minSubstringLength` letters, is looked for anywhere in the name: `shit` refuses `shitposter`.
- A shorter word is matched only as a word of its own: the whole name, or a part of it between separators, digits or the ends. `ass` refuses `my-ass`, `ass_hat` and `ass4life`, not `class` or `assistant`.
- An entry written as several words, or with separators, is matched the same way, with or without its separators: `h e l l` refuses `hell` and `h-e-l-l`, not `hello`.
- So is a word whose letters are common inside ordinary English words. The validator knows 122 of these, measured from the English list: the words that contain them appear together at least once per million words of English. `anal`, `rape` and `cock` are among them, so `anal` refuses `anal-x`, not `analyst` or `canal`.

```ts run
const moderation = createProfanityValidator(["shit", "ass", "anal"]);

await moderation("shitposter"); // → { available: false } ("shit" is looked for anywhere)
await moderation("my-ass");     // → { available: false } ("ass" is short, so it's matched as a word of its own)
await moderation("class");      // → null
await moderation("anal-x");     // → { available: false }
await moderation("analyst");    // → null ("anal" is common inside English words)
```

`minSubstringLength` counts letters and digits, not spaces or symbols, so `a s s` has three. The default is 4. Raise it and more words are matched only as words of their own:

```ts run
const standard = createProfanityValidator(["evil"]);
const longer = createProfanityValidator(["evil"], { minSubstringLength: 5 });
const whole = createProfanityValidator(["evil"], { checkSubstrings: false });

await standard("devilish"); // → { available: false } ("evil" is inside it)
await longer("devilish");   // → null ("evil" has 4 letters, fewer than 5)
await longer("evil-twin");  // → { available: false }
await whole("evil-twin");   // → null
await whole("3v1l");        // → { available: false } (a disguised whole name is still caught)
```

`checkSubstrings: false` refuses only names that are a listed word, disguised or not.

## Allow names and places

Some real names and places contain a listed word: Scunthorpe, Penistone, Shitterton, Dickson. Put them in `allowlist`, and a listed word found only inside one of them doesn't count, wherever it appears in the name. A listed word outside it still does.

```ts run
const moderation = createProfanityValidator(["shit", "hell"], { allowlist: ["shitterton", "hello"] });

await moderation("shitterton-fc");  // → null
await moderation("hellokitty");     // → null ("hell" is inside "hello")
await moderation("shittertonshit"); // → { available: false } (the second one is outside it)
await moderation("hell");           // → { available: false }
```

Allowed words are compared the way listed words are, so a lookalike letter in one still matches, but a digit isn't read as a letter there: `sh1tterton` is refused. An allowed word can be split by separators, as in `scun-thorpe` or `d-agostino`, but not so that a part shows a listed word on its own: `shit-terton` and `s-cunt-horpe` are refused. An allowed word that is itself on your list lets that word through everywhere; taking it off the list does the same and is clearer. An entry written with separators is exact: with `allowlist: ["chorlton-cum-hardy"]`, the name `chorlton-cum-hardy` passes, and `chorlton-cum-hardy-fc` and `cum-hardy` are still judged as usual. The English allowlist has the UK places named like this.

## The built-in English list

`namespace-guard/profanity-en` is a curated English list of 2,624 words and phrases, with a validator already set up to use it and an allowlist of 2,278 names, places and words that contain a listed word. It's a separate entry point, so the core package doesn't carry the list unless you import it.

In 0.23.0, 78 entries that are also first names, surnames or places were taken off the list: `wang`, `lynch`, `sanchez`, `jerry`, `pula` and others, each the name of an actor, politician or athlete, on a common-name list, or a city. Fourteen that are names too stay on it, because the slur or sexual sense is the likelier reading of a handle; `dick`, `dyke` and `cumming` are three.

The allowlist holds names and places such as `scunthorpe`, `penistone`, `dickson` and `kirkland`, and common words such as `woodpecker`. `scripts/measure-profanity.mjs` builds it from openly licensed data: first names given to babies in England and Wales since 1996 (ONS), US census surnames, GeoNames places in the UK and towns worldwide, and the public-domain Webster's dictionary. Names, places and words that look like a slur or read as crude are screened out, so `niggli`, `negron`, `bitchfield` and `cummings` stay refused; a short reviewed list of exceptions, such as `montenegro` and `penistone`, is in the script. `docs/data/profanity-words.SOURCE.md` gives the sources and the screens.

```ts title="In your app"
import { createNamespaceGuard } from "namespace-guard";
import { createEnglishProfanityValidator } from "namespace-guard/profanity-en";

const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  validators: [createEnglishProfanityValidator({ checkSubstrings: false })],
}, adapter);
```

`createEnglishProfanityValidator(options?)` takes the same options as `createProfanityValidator()`; an `allowlist` you pass is added to its own. The entry point also exports:

- `PROFANITY_WORDS_EN`: the list, frozen
- `PROFANITY_ALLOWLIST_EN`: the allowlist, frozen
- `PROFANITY_WORDS_EN_COUNT`: the list's length
- `PROFANITY_WORDS_EN_SOURCE`: where it came from, [zautumnz/profane-words](https://github.com/zautumnz/profane-words)
- `PROFANITY_WORDS_EN_LICENSE`: the upstream licence, `"WTFPL"`

To add or remove words, build your own validator from the list, and pass the allowlist with it:

```ts title="In your app"
import { createProfanityValidator } from "namespace-guard";
import { PROFANITY_ALLOWLIST_EN, PROFANITY_WORDS_EN } from "namespace-guard/profanity-en";

const removed = new Set(["some-word-you-allow"]);
const words = [...PROFANITY_WORDS_EN.filter((w) => !removed.has(w)), "your-extra-word"];
const moderation = createProfanityValidator(words, { allowlist: [...PROFANITY_ALLOWLIST_EN, "your-town"] });
```

## Be conservative

A filter that refuses a real person's name does more harm than one that misses a rude one. With its default settings, the English list refuses 890 of the 234,456 words in `/usr/share/dict/words` (0.4%), 11 of the 38,970 first names given to babies in England and Wales since 1996, 259 of 162,254 US surnames, and 62 of 43,818 UK place names and their parts. Before 0.23.0 it refused 18,974 of those words, 3,327 of those first names, 9,047 of those surnames and 4,290 of those places, `hello`, `michelle`, `class`, `grape`, `analyst`, `arsenal` and `scunthorpe` among them.

What it still refuses:

- **Names kept on the list on purpose**: `dick`, `cumming` and a dozen others that are names but read as slurs or sexual terms in a handle.
- **Names and places that look like a slur or read as crude**, such as `niggli`, `negron`, `bitchfield` and `cummings`, which the allowlist leaves out on purpose, and names its data doesn't have, such as `shizuka`. Add the ones your users need to `allowlist`.
- **Rare dictionary words**, mostly scientific ones such as `spermatic`.
- **A listed word across a separator.** Evasion mode drops separators before it looks inside a name, so with `["shit"]` it refuses `push-it`, which reads as `pushit`.

Matching whole words gives something up: a word matched only as a word of its own isn't found run into other letters, so `xanalx` passes, as `canal` does. A listed word that no common word contains is looked for anywhere, which is what catches `xshitx` and `gofuckyourself`.

Ways to cut false positives further:

- **Add names and places to `allowlist`**, such as those of your users' towns.
- **Turn off substrings.** `checkSubstrings: false` refuses only names that are a listed word, disguised or not.
- **Take words off the list** that clash with names your users have.
- **Raise `minSubstringLength`.** More words are then matched only as words of their own.
- **Use `"basic"` mode** where disguises aren't a concern, such as names only staff can set.

Before you switch a filter on, run it over the names you already have and read what it would refuse:

```ts run
const moderation = createProfanityValidator(["shit", "hell"]);
const existing = ["sarah", "Hello", "michelle", "hell-yeah", "push-it"];

const refused = [];
for (const name of existing) {
  if (await moderation(normalize(name))) refused.push(name);
}
refused; // → ["Hello", "michelle", "hell-yeah", "push-it"]
```

`Hello` and `michelle` contain `hell`; allow the words that let them through:

```ts run
const moderation = createProfanityValidator(["shit", "hell"], { allowlist: ["hello", "michelle"] });

await moderation("hello");     // → null
await moderation("michelle");  // → null
await moderation("hell-yeah"); // → { available: false }
```

The same code can flag names for a person to review instead of refusing them: leave the validator out of `validators` and call it yourself when a name is saved.

## Use your own list or service

`createPredicateValidator(predicate, options?)` turns any yes-or-no test into a validator. The predicate returns `true` to refuse the name, and can be async. Use it for a list you keep elsewhere, or a moderation service or library you already use.

```ts run
const blocked = new Set(["spam", "scam"]);
const adapter = { findOne: async () => null };
const guard = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  validators: [
    createPredicateValidator((name) => blocked.has(name), {
      message: "That name isn't available.",
      transform: (name) => name.replace(/-/g, ""), // compare without hyphens
    }),
  ],
}, adapter);

await guard.check("sc-am"); // → { available: false, reason: "invalid", message: "That name isn't available." }
await guard.check("sarah"); // → { available: true }
```

`transform` changes the name before the predicate sees it; the default leaves it as it is. Without `message`, a refused name gets the same default message as the profanity validator.

```ts title="In your app"
import { Profanity } from "@2toad/profanity";

const profanity = new Profanity();
const moderation = createPredicateValidator((name) => profanity.exists(name), {
  message: "Please choose another name.",
});
```

> **Careful** If a validator throws, the guard refuses the name and shows the error's message as the reason. A moderation service that times out would refuse every name with "moderation API timed out". Catch errors in the predicate and decide for yourself whether a failed check lets the name through or refuses it with your own message.

```ts run
const callService = async () => { throw new Error("moderation API timed out"); };
const adapter = { findOne: async () => null };

const unguarded = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  validators: [createPredicateValidator(callService)],
}, adapter);
(await unguarded.check("sarah")).message; // → "moderation API timed out"

const guarded = createNamespaceGuard({
  sources: [{ name: "user", column: "handle" }],
  validators: [createPredicateValidator(async (name) => {
    try { return await callService(name); } catch { return false; } // let the name through
  })],
}, adapter);
await guarded.check("sarah"); // → { available: true }
```

For a short list of exact names with their own message, reserved categories are enough: `reserved: { offensive: [...] }` with `messages.reserved.offensive`. They match the whole name only, with no disguises; see [Configuration](configuration.md).
