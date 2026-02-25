# confusable-bench.v1.json source

This dataset is a reproducible benchmark corpus for Unicode namespace-risk tooling.

It is designed to be practical for:
- `namespace-guard` CLI (`calibrate`, `recommend`, `drift`)
- cross-library evaluation
- security/regression checks in CI

## Composition

The corpus is generated from:
- `COMPOSABILITY_VECTORS` (NFKC/TR39 divergence vectors)
- `CONFUSABLE_MAP_FULL` (TR39-full confusable mappings)
- deterministic synthetic variants for:
  - confusable substitutions
  - mixed-script confusables
  - default-ignorable insertions
  - bidi control insertions
  - combining mark insertions (attack-style)
  - ASCII lookalike substitutions
- curated benign controls (including precomposed and decomposed accent forms)

Each row includes at least:
- `identifier`
- `label` (`malicious` or `benign`)
- `target`

Extra fields (`category`, `threatClass`, `notes`, `protect`) are metadata for analysis and documentation.

## Regenerate

1. Build runtime exports:
   - `npm run build`
2. Generate dataset:
   - `npm run build:confusable-bench`

## Output

- `docs/data/confusable-bench.v1.json`

## Notes

This corpus intentionally includes both attack-like and benign rows.
Combining-mark rows include both malicious-style insertions and benign decomposed text to make false-positive tradeoffs explicit for opt-in combining-mark blocking.
