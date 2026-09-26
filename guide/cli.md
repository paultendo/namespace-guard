# The CLI

namespace-guard has a command-line tool. It checks names, scores lookalikes of the names you protect, generates attacks against them, suggests thresholds from labelled examples, and gives you checks to run in CI.

## Run it with npx

You don't need to install anything to try it. `npx` downloads the package the first time, and in a project that already has namespace-guard installed it runs that copy:

```bash
npx namespace-guard check acme-corp
```

```text
✓ acme-corp is available
```

`npx namespace-guard --help` lists every command and option. `npx namespace-guard <command> --help`, or `npx namespace-guard help <command>`, shows one command's usage, options and examples.

| Command | What it does | Exit code |
|---|---|---|
| [`check <name>`](#check) | checks format and reserved names, and with a database URL, your tables | 0 if available, 1 if not |
| [`risk <name>`](#risk) | scores a name against your protected names | 1 if it blocks, otherwise 0 |
| [`attack-gen <name>`](#attack-gen) | generates lookalikes of a name and scores each one | 0 |
| [`audit-canonical <file>`](#audit-canonical) | finds stored names that collide once normalised | 1 if it finds any, otherwise 0 |
| [`calibrate <file>`](#calibrate) | suggests thresholds from labelled names | 0 |
| [`recommend <file>`](#recommend) | `calibrate` and `drift` together, with a config to paste | 0 |
| [`drift [file]`](#drift) | counts names whose verdict changes between the two character maps | 0 |

Every command also exits with 1 on a usage error: an unknown command, a missing argument, a flag with a bad value, or a file it can't find or parse.

## The config file

The CLI reads `namespace-guard.config.json` from the current directory, or the file you name with `--config <path>`. Without one, nothing is reserved and names are checked against the default pattern. It reads three keys:

| Key | What it is |
|---|---|
| `reserved` | a list of names, or categories of names, as in [`reserved`](configuration.md#reserved) |
| `sources` | the tables `check --database-url` looks in, as in [`sources`](configuration.md#sources) |
| `pattern` | the pattern, as a string without slashes or flags |

```json
{
  "reserved": {
    "system": ["admin", "api", "settings", "login"],
    "brand": ["acme"]
  },
  "pattern": "^[a-z0-9][a-z0-9-]{2,39}$",
  "sources": [
    { "name": "users", "column": "handle_canonical", "scopeKey": "id" },
    { "name": "organizations", "column": "slug_canonical", "scopeKey": "id" }
  ]
}
```

Everything else is ignored, including `messages`, `risk` and `caseInsensitive`. Risk settings come from flags on each command, so pass the same values your app's config uses. Messages are always the defaults, so a pattern of your own is still described as "Use 2-30 lowercase letters, numbers, or hyphens.":

```bash
npx namespace-guard check ab
```

```text
✗ ab — Use 2-30 lowercase letters, numbers, or hyphens.
```

## `check`

`check <name>` normalises the name, then checks it against the pattern and your reserved names, as `guard.check()` does. It prints the canonical form and the result.

```bash
npx namespace-guard check @Sarah
npx namespace-guard check admin
```

```text
✓ sarah is available
✗ admin — That name is reserved. Try another one.
```

| Flag | What it does |
|---|---|
| `--config <path>` | the config file to read |
| `--database-url <url>` | also look the name up in every source, in a PostgreSQL database |

With `--database-url`, the CLI connects with `pg`, which you install yourself (`npm install pg`), and queries each source through the [raw SQL adapter](adapters.md#raw-sql):

```bash
npx namespace-guard check sarah --database-url postgres://localhost/app
npx namespace-guard check Acme-Corp --database-url postgres://localhost/app
```

```text
✗ sarah — That name is already in use. (source: users)
✗ acme-corp — That name is already in use. (source: organizations)
```

`check` exits with 0 when the name is available and 1 when it isn't. It doesn't score lookalikes of protected names; `risk` does that. `--database-url` works with `check` only.

## `risk`

`risk <name>` scores the name against your protected names, as `guard.checkRisk()` does, and prints the score, the action and the closest match. The protected names are those you pass with `--protect`, and the reserved names from the config file.

```bash
npx namespace-guard risk paypa1 --protect paypal
npx namespace-guard risk githuh --protect github,paypal
npx namespace-guard risk acrne
```

```text
⛔ paypa1 — risk 100/100 (block)
Top match: paypal (score 94, distance 0.35, chain depth 1)
Signals: TR39 skeleton collision
⚠ githuh — risk 69/100 (warn)
Top match: github (score 69, distance 1, chain depth 1)
Signals: one letter changed, added, dropped or swapped, not a lookalike
⛔ acrne — risk 100/100 (block)
Top match: acme (score 93, distance 0.35, chain depth 1)
Signals: TR39 skeleton collision
```

`acrne` blocks because `acme` is reserved in the config file above. The name is scored as typed, so `risk paypaI --protect paypal` blocks, but the first line shows its canonical form, `paypai`.

| Flag | Default | What it does |
|---|---|---|
| `--protect <names>` | none | a protected name; repeat the flag or separate names with commas |
| `--no-reserved` | off | don't protect the config file's reserved names |
| `--leetspeak` | off | count digits and symbols standing for letters as lookalikes |
| `--warn-threshold <n>` | `45` | the score at which the action is `warn` |
| `--block-threshold <n>` | `70` | the score at which it's `block` |
| `--max-matches <n>` | `3` | how many matches the JSON lists |
| `--fail-on <mode>` | `block` | `block` exits with 1 on a block; `warn` exits with 1 on a warning too |
| `--json` | off | print the full `checkRisk()` result as JSON |

> **Note** With no `--protect` and no reserved names in a config file, nothing is protected: a name scores only for lookalike or invisible characters of its own, so `risk paypa1` is allowed. The CLI doesn't fall back to the built-in list that `claim()` and `enforceRisk()` use.

Leetspeak and the exit code:

```bash
npx namespace-guard risk p4ypal --protect paypal
npx namespace-guard risk p4ypal --protect paypal --leetspeak
npx namespace-guard risk githuh --protect github --fail-on warn; echo "exit $?"
```

```text
⚠ p4ypal — risk 69/100 (warn)
Top match: paypal (score 69, distance 1, chain depth 1)
Signals: one letter changed, added, dropped or swapped, not a lookalike
⛔ p4ypal — risk 94/100 (block)
Top match: paypal (score 94, distance 0.35, chain depth 1)
Signals: 1 leetspeak swap(s)
⚠ githuh — risk 69/100 (warn)
Top match: github (score 69, distance 1, chain depth 1)
Signals: one letter changed, added, dropped or swapped, not a lookalike
exit 1
```

With `--json`, the output is the same object `checkRisk()` returns; [The guard](guard.md#the-result) describes each field:

```bash
npx namespace-guard risk githuh --protect github --json
```

```text
{
  "identifier": "githuh",
  "normalized": "githuh",
  "score": 69,
  "level": "medium",
  "action": "warn",
  "canBlock": false,
  "reasons": [
    {
      "code": "confusable-target",
      "message": "Identifier is spelled close to protected target \"github\", with no lookalike.",
      "weight": 69
    }
  ],
  "matches": [
    {
      "target": "github",
      "score": 69,
      "distance": 1,
      "chainDepth": 1,
      "skeletonEqual": false,
      "evidence": "typo",
      "reasons": [
        "one letter changed, added, dropped or swapped, not a lookalike"
      ]
    }
  ]
}
```

## `attack-gen`

`attack-gen <name>` makes the lookalikes an attacker would try: the name with one or two characters swapped for lookalikes, or with a zero-width character inserted. It scores each against the name, or against your `--protect` list, and reports how many would get through. A variant gets through, and counts as a bypass, when it isn't blocked and your pattern accepts it.

```bash
npx namespace-guard attack-gen paypal --max-candidates 5 --no-ignorables
```

```text
Attack generation results for "paypal" (normalized: "paypal")
Mode: evasion, map: CONFUSABLE_MAP_FULL, protect: [paypal], generated: 200 (confusable 189, ascii-lookalike 11, ignorable 0)
Leetspeak swaps are not lookalikes unless --leetspeak is set: they warn at most, so non-blocking ones count as bypasses.
Outcomes: allow 0, warn 10, block 190
Bypasses (non-blocking + format-valid): 10
Top allow/bypass candidates:
  "p4ypal" score 69 (warn) edits 1 vs paypal
  "payp4l" score 69 (warn) edits 1 vs paypal
  "ｐ4ypal" score 69 (warn) edits 2 vs paypal
  "𝐩4ypal" score 69 (warn) edits 2 vs paypal
  "𝑝4ypal" score 69 (warn) edits 2 vs paypal
Top risk candidates:
  "paypa1" score 100 (block) edits 1 vs paypal
  "paypaｌ" score 100 (block) edits 1 vs paypal
  "paypaⅼ" score 100 (block) edits 1 vs paypal
  "paypaℓ" score 100 (block) edits 1 vs paypal
  "paypaＬ" score 100 (block) edits 1 vs paypal
```

Every Unicode lookalike blocks. The ten bypasses all use `4` for `a`, which is leetspeak: it reads as the word but doesn't look like it, so by default it warns. Run the same command with `--leetspeak`, as your guard would score with `risk: { leetspeak: true }`, and all 200 block.

| Flag | Default | What it does |
|---|---|---|
| `--mode <kind>` | `evasion` | `evasion` adds digits for letters (`4` for `a`, `1` for `l`, `0` for `o`) to the Unicode lookalikes; `impersonation` uses Unicode lookalikes only |
| `--map <map>` | `full` in evasion mode, `filtered` in impersonation mode | the map the lookalikes come from and are scored with: `full` is `CONFUSABLE_MAP_FULL`, `filtered` is `CONFUSABLE_MAP` |
| `--max-edits <n>` | `2` | swap one character, or up to two |
| `--max-per-char <n>` | `8` | how many lookalikes to try for each character |
| `--no-ignorables` | off | don't insert zero-width characters |
| `--max-candidates <n>` | `25` | how many variants each list shows, up to 50. It also caps how many are generated, at 20 times this number or 200, whichever is more |
| `--protect`, `--no-reserved`, `--leetspeak`, the thresholds, `--max-matches` | as for `risk` | how each variant is scored; without `--protect`, the name itself is protected |
| `--json` | off | print the counts and the lists, with each variant's swaps, score and whether the pattern accepts it |

`attack-gen` always exits with 0. To fail a build on a bypass, read `bypassCount` from the JSON; see [In CI](#in-ci).

## `audit-canonical`

Before you add a unique index to a canonical column, find the stored names that would collide on it. `audit-canonical <file>` reads a JSON array exported from your table, normalises each name as the guard does, and reports names that end up the same.

```json
[
  { "id": "u1", "handle": "Sarah" },
  { "id": "u2", "handle": "sarah" },
  { "id": "u3", "handle": "ｓａｒａｈ" },
  { "id": "u4", "handle": "tom", "handle_canonical": "tom" },
  { "id": "u5", "handle": "Zoe", "handle_canonical": "Zoe" }
]
```

```bash
npx namespace-guard audit-canonical users.json
```

```text
Canonical audit (/home/you/app/users.json) — 5/5 processed, 1 collision group(s)
Conflicting rows: 3, stored-canonical mismatches: 1, skipped rows: 0
canonical "sarah" -> 3 row(s)
  row 2: id="u2" raw="sarah" normalized="sarah"
  row 3: id="u3" raw="ｓａｒａｈ" normalized="sarah"
  row 1: id="u1" raw="Sarah" normalized="sarah"
```

Three rows would all be stored as `sarah`, and one row has a canonical value that isn't its name's canonical form: `Zoe` should be stored as `zoe`. The command exits with 1 when it finds either, so you can run it until it passes.

Each row is an object. The CLI takes the first of these fields it finds:

| What | Fields |
|---|---|
| the name | `identifier`, `raw`, `handle`, `slug`, `username`, `value` |
| an ID to print | `id`, `_id`, `uuid` |
| the table to print | `source`, `table`, `model` |
| the stored canonical form, to compare | `canonical`, `normalized`, `handleCanonical`, `slugCanonical`, `handle_canonical`, `slug_canonical` |

A row with no name is skipped. `--limit <n>` sets how many collision groups are printed (10 by default), and `--json` prints the full report. [Store a canonical column](claiming.md#store-a-canonical-column) covers the migration around it.

## `calibrate`

`calibrate <file>` suggests a warn threshold and a block threshold from names you've labelled as attacks or genuine. It scores every name, tries every pair of thresholds, and picks the pair that costs least under a cost model: a genuine name blocked costs more than one warned, and an attack let through costs more than one warned.

```json
[
  { "identifier": "paypa1", "label": "malicious", "target": "paypal" },
  { "identifier": "paypaI", "label": "malicious", "target": "paypal" },
  { "identifier": "раураl", "label": "malicious", "target": "paypal" },
  { "identifier": "p4ypal", "label": "malicious", "target": "paypal" },
  { "identifier": "rnicrosoft", "label": "malicious", "target": "microsoft" },
  { "identifier": "micros0ft", "label": "malicious", "target": "microsoft" },
  { "identifier": "githuh", "label": "malicious", "target": "github" },
  { "identifier": "paypal-fan", "label": "benign", "target": "paypal" },
  { "identifier": "paul", "label": "benign", "target": "paypal" },
  { "identifier": "gitlab", "label": "benign", "target": "github" },
  { "identifier": "microscope", "label": "benign", "target": "microsoft" },
  { "identifier": "sarah", "label": "benign", "target": "paypal" },
  { "identifier": "papal", "label": "benign", "target": "paypal" }
]
```

```bash
npx namespace-guard calibrate risk-dataset.json
```

```text
Calibration results (13 rows: 7 malicious, 6 benign)
Recommended warn threshold: 42 (precision 0.875, recall 1)
Recommended block threshold: 71 (precision 1, recall 0.714, f1 0.833)
Expected policy cost: 7 (avg 0.538 per weighted row)
```

On this data the five lookalikes score 100, the three close spellings, `p4ypal`, `githuh` and the genuine word `papal`, score 83, and the other genuine names score 0. `p4ypal` and `githuh` can't block, since nothing in them is a lookalike, and `papal` warns though it's genuine: those three are the cost of 7. Any warn threshold from 1 to 83 costs the same, as does any block threshold above it, so calibrate takes the middle of each range: it warns from 42, halfway between the genuine names and the close spellings, and blocks from 71, halfway between 42 and the lookalikes. A name that scores a little differently from your examples is then treated as they are. It suggests 100 only when a lower block threshold would cost more.

Each row needs:

- `identifier`: the name.
- `label`, `malicious` or `attack`: `true`, `1`, `"malicious"`, `"attack"`, `"spoof"` or `"positive"` for an attack; `false`, `0`, `"benign"`, `"safe"` or `"negative"` for a genuine name.
- `target` or `protect`, optionally: the protected names for this row, as a string, a comma-separated string or a list. Rows without one use `--protect`.
- `weight`, optionally: a positive number that counts the row more or less, 1 by default.

| Flag | Default | What it does |
|---|---|---|
| `--protect`, `--no-reserved`, `--leetspeak` | as for `risk` | how names are scored |
| `--target-recall <n>` | `0.9` | the share of attacks the warn threshold should reach, if any threshold can |
| `--cost-block-benign <n>` | `8` | the cost of blocking a genuine name |
| `--cost-warn-benign <n>` | `1` | the cost of warning on a genuine name |
| `--cost-allow-malicious <n>` | `12` | the cost of allowing an attack |
| `--cost-warn-malicious <n>` | `3` | the cost of only warning on an attack |
| `--malicious-prior <n>` | none | the share of attacks you expect in real sign-ups, from 0 to 1; reweights the rows to match |
| `--json` | off | print the metrics for both thresholds and the cost breakdown |

The thresholds fit the rows you give them. Use a few hundred real sign-ups as genuine rows and a varied set of attacks, and compare the result with the defaults (45 and 70) before you change them.

`attack-gen` can supply the attacks. Write its JSON to a file, then turn its variants into rows with `jq`:

```bash
npx namespace-guard attack-gen paypal --max-candidates 50 --json > attacks.json
jq '[.previews.topRisk[] | {identifier, label: "malicious", target: "paypal"}]' attacks.json > malicious.json
```

## `recommend`

`recommend <file>` runs `calibrate` on your file, then `drift` on your file and on the built-in corpus, and prints a `risk` config to paste into your guard and a drift budget for CI. It takes the same flags as `calibrate`, and `--limit` for the drift previews.

```bash
npx namespace-guard recommend risk-dataset.json
```

```text
Recommendation (/home/you/app/risk-dataset.json)
Risk thresholds: warn 42, block 71
Expected policy cost: 7 (avg 0.538 per weighted row)
Drift snapshot: 3 action flip(s), max |Δ| 100
Baseline drift (builtin corpus): 34 action flip(s), max |Δ| 100
Suggested namespace-guard risk config:
{
  "risk": {
    "warnThreshold": 42,
    "blockThreshold": 71
  }
}
Suggested CI drift gate command:
npm run ci:drift-gate -- --max-action-flips 34 --max-average-score-delta 100 --max-abs-score-delta 100
```

The config includes `protect` and `leetspeak` when you pass `--protect` and `--leetspeak`. The same caution applies as for `calibrate`. The drift gate command runs in the namespace-guard repository; [The drift gate](#the-drift-gate) shows how to run the same check in yours.

## `drift`

namespace-guard has two character maps. `CONFUSABLE_MAP_FULL` has every entry. `CONFUSABLE_MAP` leaves out Unicode's ASCII entries, such as `m` for `rn`, the characters NFKC turns into ASCII, and the less certain measured lookalikes; see [The character maps](data.md#the-character-maps). `drift` scores each name with both and counts the names whose action changes: its action flips. It scores names as typed, without NFKC, since NFKC would hide the difference.

Without a file, it uses the 34 [composability vectors](data.md#composability-vectors): the characters NFKC and Unicode's list read differently, each scored against the letter Unicode says it passes for.

```bash
npx namespace-guard drift --limit 3
```

```text
Drift results (builtin:composability-vectors) — 34 rows, 34 action flip(s)
Full stricter: 34, filtered stricter: 0, average score Δ: 100, max |Δ|: 100
"０": full 100/block vs filtered 0/allow (Δ 100) targets [o]
"𜳰": full 100/block vs filtered 0/allow (Δ 100) targets [o]
"𝟎": full 100/block vs filtered 0/allow (Δ 100) targets [o]
```

With a file of the same shape as `calibrate`'s (labels are ignored), it shows which of your names depend on the full map:

```bash
npx namespace-guard drift risk-dataset.json
```

```text
Drift results (/home/you/app/risk-dataset.json) — 13 rows, 3 action flip(s)
Full stricter: 3, filtered stricter: 0, average score Δ: 12.462, max |Δ|: 100
"rnicrosoft": full 100/block vs filtered 0/allow (Δ 100) targets [microsoft]
"micros0ft": full 100/block vs filtered 69/warn (Δ 31) targets [microsoft]
"paypa1": full 100/block vs filtered 69/warn (Δ 31) targets [paypal]
```

`rnicrosoft` blocks only with the full map, which lists `m` as `rn`. The guard scores with the full map unless you pass `map`, so these names block.

| Flag | Default | What it does |
|---|---|---|
| `--protect`, `--no-reserved`, the thresholds, `--max-matches` | as for `risk` | how names are scored; a row's own `target` or `protect` comes first |
| `--limit <n>` | `10` | how many changed names to print |
| `--json` | off | print the counts and the changed names as JSON |

`drift` always exits with 0; the drift gate below turns its numbers into a pass or a fail.

## JSON output

`risk`, `attack-gen`, `audit-canonical`, `calibrate`, `recommend` and `drift` print JSON with `--json`, and nothing else, so the output can go straight to a file or another tool. `check` has no JSON output; use its exit code.

| Command | Useful fields |
|---|---|
| `risk` | `score`, `action`, `canBlock`, `matches` |
| `attack-gen` | `bypassCount`, `outcomes`, `previews.bypass`, `previews.topRisk`, `previews.blocked` |
| `audit-canonical` | `collisions`, `conflictingRows`, `canonicalMismatches`, `collisionsPreview` |
| `calibrate` | `recommendations`, `metrics`, `expectedCost` |
| `recommend` | `recommendedConfig`, `ciGate.budgets`, `ciGate.command` |
| `drift` | `actionFlips`, `averageScoreDelta`, `maxAbsScoreDelta`, `changedPreview` |

## In CI

### Check that attacks are blocked

Run `attack-gen` on each name you protect, with the same settings as your guard, and fail when anything gets through. `jq -e` exits with 1 when the expression is false:

```bash
npx namespace-guard attack-gen paypal --leetspeak --json > attacks.json
jq -e '.bypassCount == 0' attacks.json
```

```text
true
```

This catches an upgrade, or a change to your pattern or thresholds, that lets a lookalike through. Leave out `--leetspeak` if your guard doesn't set it, and use `--mode impersonation` to test Unicode lookalikes only.

To check names you're about to publish, such as seeded organisation slugs, run `risk` on each with your `--protect` list: it exits with 1 when a name blocks.

### The drift gate

The drift gate fails a build when `drift`'s numbers on the built-in corpus go over a budget. In 0.23.0 all 34 vectors flip, so the budget is 34 action flips. A new version that changes the maps changes the count, and the gate makes you look at the change before you ship it.

namespace-guard's own repository runs it on every pull request, with a script that reads `drift --json` from the built CLI:

```bash
npm run build
npm run ci:drift-gate -- --max-action-flips 34 --max-average-score-delta 100 --max-abs-score-delta 100
```

```text
> namespace-guard@0.23.0 ci:drift-gate
> node scripts/drift-gate.js --max-action-flips 34 --max-average-score-delta 100 --max-abs-score-delta 100

Drift gate passed (builtin:composability-vectors).
actionFlips=34, |averageScoreDelta|=100, maxAbsScoreDelta=100
```

Over budget, it lists what failed and exits with 1:

```text
Drift gate failed (builtin:composability-vectors).
- actionFlips 34 > max-action-flips 30
```

| Flag | What it does |
|---|---|
| `--max-action-flips <n>` | the most action flips allowed |
| `--max-average-score-delta <n>` | the largest average score change allowed, either way |
| `--max-abs-score-delta <n>` | the largest single score change allowed |
| `--dataset <path>` | a file of your own instead of the built-in corpus |
| `--limit <n>` | passed to `drift --limit`, 1 by default |

At least one budget is required. `recommend` prints this command with budgets taken from the built-in corpus.

The script isn't part of the npm package, so in your own project, check the same numbers with the published CLI and `jq`:

```bash
npx namespace-guard drift --json > drift.json
jq -e '.actionFlips <= 34 and .maxAbsScoreDelta <= 100' drift.json
```

### A GitHub Actions workflow

This workflow is modelled on namespace-guard's own `.github/workflows/drift-gate.yml`. It runs both checks on every pull request and every push to `main`. `jq` is installed on GitHub's Ubuntu runners.

```yaml title=".github/workflows/names.yml"
name: Name checks

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  names:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lookalikes of protected names are blocked
        run: |
          for name in paypal github; do
            npx namespace-guard attack-gen "$name" --leetspeak --json > attacks.json
            jq -e '.bypassCount == 0' attacks.json
          done

      - name: Enforce drift budget
        run: |
          npx namespace-guard drift --json > drift.json
          jq -e '.actionFlips <= 34 and .maxAbsScoreDelta <= 100' drift.json
```

With namespace-guard in your dependencies, `npm ci` installs it and `npx` runs that version, so the checks test the version your app ships with.
