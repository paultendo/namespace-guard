# Text for LLMs

Lookalike letters can't fool an LLM, but they can make it cost up to 5.7x as much to read: each one takes several tokens, and the model still reads the text correctly. `canonicalise()` puts the letters back before the text reaches the model.

## The problem: Denial of Spend

In February 2026 I tested this on four models with a contract whose words were spelt with lookalikes: `поŧ` for not, `ᵂİŧɦouŧ` for without. No model misread a clause. But the flooded contract took 5.2x the tokens of the clean one. I call this Denial of Spend: an attack that can't change what the service does, but can multiply what it costs to run.

In September 2026 I reran it on GPT-6 Astra, Sol and Luna and Claude Fable 5.1, Opus 5.5, Sonnet 5 and Haiku 4.5, with a rebuilt contract:

| Model | Clean | Flooded | Tokens |
|---|---:|---:|---:|
| GPT-6 (all three) | 763 | 4,336 | 5.7x |
| Claude Fable 5.1, Opus 5.5, Sonnet 5 | 1,260 | 5,059 | 4.0x |
| Claude Haiku 4.5 | 861 | 4,949 | 5.7x |

These are the contract's own tokens, and reading is only part of the bill. The model's answer isn't flooded, and output tokens cost more, so the bill for each question rose by up to 3.9x, depending on how much the model wrote back. For work that is all reading, such as embedding documents for search, the bill rises by the full 4x to 5.7x. The [results](https://github.com/paultendo/confusable-vision/blob/main/data/output/denial-of-spend/RESULTS.md#the-bill) have the bill for each model.

Every model still read every flipped word correctly. The [results](https://github.com/paultendo/confusable-vision/blob/main/data/output/denial-of-spend/RESULTS.md) are published with the documents and scripts.

## Put the letters back

```ts run
import { canonicalise } from "namespace-guard";

canonicalise("The seller аssumes аll liаbility.");  // → "The seller assumes all liability."
canonicalise("shall поŧ be limited");               // → "shall not be limited"
canonicalise("Tɦİs ƙİŧe");                          // → "This kite"
canonicalise("Москва is the capital");              // → "Москва is the capital"
canonicalise("İstanbul is in Türkiye");             // → "İstanbul is in Türkiye"
```

It rewrites a word only when the word shows a sign of tampering:

- it mixes Latin with another script, as `поŧ` does (Cyrillic `п` and `о`, Latin `ŧ`);
- it has a Latin letter no modern language uses, such as `ɦ` or `ꞡ`, or a fullwidth or mathematical letter;
- it has a non-ASCII capital inside a lowercase word, as in `ŧİme`;
- it has Latin letters and a listed lookalike scoring at least `threshold` (0.7 by default).

In such a word every lookalike goes back to its Latin letter, whatever its score, and a letter with a stroke, hook or accent (`ŧ`, `İ`, `ɏ`) goes back to the letter it's built on. The case follows the word: a capital swapped into a lowercase word comes back lowercase, and at the start of a word it stays a capital only at the start of a sentence.

Words with no sign of tampering are left alone. That's what keeps Russian, Greek, Turkish or Sámi text intact.

## Known-Latin documents

If you know the document is in English, or another language written with plain Latin letters, use `strategy: "all"`. Every word is rewritten, including all-Cyrillic words made to look like English and ordinary accented letters.

```ts run
canonicalise("поп-refundable", { strategy: "all" });   // → "non-refundable"
canonicalise("ԝаіⅴеѕ any right", { strategy: "all" }); // → "waives any right"
canonicalise("İstanbul", { strategy: "all" });         // → "Istanbul"
```

On the September test contract, `strategy: "all"` restores the flooded contract byte for byte, so it takes as many tokens as the clean one. The default leaves nine short words, `to` and `at` spelt with the Sámi `ŧ`, which have no other sign of tampering: 1.02x to 1.03x the clean contract's tokens.

## Check before you pay

`isClean()` is `true` exactly when `canonicalise()` would leave the text as it is. It stops at the first word it would change, so it's cheap to run on everything.

```ts run
isClean("The seller assumes all liability.");       // → true
isClean("The seller liаbility clause applies.");    // → false
isClean("Москва is the capital");                   // → true
isClean("поп-refundable", { strategy: "all" });     // → false
```

`scan()` tells you what it found: each character, what it stands for, the word it's in, and a risk level from `none` to `high`.

```ts run
const report = scan("Tɦİs is ŧɦe liaꞡility");
report.summary.riskLevel;                                   // → "high"
report.findings.map((f) => `${f.char} ${f.latinEquivalent}`); // → ["ɦ h", "İ I", "ŧ t", "ɦ h", "ꞡ g"]
report.findings[2].source;                                  // → "fold"
```

A finding's `source` is `tr39` for Unicode's confusables list, `novel` for a pair [confusable-vision](where-the-data-comes-from.md) measured, or `fold` for a letter folded to the letter it's built on.

## Where it fits

Run it after you extract the text and before you send it:

```text
document → extract text → isClean? → canonicalise → model
                              ↓ no
                         scan → log it, flag it for review
```

> **Tip** Keep the original. The rewritten text is for the model; if the document is evidence of an attack, you'll want the bytes as they arrived.

> **Careful** A model that reads through lookalikes doesn't tell you they were there. In the September tests, GPT-6 Astra quoted the flipped clauses back in plain letters and never mentioned the substitutions, though it found them all when asked directly. If tampering matters to you, check for it yourself with `isClean()` or `scan()`.

## Options

| Option | Default | What it does |
|---|---|---|
| `strategy` | `"mixed"` | `"mixed"` rewrites words that show a sign of tampering; `"all"` rewrites every word |
| `threshold` | `0.7` | the score at which a listed lookalike on its own marks a word as tampered; set it, and it's also a floor below which nothing is replaced |
| `includeNovel` | `true` | use pairs confusable-vision measured, as well as Unicode's list |
| `scripts` | all | only replace characters from these scripts, such as `["Cyrillic", "Greek"]` |
| `maxSizeRatio` | `3` | skip measured pairs whose sizes differ by more than this |
| `riskTerms` | legal and financial terms | `scan()` only: words that raise the risk level when targeted |

It's quick: the 4,300-character flooded contract takes under 2 ms.
