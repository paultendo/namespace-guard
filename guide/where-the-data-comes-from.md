# Where the data comes from

namespace-guard decides what passes for what from two sources: Unicode's own list, and measurements of how alike characters look in real fonts.

## Unicode's confusables list

Unicode publishes [confusables.txt](https://www.unicode.org/Public/security/latest/confusables.txt), a list of characters that can be mistaken for others, as part of its security recommendations (UTS #39). namespace-guard builds its maps from the latest version, dated 2026-08-06: `CONFUSABLE_MAP_FULL` has 2,216 entries and `CONFUSABLE_MAP`, which leaves out the ones NFKC normalisation already handles, has 1,018. `CONFUSABLES_DATE` tells you which version you have.

The list says which characters can be confused, but not how alike they look, in which fonts, or at what size. Some of its entries hold up only in unusual fonts; others miss characters that pass for a letter in ordinary ones.

## Measured in 322 fonts

[confusable-vision](https://github.com/paultendo/confusable-vision) measures it. Its current release, 2026.09.26, compares 64,751 characters in 322 fonts: every font that ships with macOS, plus Roboto, Noto and DejaVu. Each glyph is measured from its outline by firing rays through it ([RaySpace](https://paultendo.github.io/posts/rayspace-methodology/)), at the size and baseline position it has in running text, so a character that only matches when enlarged doesn't count.

<figure class="figure-wide"><img src="../../images/rays.png" alt="The same rays through the Latin capital O and Ol Chiki letter at (U+1C5B): where each ray enters and leaves the ink, and its path through the ink, match." loading="lazy" width="2400" height="1460"></figure>

It finds 11,517 pairs alike in at least one font or combination of fonts, and 5,975 pass its thresholds. namespace-guard ships the 2,300 of those where one character is an ASCII letter or digit, or the two are in different scripts. Pairs within one script, such as Hangul jamo variants or Arabic positional forms, are left out: they don't help anyone impersonate a Latin name.

## Checked in place

Measuring two characters side by side isn't the same as reading one in a word. So every lookalike of an ASCII letter, digit or two-letter sequence is also checked in place: set between other letters in the system font at 13 px and in Helvetica, Arial, Times New Roman and Georgia at 16 px, at 1x and 2x, and compared with pairs everyone accepts as alike, `0` and `O`, `1` and `l`, `I` and `l`.

Each gets a tier:

| Tier | Means |
|---|---|
| strict | as alike as the median accepted pair in that font |
| broad | as alike as the least alike accepted pair |
| design | alike only because one font draws both the same way |

394 lookalikes that Unicode doesn't list passed, such as Hebrew `א`, alike to `x` in Arial at 16 px. They're in `CONFUSABLE_MAP_FULL` and `MEASURED_CONFUSABLES`; `CONFUSABLE_MAP`, which the lookalike validator uses to refuse a name, takes only the strict tier.

```ts run
MEASURED_CONFUSABLES["א"];                     // → { letter: "x", tier: "strict", contexts: ["Arial 16"] }
CONFUSABLE_MAP_FULL["א"];                      // → "x"
Object.keys(MEASURED_CONFUSABLES).length;      // → 974
CONFUSABLES_DATE;                              // → "2026-08-06, 01:05:35 GMT"
```

`MEASURED_CONFUSABLES` holds every character the in-place check found alike to an ASCII letter or digit, Unicode's entries included, with its tier and the fonts and sizes where it holds.

The same data is used beyond namespace-guard: [addons.mozilla.org](https://addons.mozilla.org/) checks add-on names for lookalikes with characters from it, [credited in Mozilla's source](https://github.com/mozilla/addons-server/blob/master/src/olympia/amo/confusables.py#L4-L6), and [disarm](https://disarm.dev/) and [SilverSpeak](https://acmcmc.github.io/silverspeak/) use it too.

## Letters built on Latin letters

`canonicalise()` also folds letters with a stroke, hook or accent to the letter they're built on, such as `ŧ` to `t`. That table comes from the Unicode Character Database (17.0.0): each letter's name and decomposition, and whether it's in modern use, from `IdentifierType.txt`.

## Licences

The measurements are CC BY 4.0, from confusable-vision. Unicode's data is under the Unicode License v3. namespace-guard's code is MIT. `THIRD-PARTY-NOTICES.md` in the package has the details.
