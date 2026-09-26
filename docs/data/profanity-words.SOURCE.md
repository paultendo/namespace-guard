# profanity-words.json source

Source dataset: `https://github.com/zautumnz/profane-words/blob/master/words.json`

Upstream license: WTFPL (Do What The Fuck You Want To Public License), v2.
Thanks to `zautumnz` and all contributors who assembled and maintained the original list.

Local modifications for namespace-guard playground:
- Removed (curation/false-positive pass): `sexy`, `wet dream`, `whitey`, `whop`, `yed`, `xrated`, `yellow showers`, `yury`, `yank`, `willy`, `willie`, `whit`, `vibr`, `uzi`, `usama`, `twink`, `twinkie`, `tush`, `tushy`, `trots`, `sexual`, `transexual`, `trisexual`, `tit`, `tied up`, `taste my`, `sucker`, `squa`, `squarehead`, `skank`, `shag`, `nut butter`, `mams`, `gypsy`, `ero`, `dudette`, `cooly`, `coolie`, `chunkys`, `chunkies`, `bicurious`, `bi curious`, `deth`, `foursome`, `gae`, `hardcore`, `take off your`
- Added: `putangina`, `putang ina`, `putang-ina`, `skrote`, `skrotum`, `assclart`, `rasclart`, `rasclat`, `rassclart`, `pussyclart`, `pussy clart`, `pussy claat`, `pussyclaat`, `ediat`, `bumboraas`, `fassyhole`, `battyhole`, `battyman`, `chi chi man`, `chichiman`, `pussyhole`, `raasclaat`, `raasclat`, `rassclat`, `raasclot`, `bomboclaat`, `bomboclat`, `bumboclaat`, `bumboclat`, `battybwoy`, `battyboy`, `skunt`, `pussyclot`, `idiat`, `paedo`, `paedophilia`, `paedophiliac`
- Normalized to lowercase and de-duplicated
- Removed in 0.23.0 because they are first names, surnames or places (78 entries, with leetspeak and spaced forms of
  them): `areola`, `aryan`, `bint`, `blackman`, `bong`, `boozer`, `bosch`, `carruth`, `d0ng`, `damm`,
  `dink`, `dix`, `dong`, `ekrem`, `f4nny`, `fatah`, `ficken`, `fok`, `gai`, `ganja`, `gaylord`, `gipp`, `gooch`,
  `gora`, `guido`, `gummer`, `h e l l`, `h0ar`, `h0r`, `hadji`, `haji`, `hard core`, `he11`, `hebe`, `hoare`,
  `hooker`, `hui`, `ike`, `jerry`, `jiggy`, `kinky`, `kock`, `kuntz`, `kwa`, `l3i+ch`, `l3i\+ch`, `l3itch`, `lech`,
  `lucifer`, `lynch`, `massa`, `mick`, `moron`, `naked`, `nimrod`, `noonan`, `o c k`, `packie`, `paddy`, `pansy`,
  `phuc`, `polak`, `pollock`, `pula`, `punta`, `reich`, `sanchez`, `santorum`, `schaffer`, `shota`, `sissy`, `skeet`,
  `stagg`, `stoner`, `titi`, `toots`, `wang`, `weiner`. The rule: an entry (or what it reads as) is on Apple's or
  BSD's common-name lists, is a city, country or airport name or part of one in macOS's data, or is the first name or
  surname of at least one actor, politician or athlete in macOS's gazetteer. Fourteen such entries stay because the
  slur or sexual sense is the likelier reading of a handle: `dick`, `dicks`, `dyke`, `gook`, `coons`, `negro`, `nig`,
  `jiz`, `quim`, `swastika`, `cooter`, `lolita`, `mong`, `cumming`.

`profanity-allowlist.json` (and `PROFANITY_ALLOWLIST_EN` in `namespace-guard/profanity-en`) holds 2,278 names, places
and common words that contain a listed word, which the validator lets through (`scunthorpe`, `dickson`, `woodpecker`).
`node scripts/measure-profanity.mjs --write` derives it, after `npm run build`, from openly licensed data kept in
`.cache/open-names/` (not in the repository):

