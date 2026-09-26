# Functions

Everything namespace-guard exports that you call directly, other than the guard's own methods. Each function is imported from `namespace-guard` unless its section says otherwise. The guard's methods are on [The guard](guard.md), and the maps, weights and lists on [Data and maps](data.md).

| Function | What it does |
|---|---|
| [`createNamespaceGuard()`](#createnamespaceguard-and-createnamespaceguardwithprofile) | makes a guard |
| [`createNamespaceGuardWithProfile()`](#createnamespaceguard-and-createnamespaceguardwithprofile) | makes a guard from a profile |
| [`normalize()`](#normalize) | a name's canonical form |
| [`skeleton()`](#skeleton) | what a string looks like, with each lookalike replaced |
| [`areConfusable()`](#areconfusable) | whether two strings look alike |
| [`confusableDistance()`](#confusabledistance) | how far apart two strings look, step by step |
| [`detectCrossScriptRisk()`](#detectcrossscriptrisk) | lookalike pairs between scripts inside one string |
| [`isDomainSpoof()`](#isdomainspoof) | whether a domain label is a registrable lookalike of another |
| [`canonicalise()`](#canonicalise) | text with lookalikes put back to Latin letters |
| [`scan()`](#scan) | the lookalikes in a text, and a risk level |
| [`isClean()`](#isclean) | whether `canonicalise()` would change anything |
| [`createHomoglyphValidator()`](#createhomoglyphvalidator) | a validator that refuses lookalike characters |
| [`createInvisibleCharacterValidator()`](#createinvisiblecharactervalidator) | a validator that refuses invisible and direction characters |
| [`createProfanityValidator()`](#createprofanityvalidator) | a validator that refuses words from your list |
| [`createEnglishProfanityValidator()`](#createenglishprofanityvalidator) | the same, with a curated English list |
| [`createPredicateValidator()`](#createpredicatevalidator) | a validator from any yes-or-no test |
| [`isLikelyUniqueViolationError()`](#islikelyuniqueviolationerror) | whether a database error means a duplicate key |
| [`deriveNfkcTr39DivergenceVectors()`](#derivenfkctr39divergencevectors) | the characters where NFKC and a map disagree |

## `createNamespaceGuard()` and `createNamespaceGuardWithProfile()`

`createNamespaceGuard(config, adapter)`

`createNamespaceGuardWithProfile(profile, config, adapter)`

Make a guard. The config is covered in [Configuration](configuration.md), the adapter in [Adapters](adapters.md), and the guard's methods in [The guard](guard.md).

## `normalize()`

`normalize(raw, options?): string`

A name's canonical form: trimmed, NFKC-normalised, lowercase, with any leading `@` removed. It's the form the guard checks and the form to store in a canonical column.

| Option | Default | What it does |
|---|---|---|
| `unicode` | `true` | apply NFKC; `false` only trims, lowercases and drops the `@` |

```ts run
normalize("  @Sarah ");                 // → "sarah"
normalize("ACME-Corp");                 // → "acme-corp"
normalize("@@team");                    // → "team"
normalize("ｈｅｌｌｏ");                  // → "hello"
normalize("ｈｅｌｌｏ", { unicode: false }); // → "ｈｅｌｌｏ"
```

Use `{ unicode: false }` only if the guard has `normalizeUnicode: false`, so your stored names match what it checks. [Normalisation](unicode-names.md#normalisation) covers what NFKC folds.

## `skeleton()`

`skeleton(input, options?): string`

What a string looks like, following Unicode's skeleton algorithm (UTS #39): NFD, remove invisible characters, replace each character with the letters it passes for, NFD again, lowercase. Two strings with the same skeleton look alike. A skeleton is for comparing, not for showing anyone.

| Option | Default | What it does |
|---|---|---|
| `map` | `CONFUSABLE_MAP_FULL` | the character map; use `CONFUSABLE_MAP` if your text has been through NFKC |
| `preserveCase` | `false` | treat the string as shown with its case, so capital `I` counts as `l` |
| `ignoreDiacritics` | `false` | also remove accents and other combining diacritics, so `ạ` matches `a` |

```ts run
skeleton("pаypal");                            // → "paypal" (Cyrillic а)
skeleton("pay\u200Bpal");                      // → "paypal" (a zero-width space)
skeleton("microsoft");                         // → "rnicrosoft" (m passes for rn)
skeleton("paypaI");                            // → "paypai"
skeleton("paypaI", { preserveCase: true });    // → "paypal"
skeleton("ạdmin", { ignoreDiacritics: true }); // → "adrnin"
```

[Comparing names](comparing-names.md#skeletons) explains skeletons, case and the maps.

## `areConfusable()`

`areConfusable(a, b, options?): boolean`

Whether two strings look alike: `true` if their skeletons match, compared without case or with it. With `weights`, also `true` if the two line up character by character, each position holding the same letter, a listed lookalike or a measured pair, in order.

| Option | Default | What it does |
|---|---|---|
| `map`, `preserveCase`, `ignoreDiacritics` | as for `skeleton()` | passed to the skeletons |
| `weights` | none | measured pairs, such as `CONFUSABLE_WEIGHTS` from `namespace-guard/confusable-weights` |
| `context` | `"all"` | which measured pairs count: `"identifier"` (both characters allowed in identifiers), `"domain"` (both allowed in domain names) or `"all"` |

```ts run
import { CONFUSABLE_WEIGHTS } from "namespace-guard/confusable-weights";

areConfusable("rnicrosoft", "microsoft");                       // → true
areConfusable("paypaI", "paypal");                              // → true
areConfusable("gitlab", "github");                              // → false
areConfusable("ㅣ", "丨");                                       // → false (Hangul and Han, not in Unicode's list)
areConfusable("ㅣ", "丨", { weights: CONFUSABLE_WEIGHTS });       // → true
areConfusable("Iowa", "lima", { weights: CONFUSABLE_WEIGHTS }); // → false
```

See [Comparing names](comparing-names.md#areconfusable).

## `confusableDistance()`

`confusableDistance(a, b, options?): ConfusableDistanceResult`

A weighted edit distance from `a` to `b`, in which swapping a character for its lookalike costs less than an ordinary edit, with the path of steps that gives it. The guard's `checkRisk()` scores with it.

| Option | Default | What it does |
|---|---|---|
| `map` | `CONFUSABLE_MAP_FULL` | the character map |
| `weights` | none | measured pairs: a lookalike costs its measured cost instead of 0.35, and measured pairs Unicode doesn't list count too |
| `context` | `"all"` | which measured pairs count, as for `areConfusable()` |

| Field | What it is |
|---|---|
| `distance` | the total cost of the path; lower is more alike |
| `maxDistance` | the longer string's length, used to scale `similarity` |
| `similarity` | `1 - distance / maxDistance`, from 0 to 1 |
| `skeletonEqual` | whether the two share a skeleton |
| `normalizedEqual` | whether they're equal after NFKC and lowercasing |
| `chainDepth` | how many steps aren't matches |
| `crossScriptCount` | lookalike swaps between two scripts |
| `ignorableCount` | invisible characters added or removed |
| `divergenceCount` | swaps involving a character NFKC and Unicode's list read differently |
| `steps` | the path: one `{ op, from, to, fromIndex, toIndex, cost }` per step, with `prototype`, `crossScript`, `divergence` and `reason` where they apply |

```ts run
const result = confusableDistance("paypa1", "paypal");
result.distance;       // → 0.35
result.similarity;     // → 0.942
result.skeletonEqual;  // → true
result.steps[5];       // → { op: "confusable-substitution", from: "1", to: "l", cost: 0.35, prototype: "l" }

confusableDistance("gitlab", "github").distance; // → 2 (two ordinary letters changed)
```

[Reading the steps](comparing-names.md#read-the-steps) explains each kind of step and what it costs.

## `detectCrossScriptRisk()`

`detectCrossScriptRisk(identifier, options?): CrossScriptRiskResult`

Looks inside one string for letters from different scripts that look alike, using measured weights. It returns the scripts it found, the lookalike pairs between them, and a risk level.

| Option | Default | What it does |
|---|---|---|
| `weights` | none | measured pairs. Without them, no pairs are found and the level is always `"none"` |

| Field | What it is |
|---|---|
| `scripts` | the scripts of the letters, sorted, such as `["han", "hangul"]` |
| `crossScriptPairs` | each lookalike pair: `{ a: { char, script }, b: { char, script }, visualScore }` |
| `riskLevel` | `"none"` with no pairs, `"high"` if a pair scores 0.8 or more or there are three or more pairs, otherwise `"low"` |

```ts run
import { CONFUSABLE_WEIGHTS } from "namespace-guard/confusable-weights";

detectCrossScriptRisk("hello");                                          // → { scripts: ["latin"], crossScriptPairs: [], riskLevel: "none" }
detectCrossScriptRisk("ㅣ丨", { weights: CONFUSABLE_WEIGHTS });            // → { scripts: ["han", "hangul"], riskLevel: "high" }
detectCrossScriptRisk("ㅣ丨", { weights: CONFUSABLE_WEIGHTS }).crossScriptPairs[0]; // → { a: { char: "ㅣ", script: "hangul" }, b: { char: "丨", script: "han" }, visualScore: 1 }
```

It recognises Latin, Cyrillic, Greek, Armenian, Hebrew, Arabic, Devanagari, Han, Hiragana, Katakana, Hangul, Georgian and Thai; letters of other scripts, digits and punctuation are skipped. See [Two non-Latin scripts](comparing-names.md#two-non-latin-scripts).

## `isDomainSpoof()`

`isDomainSpoof(label, target, options?): DomainSpoofResult`

Whether a domain label, such as the `раураӏ` in `раураӏ.com`, is a lookalike of your label that someone could register: written wholly in one script other than the target's, letter for letter.

| Option | Default | What it does |
|---|---|---|
| `weights` | none | measured pairs, to score each swap by how alike it looks |
| `minDanger` | `0.5` | the lowest average similarity that counts as a spoof |
| `allowlist` | none | labels you know are genuine |
| `map` | `CONFUSABLE_MAP_FULL` | the character map |

```ts run
import { CONFUSABLE_WEIGHTS } from "namespace-guard/confusable-weights";

isDomainSpoof("раураӏ", "paypal", { weights: CONFUSABLE_WEIGHTS }); // → { spoof: true, script: "cyrillic", danger: 0.781 }
isDomainSpoof("рaypal", "paypal", { weights: CONFUSABLE_WEIGHTS }); // → { spoof: false } (mixed scripts can't be registered)
```

[Domain names](domains.md) covers the result, the threshold and the allowlist.

## `canonicalise()`

`canonicalise(text, options?): string`

Puts lookalike letters back to the Latin letters they pass for, in words that show a sign of tampering, before text reaches a language model. Words in other scripts with no such sign are left alone.

| Option | Default | What it does |
|---|---|---|
| `strategy` | `"mixed"` | `"mixed"` rewrites words that show tampering; `"all"` rewrites every word |
| `threshold` | `0.7` | the score at which a lookalike alone marks a word as tampered; set it, and nothing scoring lower is replaced |
| `includeNovel` | `true` | use pairs confusable-vision measured, as well as Unicode's list |
| `scripts` | all | only replace characters from these scripts, such as `["Cyrillic"]` |
| `maxSizeRatio` | `3` | skip measured pairs whose sizes differ by more than this |

```ts run
canonicalise("The seller аssumes аll liаbility."); // → "The seller assumes all liability."
canonicalise("Москва is the capital");              // → "Москва is the capital"
canonicalise("поп-refundable", { strategy: "all" }); // → "non-refundable"
```

[Text for LLMs](llm-text.md) explains what counts as tampering.

## `scan()`

`scan(text, options?): ScanResult`

Reports the lookalike characters in a text: each character, the letter it stands for, the word it's in, and a risk level for the whole text. It lists everything `canonicalise()` would change, and also lookalikes in words it would leave alone, such as the letters of a Russian word, which on their own make the risk level `low`. It takes `canonicalise()`'s options and `riskTerms`, words that raise the risk level when they're targeted (legal and financial terms by default).

```ts run
const report = scan("The seller аssumes аll liаbility.");
report.count;              // → 3
report.summary.riskLevel;  // → "high"
report.findings[0];        // → { char: "а", codepoint: "U+0430", script: "Cyrillic", latinEquivalent: "a", source: "tr39", word: "аssumes", mixedScript: true }
```

The result has `hasConfusables`, `count`, `findings` and a `summary` with `distinctChars`, `wordsAffected`, `scriptsDetected` and `riskLevel` (`"none"`, `"low"`, `"medium"` or `"high"`). See [Check before you pay](llm-text.md#check-before-you-pay).

## `isClean()`

`isClean(text, options?): boolean`

`true` exactly when `canonicalise()` with the same options would leave the text unchanged. It stops at the first word it would change, so it's cheap enough to run on everything.

```ts run
isClean("The seller assumes all liability.");  // → true
isClean("The seller аssumes all liability.");  // → false
isClean("Москва is the capital");              // → true
```

## `createHomoglyphValidator()`

`createHomoglyphValidator(options?): NamespaceValidator`

A validator that refuses a name containing any character from `CONFUSABLE_MAP`, the lookalikes that survive NFKC. It checks the name as typed as well as the canonical form.

| Option | Default | What it does |
|---|---|---|
| `message` | "That name contains characters that could be confused with other letters." | the message for a refused name |
| `additionalMappings` | none | more characters to refuse, as `{ character: "latin" }` |
| `rejectMixedScript` | `false` | also refuse Latin letters mixed with letters of any other script |

```ts run
const lookalikes = createHomoglyphValidator({ rejectMixedScript: true });

await lookalikes("аdmin");     // → { available: false, message: "That name contains characters that could be confused with other letters." }
await lookalikes("tokyo東京");  // → { available: false } (Latin mixed with Han)
await lookalikes("sarah");     // → null
```

[Lookalike characters](unicode-names.md#lookalike-characters) covers which names it refuses, including ordinary words in Cyrillic and Greek.

## `createInvisibleCharacterValidator()`

`createInvisibleCharacterValidator(options?): NamespaceValidator`

A validator that refuses characters that change a name without showing: zero-width spaces and joiners, soft hyphens, variation selectors, and the controls that reverse the direction of text.

| Option | Default | What it does |
|---|---|---|
| `message` | "That name contains invisible or direction-control characters." | the message for a refused name |
| `rejectDefaultIgnorables` | `true` | refuse Unicode's default-ignorable characters, such as U+200B |
| `rejectBidiControls` | `true` | refuse direction marks, embeddings, overrides and isolates, such as U+202E |
| `rejectCombiningMarks` | `false` | refuse every combining mark, including the vowel signs of many scripts |

```ts run
const invisible = createInvisibleCharacterValidator();

await invisible("pay\u200Bpal");  // → { available: false, message: "That name contains invisible or direction-control characters." }
await invisible("\u202Egnp.exe"); // → { available: false }
await invisible("sarah");         // → null
```

See [Invisible characters](unicode-names.md#invisible-characters).

## `createProfanityValidator()`

`createProfanityValidator(words, options?): NamespaceValidator`

A validator that refuses a name containing a word from your list. By default it reads disguised letters as the letters they stand for, so `5h1t` matches `shit`.

| Option | Default | What it does |
|---|---|---|
| `message` | "That name is not allowed." | the message for a refused name |
| `mode` | `"evasion"` | `"evasion"` reads lookalikes, digits and symbols as letters and drops separators; `"basic"` matches the name as it is |
| `variantProfile` | `"balanced"` | which digits and symbols count as letters; `"aggressive"` counts more |
| `checkSubstrings` | `true` | also refuse names that contain a listed word |
| `minSubstringLength` | `4` | the fewest letters a listed word needs to be looked for inside a name; shorter words, and words common inside ordinary words, match only as words of their own (see [Moderation](moderation.md#substrings-and-whole-words)) |
| `maxFoldVariants` | `64` | the most readings of one name that evasion mode compares |
| `map` | lookalike letters from `CONFUSABLE_MAP_FULL` | the characters evasion mode reads as other letters |

```ts run
const moderation = createProfanityValidator(["badword"]);

await moderation("b4dword");      // → { available: false, message: "That name is not allowed." }
await moderation("my-badword-1"); // → { available: false }
await moderation("sarah");        // → null
```

[Moderation](moderation.md) covers the options and how to avoid refusing real names.

## `createEnglishProfanityValidator()`

`createEnglishProfanityValidator(options?): NamespaceValidator`, from `namespace-guard/profanity-en`

`createProfanityValidator()` with a curated list of 2,624 English words and phrases and `PROFANITY_ALLOWLIST_EN`, 2,278 names, places and common words that contain a listed word (`scunthorpe`, `dickson`). It takes the same options; an `allowlist` you pass is added to its own. The list is a separate import, so the core package doesn't carry it.

```ts title="In your app"
import { createEnglishProfanityValidator } from "namespace-guard/profanity-en";

const moderation = createEnglishProfanityValidator({ checkSubstrings: false });
```

See [The built-in English list](moderation.md#the-built-in-english-list).

## `createPredicateValidator()`

`createPredicateValidator(predicate, options?): NamespaceValidator`

Turns a yes-or-no test into a validator. The predicate receives the canonical form and returns `true`, or a promise of `true`, to refuse it.

| Option | Default | What it does |
|---|---|---|
| `message` | "That name is not allowed." | the message for a refused name |
| `transform` | none | changes the name before the predicate sees it |

```ts run
const staffOnly = createPredicateValidator((name) => name.startsWith("staff-"), {
  message: "Names starting with staff- are for our team.",
});

await staffOnly("staff-sarah"); // → { available: false, message: "Names starting with staff- are for our team." }
await staffOnly("sarah");       // → null
```

Use it for a list kept elsewhere, or a moderation service. If the predicate throws, the guard refuses the name with the error's message; see [Use your own list or service](moderation.md#use-your-own-list-or-service).

## `isLikelyUniqueViolationError()`

`isLikelyUniqueViolationError(error): boolean`

Whether a database error means a duplicate key: PostgreSQL `23505`, Prisma `P2002`, MySQL `ER_DUP_ENTRY` or errno 1062, SQLite `SQLITE_CONSTRAINT`, MongoDB 11000, or a message such as "duplicate key" or "unique constraint". It also looks inside `cause`, `parent`, `original` and `meta`, where ORMs keep the driver's error. `claim()` uses it unless you pass `isUniqueViolation`.

```ts run
isLikelyUniqueViolationError({ code: "23505" });                                    // → true
isLikelyUniqueViolationError({ message: "Query failed", cause: { code: "P2002" } }); // → true
isLikelyUniqueViolationError(new Error("connection timed out"));                     // → false
```

The test is broad: SQLite reports every constraint failure as "constraint failed". See [Recognise a unique violation](claiming.md#recognise-a-unique-violation).

## `deriveNfkcTr39DivergenceVectors()`

`deriveNfkcTr39DivergenceVectors(map?): NfkcTr39DivergenceVector[]`

The characters in a map that NFKC turns into a different ASCII letter or digit from the one the map gives, such as long `ſ`, which Unicode's list reads as `f` and NFKC turns into `s`. Each is `{ char, codePoint, tr39, nfkc }`. The map defaults to `CONFUSABLE_MAP_FULL`, and the result for it is exported as `COMPOSABILITY_VECTORS`.

```ts run
deriveNfkcTr39DivergenceVectors()[0];                     // → { char: "ſ", codePoint: "U+017F", tr39: "f", nfkc: "s" }
deriveNfkcTr39DivergenceVectors(CONFUSABLE_MAP).length;   // → 0
```

Use it to test a map of your own before relying on it after NFKC. See [Composability vectors](data.md#composability-vectors).

## Other exports

The rest of the package is data and entry points:

| Export | Import from | See |
|---|---|---|
| `CONFUSABLE_MAP`, `CONFUSABLE_MAP_FULL`, `CONFUSABLE_MAP_CASED`, `CONFUSABLES_DATE` | `namespace-guard` | [The character maps](data.md#the-character-maps) |
| `MEASURED_CONFUSABLES` | `namespace-guard` | [Measured lookalikes](data.md#measured-lookalikes) |
| `LLM_CONFUSABLE_MAP` and its counts | `namespace-guard` | [The LLM map](data.md#the-llm-map) |
| `COMPOSABILITY_VECTORS`, `COMPOSABILITY_VECTORS_COUNT`, `COMPOSABILITY_VECTOR_SUITE`, `NFKC_TR39_DIVERGENCE_VECTORS` | `namespace-guard` | [Composability vectors](data.md#composability-vectors) |
| `NAMESPACE_PROFILES` | `namespace-guard` | [Profiles](configuration.md#profiles) |
| `DEFAULT_PROTECTED_TOKENS` | `namespace-guard` | [`enforceRisk()`](guard.md#enforcerisk) |
| `CONFUSABLE_WEIGHTS` | `namespace-guard/confusable-weights` | [Visual weights](data.md#visual-weights) |
| `FONT_SPECIFIC_WEIGHTS` | `namespace-guard/font-specific-weights` | [Weights per font](data.md#weights-per-font) |
| `PROFANITY_WORDS_EN` and its details | `namespace-guard/profanity-en` | [The profanity list](data.md#the-profanity-list) |
| the adapters | `namespace-guard/adapters/*` | [Adapters](adapters.md) |

The types are listed in [TypeScript](typescript.md).
