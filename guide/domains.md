# Domain names

`isDomainSpoof(label, target, options?)` tells you whether a domain label, such as the `раураӏ` in `раураӏ.com`, is a lookalike of one of yours that someone could register. It compares one label with one target and scores how alike they look. It's for domain names; for usernames, use the guard (see [Protect names](protect-names.md)).

## Check a label

Every letter in this `раураӏ` is Cyrillic: `р`, `а`, `у`, `р`, `а` and `ӏ` (palochka). Pass the measured weights from `namespace-guard/confusable-weights` to score how alike each pair looks:

```ts run
import { isDomainSpoof } from "namespace-guard";
import { CONFUSABLE_WEIGHTS } from "namespace-guard/confusable-weights";

isDomainSpoof("раураӏ", "paypal", { weights: CONFUSABLE_WEIGHTS }); // → { spoof: true, script: "cyrillic", danger: 0.781 }
isDomainSpoof("рaypal", "paypal", { weights: CONFUSABLE_WEIGHTS }); // → { spoof: false } (Cyrillic р, Latin aypal)
isDomainSpoof("paypal", "paypal", { weights: CONFUSABLE_WEIGHTS }); // → { spoof: false } (the same label)
```

The result:

| Field | What it is |
|---|---|
| `spoof` | `true` when the label is a one-script lookalike of the target and `danger` is at least `minDanger` |
| `script` | the label's script, such as `"cyrillic"`, whenever it matched the target letter for letter, even if `spoof` is `false` |
| `danger` | the average similarity of the letters that differ, from 0 to 1 |
| `substitutions` | one entry per letter that differs: `{ index, from, to, similarity }`, where `from` is the target's letter and `to` the label's |

When the label isn't a lookalike at all, the result is `{ spoof: false }` with no other fields.

## Why mixed-script labels are left out

Most registries follow ICANN's rules for internationalised domain names, under which the letters in a label come from one script, with exceptions for languages such as Japanese that mix scripts. A label like `рaypal`, with one Cyrillic letter among Latin ones, is refused by most registries, while `раураӏ`, all Cyrillic, can be registered wherever Cyrillic is allowed.

So `isDomainSpoof()` only flags a label written wholly in one script other than the target's. Digits and hyphens don't count towards a script. To compare names where mixing is possible, such as usernames or a mixed-script domain that is already registered, use `areConfusable()` or `skeleton()`; see [Comparing names](comparing-names.md).

## What it checks

1. Both strings are NFKC-normalised and lowercased, and invisible characters are removed.
2. A label equal to the target, or of a different length, is not a spoof. It compares letter by letter, so a two-letter lookalike such as `rn` for `m` isn't considered.
3. A label on the `allowlist` is not a spoof.
4. The label's letters must all be in one script, and not the target's script. The scripts it recognises are Latin, Cyrillic, Greek, Armenian, Hebrew, Arabic, Devanagari, Han, Hiragana, Katakana, Hangul, Georgian and Thai.
5. Every letter that differs from the target's letter at the same position must be a lookalike of it: listed in the confusables map, or measured in the weights. One that isn't ends the check with `{ spoof: false }`.
6. `danger` is the average similarity of those letters, and `spoof` is `danger >= minDanger`.

> **Note** Letters from scripts outside that list, such as Cherokee or Lisu, are treated like digits: they aren't compared and don't count as a script. A label written wholly in one of them gives `{ spoof: false }`.

Pass one label, not a whole domain. In `раураӏ.com` the `com` is Latin, so the string as a whole mixes scripts:

```ts run
isDomainSpoof("раураӏ.com", "paypal.com", { weights: CONFUSABLE_WEIGHTS }).spoof;              // → false
isDomainSpoof("раураӏ.com".split(".")[0], "paypal", { weights: CONFUSABLE_WEIGHTS }).spoof;    // → true
isDomainSpoof("PayPal", "paypal", { weights: CONFUSABLE_WEIGHTS }).spoof;                      // → false (same script)
isDomainSpoof("раураӏ", "PayPal", { weights: CONFUSABLE_WEIGHTS }).spoof;                      // → true (case doesn't matter)
```

Domains often arrive in punycode, the ASCII form DNS uses: `раураӏ.com` is `xn--80aa0cbo65f.com`. Convert to Unicode first, since a punycode label is ASCII and never matches. In Node:

```ts title="In your app"
import { domainToUnicode } from "node:url";

const [label] = domainToUnicode("xn--80aa0cbo65f.com").split("."); // "раураӏ"
isDomainSpoof(label, "paypal", { weights: CONFUSABLE_WEIGHTS });
```

## Weights and danger

Without weights, every lookalike in Unicode's confusables list scores 0.5, so `danger` is 0.5 for any match, and a match is a spoof at the default `minDanger`. With `CONFUSABLE_WEIGHTS`, each pair scores its measured similarity: the share of fonts in which the two letters look alike, measured by [confusable-vision](where-the-data-comes-from.md). A pair Unicode lists never scores below 0.5, and pairs Unicode doesn't list can match too, if they were measured.

```ts run
const withoutWeights = isDomainSpoof("раураӏ", "paypal");
withoutWeights.danger; // → 0.5

const measured = isDomainSpoof("раураӏ", "paypal", { weights: CONFUSABLE_WEIGHTS });
measured.danger;           // → 0.781
measured.substitutions[0]; // → { index: 0, from: "p", to: "р", similarity: 0.8 }
measured.substitutions[5]; // → { index: 5, from: "l", to: "ӏ", similarity: 0.5 }
```

Only pairs valid in domain names count: the weights are filtered to characters that IDNA 2008 allows (PVALID). The `map` option replaces the confusables map, which is `CONFUSABLE_MAP_FULL` by default.

## Set the threshold: minDanger

`minDanger` is the lowest `danger` that counts as a spoof, 0.5 by default. Raise it to flag fewer labels, keeping the ones that look most alike. `script` and `danger` come back whatever the verdict, so you can also ignore `spoof` and apply your own threshold, or sort labels by `danger`.

```ts run
isDomainSpoof("раураӏ", "paypal", { weights: CONFUSABLE_WEIGHTS, minDanger: 0.8 }); // → { spoof: false, script: "cyrillic", danger: 0.781 }

// Greek: each letter is a lookalike, but ι for l is a poor one
isDomainSpoof("ραγραι", "paypal", { weights: CONFUSABLE_WEIGHTS }); // → { spoof: false, script: "greek", danger: 0.429 }
```

## Skip real words: allowlist

A real word in another script can match a Latin name letter for letter. Russian `сор` (rubbish) reads as `cop`. Put labels you know are genuine in `allowlist`; they're normalised the same way as the label before comparing.

```ts run
isDomainSpoof("сор", "cop", { weights: CONFUSABLE_WEIGHTS }).spoof;                        // → true
isDomainSpoof("сор", "cop", { weights: CONFUSABLE_WEIGHTS, allowlist: ["сор"] }).spoof;    // → false
```

## Check against several names

`isDomainSpoof()` compares with one target at a time. To check a label against all your names, loop over them:

```ts run
const ours = ["paypal", "apple", "scope"];
const label = "аррӏе"; // all Cyrillic

const targets = ours.filter((name) => isDomainSpoof(label, name, { weights: CONFUSABLE_WEIGHTS }).spoof);
targets; // → ["apple"]
```

## Registered domains: d0ma1n

`isDomainSpoof()` judges a label you already have. It doesn't find lookalikes or tell you whether one is registered. [d0ma1n](https://d0ma1n.app) does that for registered domains: give it your domain, and it generates the lookalikes someone could register, scores them with the same measurements, and checks which already are.