- First names: ONS, Baby names in England and Wales from 1996 (1996 to 2025, every name given to 3 or more babies in a
  year), https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/datasets/babynamesinenglandandwalesfrom1996.
  Contains public sector information licensed under the Open Government Licence v3.0.
- Surnames: US Census Bureau 2010 surnames (every surname with 100 or more bearers),
  https://www2.census.gov/topics/genealogy/2010surnames/names.zip. Public domain.
- Places: GeoNames, UK populated places and administrative areas (`GB.txt`, feature classes P and A) and places of
  1,000 people or more worldwide (`cities1000.txt`), by name and ASCII name, whole and each part,
  https://download.geonames.org/export/dump/. CC BY 4.0: place names from GeoNames (https://www.geonames.org/).
- Common words: `/usr/share/dict/words` (Webster's Second International, 1934). Public domain.

A word is allowed when the list refuses it without an allowlist, it isn't itself on the list, and:

- as a first name or surname, it isn't a listed word joined to one English word ("thunderfuck");
- as a dictionary word, it isn't a listed word with only affixes around it ("masturbator");
- it passes the slur screen: no word containing a slur stem (`nigg`, `nigr`, `negro`, `coon`, `golliwog`, `chink`,
  `gook`, `kike`, `wog`, `paki`, `spic`, `fag`, `tranny`, `retard`, `raghead`, `towelhead`, `wetback`, `darkie`,
  `gyppo`, `pikey`, `dago`, `sambo`, `squaw`, `redskin`, `beaner`, `wigger`, `jigaboo`, `zipperhead`, `chinaman`,
  `shemale`), so names and places that look like a slur are refused too (`niggli`, `negron`, `faggett`, `coonskin`);
- it passes the crude screen: no word containing a crude or sexual stem (`whore`, `slut`, `piss`, `bitch`, `bastard`,
  `tits`, `titty`, `titt`, `boob`, `clit`, `penis`, `vagin`, `vulv`, `scrot`, `sodom`, `incest`, `nympho`, `fetish`,
  `erotic`, `erotism`, `cum`, `wank`, `boner`, `jizz`, `dildo`, `felch`, `puss`, `porn`), so `bitchfield`,
  `cummings` and `micropenis` are refused;
- it isn't on the reviewed refusals (`REVIEWED_OUT` in the script).

`SCREEN_EXCEPTIONS` in the script lists the words the screens let through, each with its reason: `montenegro`,
`negroponte`, `rionegro`, `gobbledygook`, `squawk`, `denigrate`, `denigration`, `winegrower`, `winegrowing`,
`pinegrove`, `dagostino`, `dagostini`, `panigrahi`, `schinkel`, `negroni`, `clitheroe`, `penistone`, `cummerbund`,
`scummy`, `swank`, `swanky`, `tittle`, `titter`, `tittup`, `pettitt`, `petitt`, `carbonera`, `carbonero`,
`princestown`, `cummings`, `cummins`, `nwankwo`, `mahboob`, `mehboob`, `stitt`, `konigslutter`, `koenigslutter`.
`REVIEWED_IN` adds `thorndike`, `dagostino`, `shizhong`, `montenegro`, `negroponte`, `shizuka` and `dikembe`, which no
rule would. UK populated places named "X cum Y" in GeoNames are added as exact entries, written with hyphens
(`chorlton-cum-hardy`, `stow-cum-quy`): the validator lets through only a name that is exactly one of them. The script needs Node and the `unzip` command; see its
header.

This file feeds:
- Playground moderation demo policy
- `namespace-guard/profanity-en` curated default list export
- `docs/data/profanity-words.global.js` preload asset, with `profanity-allowlist.json` (generated via `npm run build:profanity-data`)

The core `namespace-guard` package remains zero-dependency and does not require external moderation dependencies.
