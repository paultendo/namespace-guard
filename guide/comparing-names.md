# Comparing names

The guard compares each new name with your protected names for you. To compare two strings yourself, for instance to find lookalikes among names you already have, or to see why two names were judged alike, use the functions on this page. They take strings as they are and query nothing.

## Which to use

| You want | Use |
|---|---|
| a yes or no: do these two look alike | [`areConfusable()`](#areconfusable) |
| how close they are, and which characters make them so | [`confusableDistance()`](#confusabledistance) |
| a value to store, index or group by | [`skeleton()`](#skeletons) |
| lookalike pairs between scripts inside one string | [`detectCrossScriptRisk()`](#two-non-latin-scripts) |
| whether a domain label could be registered to imitate yours | [`isDomainSpoof()`](domains.md) |
| whether a sign-up passes for a protected name | [`guard.checkRisk()`](protect-names.md) |

## Skeletons

`skeleton(input, options?)` replaces every character with what it looks like, so two strings that look alike come out the same. It follows Unicode's skeleton algorithm (UTS #39):

1. Apply NFD, which splits accented letters into a letter and a mark. Characters the map lists, such as `í`, stay whole so that their entry applies.
2. Remove invisible characters, such as a zero-width space.
3. Replace each character with the letters it passes for in the map: Cyrillic `а` with `a`, `1` with `l`, `m` with `rn`.
4. Apply NFD again, and lowercase.

```ts run
skeleton("раураl");           // → "paypal" (five Cyrillic letters)
skeleton("paypa1");           // → "paypal"
skeleton("pay\u200Bpal");     // → "paypal" (a zero-width space)
skeleton("rnicrosoft");       // → "rnicrosoft"
skeleton("microsoft");        // → "rnicrosoft"
skeleton("admin");            // → "adrnin"
```

`microsoft` and `rnicrosoft` share a skeleton because Unicode lists `m` as passing for `rn`. So a skeleton isn't a readable name, and it isn't for showing anyone. Use it to compare, or store it in a column with a unique index so that two lookalike names can't both be claimed. Skeletons change when the maps do, so recompute stored ones when you upgrade; see [Upgrading](upgrading.md).

### Which map

A skeleton is only as good as the map behind it. There are two, and which to use depends on whether the text has been through NFKC:

- `CONFUSABLE_MAP_FULL`, the default, is for text as typed.
- `CONFUSABLE_MAP` is for text that has been through NFKC, as every name the guard checks has.

They differ on characters that NFKC changes. Unicode's list says long `ſ` looks like `f`, and NFKC turns it into `s`, so once NFKC has run, the list's entry no longer applies:

```ts run
skeleton("ſtop");                                     // → "ftop"
skeleton(normalize("ſtop"), { map: CONFUSABLE_MAP }); // → "stop"
```

[Data and maps](data.md#the-character-maps) describes both maps, and [How the checks run](unicode-names.md#how-the-checks-run) how NFKC and the maps fit together.

## Case: why paypaI matches paypal

A skeleton is lowercased at the end, so names compare without case: `ADMIN` has the skeleton of `admin`, as it should, since the guard stores both as `admin`.

Lowercasing hides one trick. In `paypaI`, the last letter is a capital `I`, which looks like `l` in many fonts. Lowercased, it becomes `i`, and the skeleton no longer matches:

```ts run
skeleton("ADMIN") === skeleton("admin");     // → true
skeleton("paypaI");                          // → "paypai"
skeleton("paypaI", { preserveCase: true });  // → "paypal"
CONFUSABLE_MAP_CASED;                        // → { I: "l" }
```

Unicode's list does say capital `I` passes for `l`, but that only holds where a name is shown with its case, so the entry is kept apart, in `CONFUSABLE_MAP_CASED`. `preserveCase: true` uses it: each character is looked up as typed before the skeleton is lowercased. That suits a site that stores names in lowercase but shows them as typed, where `paypaI` is a different name from `paypal` that looks the same.

With `preserveCase`, a name in capitals no longer matches its lowercase form, since each capital `I` becomes `l`:

```ts run
skeleton("MILL", { preserveCase: true });  // → "rnlll"
skeleton("mill");                          // → "rnill"
```

`areConfusable()` compares both ways, without case and with it, so it treats `ADMIN` as `admin` and still catches `paypaI`. The guard's `checkRisk()` does the same, on the name as typed. You only need `preserveCase` when you call `skeleton()` yourself.

## `areConfusable()`

`areConfusable(a, b, options?)` is `true` when the two skeletons match, compared without case or with it.

```ts run
areConfusable("rnicrosoft", "microsoft");  // → true
areConfusable("paypaI", "paypal");         // → true
areConfusable("ADMIN", "admin");           // → true
areConfusable("раураl", "paypal");         // → true
areConfusable("githuh", "github");         // → false (a different letter, not a lookalike)
areConfusable("gitlab", "github");         // → false
```

It takes `skeleton()`'s options. `ignoreDiacritics: true` also removes accents and other small marks before comparing, since a dot below a letter is easy to miss. Unicode's skeleton keeps them:

```ts run
areConfusable("ạdmin", "admin");                             // → false
areConfusable("ạdmin", "admin", { ignoreDiacritics: true }); // → true
areConfusable("mícrosoft", "microsoft");                     // → true (Unicode lists í as a lookalike of i)
```

The answer is all or nothing. For how close two names are, use `confusableDistance()`.

## `confusableDistance()`

`confusableDistance(a, b, options?)` works out the cheapest way to turn `a` into `b`, one step at a time, where swapping a character for its lookalike costs less than changing it for a different letter. It returns the total cost as `distance`, a `similarity` from 0 to 1, and the path as `steps`.

```ts run
const path = confusableDistance("rnicrosoft", "microsoft");

path.distance;       // → 0.35
path.similarity;     // → 0.965
path.skeletonEqual;  // → true
path.chainDepth;     // → 1
path.steps.length;   // → 9
path.steps[0];       // → { op: "confusable-substitution", from: "rn", to: "m", fromIndex: 0, toIndex: 0, cost: 0.35, prototype: "rn", crossScript: false, divergence: false }
path.steps[1];       // → { op: "match", from: "i", to: "i", fromIndex: 2, toIndex: 1, cost: 0 }
path.steps.map((step) => step.from).join(" "); // → "rn i c r o s o f t"
path.steps.map((step) => step.to).join(" ");   // → "m i c r o s o f t"
```

The path has nine steps for ten characters, because the first step reads two of them: `rn` in `rnicrosoft` stands for the one `m` in `microsoft`. That swap costs 0.35, and the eight matches after it cost nothing, so the distance is 0.35. `similarity` is `1 - distance / maxDistance`, where `maxDistance` is the longer string's length: 1 − 0.35 / 10 = 0.965.

### Read the steps

Each step has an `op`, the characters it reads (`from`) and writes (`to`), their positions (`fromIndex`, `toIndex`), and a `cost`:

| `op` | Cost | When |
|---|---|---|
| `match` | 0 | the same character, or the same letter in another case |
| `confusable-substitution` | 0.35, or the measured cost with `weights` | the two characters pass for the same letters in the map, including one character for two, such as `m` for `rn`; `prototype` is those letters |
| `substitution` | 1 | two characters that don't look alike |
| `deletion` | 1 | a character of `a` with nothing in `b` |
| `insertion` | 1 | a character of `b` with nothing in `a` |

Some steps carry a `reason`, and some change the cost:

| `reason` | On | Cost | When |
|---|---|---|---|
| `cross-script` | a lookalike swap | plus 0.2 | the two are letters of different scripts; `crossScript` is `true` |
| `nfkc-divergence` | a lookalike swap | plus 0.1 | one of them is a character NFKC reads differently from the map; `divergence` is `true` |
| `nfkc-equivalent` | a substitution | 0.45 | NFKC makes the two the same, but the map doesn't list them as lookalikes |
| `visual-weight` | a substitution | the measured cost | with `weights`, a measured pair the map doesn't list |
| `default-ignorable` | an insertion or deletion | 0.05 | an invisible character, such as a zero-width space |

```ts run
confusableDistance("pаypal", "paypal").steps[1];      // → { op: "confusable-substitution", from: "а", to: "a", cost: 0.55, crossScript: true, reason: "cross-script" }
confusableDistance("ſtop", "stop").steps[0];          // → { op: "substitution", from: "ſ", to: "s", cost: 0.45, reason: "nfkc-equivalent" }
confusableDistance("pay\u200Bpal", "paypal").steps[3]; // → { op: "deletion", cost: 0.05, reason: "default-ignorable" }
```

The result also counts what the path went through: `chainDepth` is the number of steps that aren't matches, `crossScriptCount` the swaps between scripts, `ignorableCount` the invisible characters, and `divergenceCount` the swaps involving a character NFKC reads differently. `skeletonEqual` says whether the two share a skeleton, and `normalizedEqual` whether they're equal after NFKC and lowercasing.

> **Note** `similarity` alone isn't a verdict. `раураl` is five cross-script swaps from `paypal`, so its similarity is 0.542, lower than `gitlab`'s 0.667 against `github`, though `раураl` looks the same and `gitlab` doesn't. What decides is the kind of step: a path of lookalike swaps and invisible characters looks alike, however long. The guard's `checkRisk()` scores that way; see [What counts as passing for a name](protect-names.md#what-counts-as-passing-for-a-name).

```ts run
confusableDistance("раураl", "paypal").similarity;  // → 0.542
confusableDistance("gitlab", "github").similarity;  // → 0.667
confusableDistance("раураl", "paypal").steps.every((step) => step.op !== "substitution"); // → true
```

## Measured weights

The maps say whether two characters look alike. The weights say how alike: `CONFUSABLE_WEIGHTS`, from `namespace-guard/confusable-weights`, has 2,300 pairs measured by [confusable-vision](where-the-data-comes-from.md) at the size and position letters have in running text. Each is keyed by one character, then the other:

```ts run
import { CONFUSABLE_WEIGHTS } from "namespace-guard/confusable-weights";

CONFUSABLE_WEIGHTS["а"]["a"];  // → { danger: 0.8824, stableDanger: 0.8824, cost: 0.1176, xidContinue: true, idnaPvalid: true, tr39Allowed: true }
```

`danger` is the share of text fonts in which the two look alike, and `cost` is 1 minus that. The flags describe the first character: `xidContinue` if it's allowed in identifiers (Unicode's XID_Continue), `idnaPvalid` if it's allowed in domain names (IDNA 2008 PVALID), `tr39Allowed` if Unicode's identifier profile allows it, and `glyphReuse` if fonts draw it with the other's glyph. [Visual weights](data.md#visual-weights) has more.

Pass them as `weights`:

- **`confusableDistance()`** charges each lookalike swap its measured cost instead of 0.35, and counts measured pairs the map doesn't list, as `visual-weight` substitutions.
- **`areConfusable()`** also returns `true` when the two strings line up character by character, each position holding the same letter, a listed lookalike or a measured pair, in order. One character may stand for two, as `m` does for `rn`.

```ts run
confusableDistance("раураl", "paypal").distance;                                 // → 2.75
confusableDistance("раураl", "paypal", { weights: CONFUSABLE_WEIGHTS }).distance; // → 1.812
areConfusable("heㅣㅣo", "hello");                                                // → false
areConfusable("heㅣㅣo", "hello", { weights: CONFUSABLE_WEIGHTS });               // → true
areConfusable("Iowa", "lima", { weights: CONFUSABLE_WEIGHTS });                  // → false (I and l are a pair; o and i aren't)
```

`context` limits which pairs count, by where the two characters may appear: `"identifier"` keeps pairs whose characters are both allowed in identifiers, `"domain"` pairs whose characters are both allowed in domain names, and `"all"`, the default, keeps every pair. Hangul `ㅣ` is measured alike to `l` in 44% of text fonts, and it can't appear in a domain name, so the pair doesn't count there. Nor does its pair with Han `丨`, though `丨` can appear in one:

```ts run
areConfusable("ㅣ", "l");                                                          // → false
areConfusable("ㅣ", "l", { weights: CONFUSABLE_WEIGHTS });                         // → true
areConfusable("ㅣ", "l", { weights: CONFUSABLE_WEIGHTS, context: "identifier" });  // → true
areConfusable("ㅣ", "l", { weights: CONFUSABLE_WEIGHTS, context: "domain" });      // → false
areConfusable("ㅣ", "丨", { weights: CONFUSABLE_WEIGHTS, context: "domain" });     // → false
```

## Two non-Latin scripts

Unicode's confusables list maps characters to a prototype, which is usually a Latin letter. It has no entry for two characters from scripts other than Latin that look like each other, so their skeletons never match. Hangul `ㅣ` (U+3163) and Han `丨` (U+4E28) are both a single vertical stroke, alike in every text font that draws both:

```ts run
skeleton("ㅣ");                                                         // → "ㅣ"
skeleton("丨");                                                         // → "丨"
areConfusable("ㅣ", "丨");                                               // → false
areConfusable("ㅣ", "丨", { weights: CONFUSABLE_WEIGHTS });               // → true
confusableDistance("ㅣ", "丨", { weights: CONFUSABLE_WEIGHTS }).steps[0]; // → { op: "substitution", from: "ㅣ", to: "丨", cost: 0, reason: "visual-weight" }
```

`detectCrossScriptRisk(identifier, options?)` looks for such pairs inside one string: letters from two scripts that look alike. It needs the weights; without them it finds no pairs.

```ts run
const risk = detectCrossScriptRisk("ㅣ丨", { weights: CONFUSABLE_WEIGHTS });
risk.scripts;              // → ["han", "hangul"]
risk.riskLevel;            // → "high"
risk.crossScriptPairs[0];  // → { a: { char: "ㅣ", script: "hangul" }, b: { char: "丨", script: "han" }, visualScore: 1 }

detectCrossScriptRisk("ㅣ丨").riskLevel;                               // → "none" (no weights)
detectCrossScriptRisk("pаypal", { weights: CONFUSABLE_WEIGHTS }).riskLevel; // → "high" (Cyrillic а among Latin letters)
```

`riskLevel` is `"high"` when a pair's `visualScore` is 0.8 or more or there are three or more pairs, `"low"` for weaker pairs, and `"none"` when there are none. It recognises 13 scripts: Latin, Cyrillic, Greek, Armenian, Hebrew, Arabic, Devanagari, Han, Hiragana, Katakana, Hangul, Georgian and Thai.
