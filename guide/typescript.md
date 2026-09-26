# TypeScript

namespace-guard is written in TypeScript and ships its own type declarations, for ES modules and CommonJS alike, so there is nothing extra to install. Every type on this page is exported from `namespace-guard`. Import them with `import type`:

```ts title="Importing types"
import type { CheckResult, NamespaceAdapter, NamespaceConfig } from "namespace-guard";
```

The functions are typed too, so most of the time you won't name a type at all: the result of `guard.check()` is already a `CheckResult`. Name one when you write something namespace-guard calls (an adapter, a validator) or pass a result on to code of your own.

## Configuration and adapters

| Type | What it is |
|---|---|
| `NamespaceConfig` | the config for `createNamespaceGuard()` and `createNamespaceGuardWithProfile()`: `sources`, `reserved`, `pattern`, `validators`, `suggest`, `cache`, `risk` and the rest. See [Configuration](configuration.md). |
| `NamespaceSource` | one table to check: `{ name, column, idColumn?, scopeKey? }` |
| `NamespaceAdapter` | what an adapter implements: `{ findOne(source, value, options?) }`, resolving to a row or `null`. See [Write your own adapter](adapters.md#write-your-own-adapter). |
| `FindOneOptions` | the options the guard passes to `findOne`: `{ caseInsensitive?: boolean }` |
| `OwnershipScope` | the scope you pass to `check()` and `claim()`, such as `{ id: user.id }`: `Record<string, string \| null \| undefined>` |
| `NamespaceProfileName` | `"consumer-handle" \| "org-slug" \| "developer-id"` |
| `NamespaceProfilePreset` | what a profile sets: `description`, `pattern`, `invalidMessage`, `normalizeUnicode`, `allowPurelyNumeric` and `risk`. `NAMESPACE_PROFILES` holds the three. |
| `SuggestStrategyName` | a built-in suggestion strategy: `"sequential"`, `"random-digits"`, `"suffix-words"`, `"short-random"`, `"scramble"` or `"similar"` |
| `NamespaceGuard` | the guard itself, as `createNamespaceGuard()` returns it. Use it to type a guard you pass around. |

## Results

`CheckResult` is a union. Test `available`, and TypeScript knows which fields exist:

```ts title="Narrowing a CheckResult"
import type { CheckResult } from "namespace-guard";

function describe(result: CheckResult): string {
  if (result.available) return "Free";
  switch (result.reason) {
    case "taken":
      return `${result.message} Try ${result.suggestions?.join(", ") ?? "another"}.`;
    case "reserved":
      return `${result.message} (${result.category})`;
    case "invalid":
      return result.message;
  }
}
```

The `switch` covers every `reason`, so TypeScript accepts the function without a final `return`. If a later version adds a reason, it tells you here.

| Type | What it is |
|---|---|
| `CheckResult` | `{ available: true }`, or `{ available: false, reason, message }` with `reason` one of `"invalid"`, `"reserved"` or `"taken"`, and optionally `source`, `category` and `suggestions` |
| `CheckManyOptions` | options for `checkMany()`: `{ skipSuggestions?: boolean }`, true by default |
| `ClaimResult<T>` | what `claim()` returns: `{ claimed: true, normalized, value: T }` with `T` the type your write returns, or `{ claimed: false, normalized, reason: "unavailable", message }` |
| `ClaimOptions` | options for `claim()`: the risk options below, plus `scope`, `isUniqueViolation` and `takenMessage` |
| `UniqueViolationDetector` | `(error: unknown) => boolean`, for `ClaimOptions.isUniqueViolation`. The default is `isLikelyUniqueViolationError`. |
| `AssertClaimableOptions` | options for `assertClaimable()`; the same as `EnforceRiskOptions` |

## Validators

A validator receives the normalised name, and the name as typed in a second argument, and resolves to `null` to allow it or `{ available: false, message }` to refuse it:

```ts title="A validator of your own"
import type { NamespaceValidator } from "namespace-guard";

const noDoubleHyphens: NamespaceValidator = async (value) =>
  value.includes("--") ? { available: false, message: "Use one hyphen at a time." } : null;
```

| Type | What it is |
|---|---|
| `NamespaceValidator` | `(value: string, context?: { identifier: string }) => Promise<NamespaceValidatorResult>` |
| `NamespaceValidatorResult` | `{ available: false; message: string } \| null` |
| `PredicateValidatorOptions` | options for `createPredicateValidator()`: `message` and `transform` |
| `ProfanityValidatorOptions` | options for `createProfanityValidator()` and `createEnglishProfanityValidator()` |
| `ProfanityValidationMode` | `"basic" \| "evasion"` |
| `ProfanityVariantProfile` | `"balanced" \| "aggressive"` |
| `InvisibleCharacterValidatorOptions` | options for `createInvisibleCharacterValidator()` |

`createHomoglyphValidator()` takes `{ message?, additionalMappings?, rejectMixedScript? }`, which has no exported name. If you need it, take it from the function:

```ts title="An unnamed options type"
type HomoglyphOptions = NonNullable<Parameters<typeof createHomoglyphValidator>[0]>;
```

## Risk

These describe how close a name comes to the names you protect. See [Protect names](protect-names.md).

| Type | What it is |
|---|---|
| `RiskCheckResult` | what `checkRisk()` returns: `score` (0 to 100), `level`, `action`, `canBlock`, `reasons` and `matches` |
| `RiskMatch` | one protected name it came close to: `target`, `score`, `distance`, `chainDepth`, `skeletonEqual`, `evidence` and `reasons` |
| `RiskMatchEvidence` | how it matched: `"exact"`, `"lookalike"`, `"lookalike-extension"` or `"typo"` |
| `RiskReason` | one reason for the score: `{ code, message, weight }` |
| `RiskReasonCode` | `"confusable-target"`, `"skeleton-collision"`, `"mixed-script"`, `"invisible-character"`, `"confusable-character"`, `"divergent-mapping"` or `"deep-chain"` |
| `RiskLevel` | `"low" \| "medium" \| "high"` |
| `RiskAction` | `"allow" \| "warn" \| "block"` |
| `CheckRiskOptions` | options for `checkRisk()`: `protect`, `includeReserved`, `leetspeak`, `map`, `maxMatches`, `warnThreshold`, `blockThreshold` |
| `EnforceRiskOptions` | `CheckRiskOptions` plus `failOn` (`"block"` or `"warn"`) and `messages` |
| `EnforceRiskResult` | what `enforceRisk()` returns: `{ allowed, action, message?, risk }` |

## Scanning text

For `canonicalise()`, `scan()` and `isClean()`. See [LLM text](llm-text.md).

| Type | What it is |
|---|---|
| `CanonicaliseOptions` | `threshold`, `includeNovel`, `scripts`, `strategy` (`"mixed"` or `"all"`) and `maxSizeRatio` |
| `ScanOptions` | `CanonicaliseOptions` plus `riskTerms` |
| `ScanResult` | what `scan()` returns: `hasConfusables`, `count`, `findings` and a `summary` with `riskLevel` (`"none"`, `"low"`, `"medium"` or `"high"`) |
| `ScanFinding` | one rewritten character: `char`, `codepoint`, `script`, `latinEquivalent`, `visualScore`, `source` (`"tr39"`, `"novel"` or `"fold"`), `index`, `word` and `mixedScript` |

## Comparing names and characters

For `skeleton()`, `areConfusable()`, `confusableDistance()`, `detectCrossScriptRisk()` and `isDomainSpoof()`. See [Comparing names](comparing-names.md) and [Domains](domains.md).

| Type | What it is |
|---|---|
| `SkeletonOptions` | `map`, `preserveCase` and `ignoreDiacritics` |
| `AreConfusableOptions` | `SkeletonOptions` plus `weights` and `context` (`"identifier"`, `"domain"` or `"all"`) |
| `ConfusableWeight` | one measured pair: `danger`, `stableDanger`, `cost`, and flags for the source character (`glyphReuse`, `xidContinue`, `idnaPvalid`, `tr39Allowed`) |
| `ConfusableWeights` | `Record<string, Record<string, ConfusableWeight>>`, keyed by source character, then target. `CONFUSABLE_WEIGHTS` has this type. |
| `ConfusableDistanceOptions` | `map`, `weights` and `context` |
| `ConfusableDistanceResult` | what `confusableDistance()` returns: `distance`, `maxDistance`, `similarity` (0 to 1), `skeletonEqual`, `normalizedEqual`, `chainDepth`, `crossScriptCount`, `ignorableCount`, `divergenceCount` and `steps` |
| `ConfusableDistanceStep` | one step of the path: `op`, `from`, `to`, the indexes and `cost`, and for a step worth flagging, a `reason` such as `"cross-script"` or `"visual-weight"` |
| `CrossScriptRiskResult` | what `detectCrossScriptRisk()` returns: `scripts`, `crossScriptPairs` and `riskLevel` |
| `DomainSpoofOptions` | `map`, `weights`, `minDanger` and `allowlist` |
| `DomainSpoofResult` | what `isDomainSpoof()` returns: `spoof`, and when a script matches, `script`, `danger` and `substitutions` |
| `DomainSpoofSubstitution` | one swapped character: `index`, `from`, `to` and `similarity` |

## Data

| Type | What it is |
|---|---|
| `MeasuredConfusable` | an entry of `MEASURED_CONFUSABLES`: `letter`, `target`, `tier` and `contexts` |
| `NfkcTr39DivergenceVector` | an entry of `NFKC_TR39_DIVERGENCE_VECTORS`: `{ char, codePoint, tr39, nfkc }` |
| `ComposabilityVector` | the same type under the composability suite's name; also exported from `namespace-guard/composability-vectors` |

The entries of `LLM_CONFUSABLE_MAP` have no exported type name. Take it from the map:

```ts title="The LLM map's entry type"
import { LLM_CONFUSABLE_MAP } from "namespace-guard";

type LlmEntry = (typeof LLM_CONFUSABLE_MAP)[string][number];
// { latin, visualScore, source: "tr39" | "novel", script, codepoint, widthRatio?, heightRatio? }
```

[Data and maps](data.md) describes each export.

## A typed example

An adapter over a `Map`, a validator, a guard, and a `claim()` whose result carries the type the write returns:

```ts title="Typed from end to end"
import {
  createNamespaceGuardWithProfile,
  createHomoglyphValidator,
  type ClaimResult,
  type NamespaceAdapter,
  type NamespaceConfig,
  type NamespaceValidator,
} from "namespace-guard";

type User = { id: string; handle: string; handleCanonical: string };
const users = new Map<string, User>(); // keyed by canonical handle

const adapter: NamespaceAdapter = {
  async findOne(source, value) {
    const user = users.get(value);
    return user ? { id: user.id } : null;
  },
};

const noDoubleHyphens: NamespaceValidator = async (value) =>
  value.includes("--") ? { available: false, message: "Use one hyphen at a time." } : null;

const config: NamespaceConfig = {
  reserved: { system: ["admin", "api"], brand: ["yourapp"] },
  sources: [{ name: "user", column: "handleCanonical", scopeKey: "id" }],
  validators: [noDoubleHyphens, createHomoglyphValidator({ rejectMixedScript: true })],
  risk: { protect: ["yourapp"] },
};

const guard = createNamespaceGuardWithProfile("consumer-handle", config, adapter);

async function register(handle: string): Promise<ClaimResult<User>> {
  return guard.claim(handle, async (canonical) => {
    const user: User = { id: crypto.randomUUID(), handle, handleCanonical: canonical };
    users.set(canonical, user);
    return user;
  });
}

const result = await register("Sarah");
if (result.claimed) {
  console.log(result.value.handle);  // result.value is a User
} else {
  console.log(result.message);       // a message to show
}
```

This compiles under `strict`. The subpath exports have their own declarations: `CONFUSABLE_WEIGHTS` from `namespace-guard/confusable-weights` is `ConfusableWeights`, and `FONT_SPECIFIC_WEIGHTS` from `namespace-guard/font-specific-weights` is `Record<string, ConfusableWeights>`, one entry per font.
