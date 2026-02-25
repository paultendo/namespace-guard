# profanity-words.json source

Source dataset: `https://github.com/zautumnz/profane-words/blob/master/words.json`

Upstream license: WTFPL (Do What The Fuck You Want To Public License), v2.
Thanks to `zautumnz` and all contributors who assembled and maintained the original list.

Local modifications for namespace-guard playground:
- Removed (curation/false-positive pass): `sexy`, `wet dream`, `whitey`, `whop`, `yed`, `xrated`, `yellow showers`, `yury`, `yank`, `willy`, `willie`, `whit`, `vibr`, `uzi`, `usama`, `twink`, `twinkie`, `tush`, `tushy`, `trots`, `sexual`, `transexual`, `trisexual`, `tit`, `tied up`, `taste my`, `sucker`, `squa`, `squarehead`, `skank`, `shag`, `nut butter`, `mams`, `gypsy`, `ero`, `dudette`, `cooly`, `coolie`, `chunkys`, `chunkies`, `bicurious`, `bi curious`, `deth`, `foursome`, `gae`, `hardcore`, `take off your`
- Added: `putangina`, `putang ina`, `putang-ina`, `skrote`, `skrotum`, `assclart`, `rasclart`, `rasclat`, `rassclart`, `pussyclart`, `pussy clart`, `pussy claat`, `pussyclaat`, `ediat`, `bumboraas`, `fassyhole`, `battyhole`, `battyman`, `chi chi man`, `chichiman`, `pussyhole`, `raasclaat`, `raasclat`, `rassclat`, `raasclot`, `bomboclaat`, `bomboclat`, `bumboclaat`, `bumboclat`, `battybwoy`, `battyboy`, `skunt`, `pussyclot`, `idiat`, `paedo`, `paedophilia`, `paedophiliac`
- Normalized to lowercase and de-duplicated

This file feeds:
- Playground moderation demo policy
- `namespace-guard/profanity-en` curated default list export
- `docs/data/profanity-words.global.js` preload asset (generated via `npm run build:profanity-data`)

The core `namespace-guard` package remains zero-dependency and does not require external moderation dependencies.
