# composability-vectors.json source

This dataset is generated from `COMPOSABILITY_VECTORS` in the core package.

Definition:
- Character-level vectors where TR39 full confusable mapping and NFKC lowercase normalization disagree on single ASCII letter/digit outcomes.
- Vector shape: `{ char, codePoint, tr39, nfkc }`

Generation:
1. Build the package: `npm run build`
2. Generate JSON: `npm run build:composability-data`

Output file:
- `docs/data/composability-vectors.json`

Related exports:
- `NFKC_TR39_DIVERGENCE_VECTORS` (root export)
- `COMPOSABILITY_VECTOR_SUITE`
- `COMPOSABILITY_VECTORS`
- `COMPOSABILITY_VECTORS_COUNT`
- `namespace-guard/composability-vectors` subpath
