import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { run } from "../src/cli";
import { writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";

const calibrationPath = resolve(__dirname, "calibration-dataset.json");
const canonicalAuditPath = resolve(__dirname, "canonical-audit-dataset.json");

// Capture console.log/error output
let logs: string[];
let errors: string[];

beforeEach(() => {
  logs = [];
  errors = [];
  vi.spyOn(console, "log").mockImplementation((...args) => {
    logs.push(args.join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args.join(" "));
  });
});

afterEach(() => {
  try {
    unlinkSync(calibrationPath);
  } catch {}
  try {
    unlinkSync(canonicalAuditPath);
  } catch {}
  vi.restoreAllMocks();
});

// Helper to build argv like process.argv
function argv(...args: string[]): string[] {
  return ["node", "namespace-guard", ...args];
}

describe("CLI", () => {
  it("shows help with --help", async () => {
    const code = await run(argv("--help"));
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain("Usage:");
  });

  it("lists every command in the full help", async () => {
    for (const args of [["--help"], ["help"]]) {
      logs.length = 0;
      expect(await run(argv(...args))).toBe(0);
      const out = logs.join("\n");
      for (const command of ["check", "risk", "attack-gen", "audit-canonical", "calibrate", "recommend", "drift"]) {
        expect(out).toContain(`namespace-guard ${command} `);
      }
      expect(out).toContain("--database-url");
      expect(out).toContain("namespace-guard <command> --help");
    }
  });

  it("shows one command's usage and options with <command> --help or help <command>", async () => {
    for (const args of [["risk", "--help"], ["help", "risk"], ["-h", "risk"]]) {
      logs.length = 0;
      expect(await run(argv(...args))).toBe(0);
      const out = logs.join("\n");
      expect(out).toContain("namespace-guard risk <slug> [options]");
      expect(out).toContain("--fail-on <mode>       Fail on \"block\" (default) or \"warn\"");
      expect(out).toContain("--protect <slug>");
      expect(out).toContain("namespace-guard risk paypa1 --protect paypal --fail-on warn --json");
      // Nothing that belongs to another command
      expect(out).not.toContain("namespace-guard check");
      expect(out).not.toContain("--database-url");
      expect(out).not.toContain("--max-edits");
      expect(out).not.toContain("--cost-block-benign");
    }

    logs.length = 0;
    expect(await run(argv("recommend", "--help"))).toBe(0);
    const recommend = logs.join("\n");
    expect(recommend).toContain("--cost-block-benign <n>   Cost when benign input is blocked (default 8)");
    expect(recommend).toContain("--limit <n>");
    expect(recommend).not.toContain("For calibrate:");
    expect(recommend).not.toContain("--fail-on");

    logs.length = 0;
    expect(await run(argv("check", "--help"))).toBe(0);
    const check = logs.join("\n");
    expect(check).toContain("--database-url <url>");
    expect(check).not.toContain("--protect");
    expect(check).not.toContain("--json");
  });

  it("errors on help for an unknown command", async () => {
    expect(await run(argv("help", "nope"))).toBe(1);
    expect(errors.join("\n")).toContain("Unknown command: nope");
    errors.length = 0;
    expect(await run(argv("nope", "--help"))).toBe(1);
    expect(errors.join("\n")).toContain("Unknown command: nope");
  });

  it("shows help and exits 1 with no arguments", async () => {
    const code = await run(argv());
    expect(code).toBe(1);
    expect(logs.join("\n")).toContain("Usage:");
  });

  it("errors on unknown command", async () => {
    const code = await run(argv("unknown"));
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("Unknown command: unknown");
  });

  it("errors on missing slug", async () => {
    const code = await run(argv("check"));
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("Missing slug");
  });

  it("reports available slug (no config)", async () => {
    const code = await run(argv("check", "acme-corp"));
    expect(code).toBe(0);
    expect(logs[0]).toContain("acme-corp");
    expect(logs[0]).toContain("available");
  });

  it("reports invalid format", async () => {
    const code = await run(argv("check", "a"));
    expect(code).toBe(1);
    expect(logs[0]).toContain("a");
  });

  it("normalizes input", async () => {
    const code = await run(argv("check", "@ACME-Corp"));
    expect(code).toBe(0);
    expect(logs[0]).toContain("acme-corp");
  });

  it("scores low-risk identifiers with risk command", async () => {
    const code = await run(argv("risk", "acme-corp"));
    expect(code).toBe(0);
    expect(logs[0]).toContain("risk");
    expect(logs[0]).toContain("(allow)");
  });

  it("blocks high-risk confusable identifiers by default", async () => {
    const code = await run(argv("risk", "pa\u0443pal", "--protect", "paypal"));
    expect(code).toBe(1);
    expect(logs[0]).toContain("(block)");
    expect(logs.join("\n")).toContain("paypal");
  });

  it("does not fail warn-level identifiers by default", async () => {
    const code = await run(
      argv(
        "risk",
        "paypax",
        "--protect",
        "paypal",
        "--warn-threshold",
        "70",
        "--block-threshold",
        "95"
      )
    );
    expect(code).toBe(0);
    expect(logs[0]).toContain("(warn)");
  });

  it("fails warn-level identifiers with --fail-on warn", async () => {
    const code = await run(
      argv(
        "risk",
        "paypax",
        "--protect",
        "paypal",
        "--warn-threshold",
        "70",
        "--block-threshold",
        "95",
        "--fail-on",
        "warn"
      )
    );
    expect(code).toBe(1);
    expect(logs[0]).toContain("(warn)");
  });

  it("prints JSON output for risk command", async () => {
    const code = await run(
      argv("risk", "pa\u0443pal", "--protect", "paypal", "--json")
    );
    expect(code).toBe(1);
    const parsed = JSON.parse(logs[0]);
    expect(parsed.action).toBe("block");
    expect(parsed.matches[0].target).toBe("paypal");
  });

  it("generates confusable attack candidates", async () => {
    const code = await run(argv("attack-gen", "paypal"));
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain("Attack generation results");
    expect(logs.join("\n")).toContain("Top risk candidates");
  });

  it("prints JSON output for attack-gen command", async () => {
    const code = await run(
      argv("attack-gen", "paypal", "--json", "--max-candidates", "10")
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(logs[0]);
    expect(parsed.normalizedTarget).toBe("paypal");
    expect(parsed.mode).toBe("evasion");
    expect(parsed.map).toBe("CONFUSABLE_MAP_FULL");
    expect(parsed.generated.total).toBeGreaterThan(0);
    expect(typeof parsed.outcomes.allow).toBe("number");
    expect(typeof parsed.bypassCount).toBe("number");
    expect(Array.isArray(parsed.previews.topRisk)).toBe(true);
  });

  it("supports attack-gen impersonation mode", async () => {
    const code = await run(
      argv("attack-gen", "acme", "--json", "--mode", "impersonation")
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(logs[0]);
    expect(parsed.mode).toBe("impersonation");
    expect(parsed.generated.asciiLookalike).toBe(0);
  });

  it("supports attack-gen evasion mode with ascii lookalikes", async () => {
    const code = await run(
      argv("attack-gen", "acme", "--json", "--mode", "evasion")
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(logs[0]);
    expect(parsed.mode).toBe("evasion");
    expect(parsed.generated.asciiLookalike).toBeGreaterThan(0);
  });

  it("validates risk-only option values", async () => {
    const code = await run(argv("risk", "acme", "--warn-threshold", "NaN"));
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("Invalid --warn-threshold");
  });

  it("rejects --database-url for risk command", async () => {
    const code = await run(
      argv("risk", "acme", "--database-url", "postgres://localhost/db")
    );
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("--database-url is only supported");
  });

  it("rejects --database-url for attack-gen command", async () => {
    const code = await run(
      argv("attack-gen", "paypal", "--database-url", "postgres://localhost/db")
    );
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("--database-url is only supported");
  });

  it("validates attack-gen option values", async () => {
    const code = await run(
      argv("attack-gen", "paypal", "--max-edits", "3", "--map", "weird")
    );
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("Invalid --map value");
  });

  it("validates attack-gen mode values", async () => {
    const code = await run(argv("attack-gen", "paypal", "--mode", "unknown"));
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("Invalid --mode value");
  });

  it("rejects --database-url for drift command", async () => {
    const code = await run(
      argv("drift", "--database-url", "postgres://localhost/db")
    );
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("--database-url is only supported");
  });

  it("rejects --database-url for recommend command", async () => {
    const code = await run(
      argv("recommend", "dataset.json", "--database-url", "postgres://localhost/db")
    );
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("--database-url is only supported");
  });

  it("rejects --database-url for audit-canonical command", async () => {
    const code = await run(
      argv("audit-canonical", "dataset.json", "--database-url", "postgres://localhost/db")
    );
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("--database-url is only supported");
  });

  it("scores leetspeak as lookalikes with --leetspeak", async () => {
    expect(await run(argv("risk", "adm1n", "--protect", "admin"))).toBe(0);
    expect(logs[0]).toContain("(warn)");
    logs.length = 0;
    expect(await run(argv("risk", "adm1n", "--protect", "admin", "--leetspeak"))).toBe(1);
    expect(logs[0]).toContain("(block)");
  });

  it("scores the name as typed, so a capital I reads as l", async () => {
    expect(await run(argv("risk", "paypaI", "--protect", "paypal"))).toBe(1);
    expect(logs[0]).toContain("(block)");
  });

  it("reports attack-gen bypasses as the leetspeak option decides", async () => {
    const args = ["attack-gen", "admin", "--json", "--mode", "evasion", "--max-candidates", "400"];
    expect(await run(argv(...args))).toBe(0);
    const off = JSON.parse(logs[0]);
    expect(off.settings.leetspeak).toBe(false);
    expect(off.bypassCount).toBeGreaterThan(0);
    expect(off.previews.bypass.map((row: { identifier: string }) => row.identifier)).toContain("4dmin");
    logs.length = 0;
    expect(await run(argv(...args, "--leetspeak"))).toBe(0);
    const on = JSON.parse(logs[0]);
    expect(on.settings.leetspeak).toBe(true);
    expect(on.bypassCount).toBe(0);
  });

  it("never counts a close spelling as a block when calibrating", async () => {
    // paypax is one letter from paypal, not a lookalike: no block threshold blocks it, so the cheapest policy warns
    writeFileSync(
      calibrationPath,
      JSON.stringify([{ identifier: "paypax", label: "malicious", target: "paypal" }])
    );
    expect(await run(argv("calibrate", calibrationPath, "--json"))).toBe(0);
    const parsed = JSON.parse(logs[0]);
    expect(parsed.expectedCost.weightedFalseNegativeWarns).toBe(1);
    expect(parsed.expectedCost.totalCost).toBe(3);
    expect(parsed.metrics.block.tp).toBe(0);
  });

  it("calibrates to the actions checkRisk takes at the recommended thresholds", async () => {
    const rows = [
      { identifier: "paypal", label: "malicious", target: "paypal" },
      { identifier: "раураl", label: "malicious", target: "paypal" },
      { identifier: "paypax", label: "malicious", target: "paypal" },
      { identifier: "githuh", label: "malicious", target: "github" },
      { identifier: "microsoſt", label: "malicious", target: "microsoft" },
      { identifier: "teamspace", label: "benign", target: "paypal" },
      { identifier: "gitlab", label: "benign", target: "github" },
      { identifier: "papal", label: "benign", target: "paypal" },
    ];
    writeFileSync(calibrationPath, JSON.stringify(rows));
    expect(await run(argv("calibrate", calibrationPath, "--json"))).toBe(0);
    const parsed = JSON.parse(logs[0]);
    const { warnThreshold, blockThreshold } = parsed.recommendations;
    expect(warnThreshold).toBeLessThan(blockThreshold);

    const { createNamespaceGuard } = await import("../src/index");
    const guard = createNamespaceGuard({ sources: [] }, { findOne: async () => null });
    const cost = { block: { benign: 8, malicious: 0 }, warn: { benign: 1, malicious: 3 }, allow: { benign: 0, malicious: 12 } };
    let total = 0;
    for (const row of rows) {
      const { action } = guard.checkRisk(row.identifier, { protect: [row.target], warnThreshold, blockThreshold });
      total += cost[action][row.label === "malicious" ? "malicious" : "benign"];
    }
    expect(parsed.expectedCost.totalCost).toBe(total);
  });

  it("takes the middle of a range of thresholds that cost the same, not the top", async () => {
    // The guide's dataset: genuine names score 0 (papal 83), close spellings 83 and can't block, lookalikes 100. Any warn
    // threshold from 1 to 83 costs 7, with any block threshold above it; 0.23.0 before this fix said warn 83, block 100
    const rows = [
      { identifier: "paypa1", label: "malicious", target: "paypal" },
      { identifier: "paypaI", label: "malicious", target: "paypal" },
      { identifier: "раураl", label: "malicious", target: "paypal" },
      { identifier: "p4ypal", label: "malicious", target: "paypal" },
      { identifier: "rnicrosoft", label: "malicious", target: "microsoft" },
      { identifier: "micros0ft", label: "malicious", target: "microsoft" },
      { identifier: "githuh", label: "malicious", target: "github" },
      { identifier: "paypal-fan", label: "benign", target: "paypal" },
      { identifier: "paul", label: "benign", target: "paypal" },
      { identifier: "gitlab", label: "benign", target: "github" },
      { identifier: "microscope", label: "benign", target: "microsoft" },
      { identifier: "sarah", label: "benign", target: "paypal" },
      { identifier: "papal", label: "benign", target: "paypal" },
    ];
    writeFileSync(calibrationPath, JSON.stringify(rows));
    expect(await run(argv("calibrate", calibrationPath, "--json"))).toBe(0);
    const parsed = JSON.parse(logs[0]);
    // warn: the middle of 1..83; block: the middle of 43..100
    expect(parsed.recommendations).toEqual({ warnThreshold: 42, blockThreshold: 71 });
    expect(parsed.expectedCost.totalCost).toBe(7);

    logs.length = 0;
    expect(await run(argv("recommend", calibrationPath, "--json"))).toBe(0);
    const recommended = JSON.parse(logs[0]);
    expect(recommended.recommendedConfig.risk).toEqual({ warnThreshold: 42, blockThreshold: 71 });
  });

  it("puts the block threshold between a genuine name that can block and the attacks", async () => {
    // With --leetspeak, p4ypal can block, at 94: labelled genuine, it is warned (githuh at 83 needs warning), and any
    // block threshold from 95 to 100 costs the same
    writeFileSync(
      calibrationPath,
      JSON.stringify([
        { identifier: "paypa1", label: "malicious", target: "paypal" },
        { identifier: "раураl", label: "malicious", target: "paypal" },
        { identifier: "githuh", label: "malicious", target: "github" },
        { identifier: "p4ypal", label: "benign", target: "paypal" },
        { identifier: "sarah", label: "benign", target: "paypal" },
      ])
    );
    expect(await run(argv("calibrate", calibrationPath, "--leetspeak", "--json"))).toBe(0);
    const parsed = JSON.parse(logs[0]);
    expect(parsed.recommendations).toEqual({ warnThreshold: 42, blockThreshold: 97 });
    expect(parsed.expectedCost.weightedFalsePositiveBlocks).toBe(0);
    expect(parsed.metrics.block.recall).toBe(0.667);
  });

  it("recommends blocking at 100 only when nothing lower costs as little", async () => {
    // 4dm1n scores 99 and can block with --leetspeak: labelled genuine, only 100 keeps it from blocking
    writeFileSync(
      calibrationPath,
      JSON.stringify([
        { identifier: "paypa1", label: "malicious", target: "paypal" },
        { identifier: "раураl", label: "malicious", target: "paypal" },
        { identifier: "4dm1n", label: "benign", target: "admin" },
      ])
    );
    expect(await run(argv("calibrate", calibrationPath, "--leetspeak", "--json"))).toBe(0);
    const parsed = JSON.parse(logs[0]);
    expect(parsed.recommendations.blockThreshold).toBe(100);
    expect(parsed.expectedCost.weightedFalsePositiveBlocks).toBe(0);
  });

  it("calibrates thresholds from labeled dataset", async () => {
    writeFileSync(
      calibrationPath,
      JSON.stringify([
        { identifier: "paypal", label: "malicious", target: "paypal" },
        { identifier: "pa\u0443pal", label: "malicious", target: "paypal" },
        { identifier: "paypa1", label: "malicious", target: "paypal" },
        { identifier: "teamspace", label: "benign", target: "paypal" },
        { identifier: "builders-hub", label: "benign", target: "paypal" },
      ])
    );

    const code = await run(argv("calibrate", calibrationPath));
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain("Recommended warn threshold");
    expect(logs.join("\n")).toContain("Recommended block threshold");
  });

  it("prints calibration output as JSON", async () => {
    writeFileSync(
      calibrationPath,
      JSON.stringify([
        { identifier: "paypal", label: "malicious", target: "paypal" },
        { identifier: "teamspace", label: "benign", target: "paypal" },
      ])
    );

    const code = await run(argv("calibrate", calibrationPath, "--json"));
    expect(code).toBe(0);
    const parsed = JSON.parse(logs[0]);
    expect(typeof parsed.recommendations.warnThreshold).toBe("number");
    expect(typeof parsed.recommendations.blockThreshold).toBe("number");
    expect(parsed.recommendations.blockThreshold).toBeGreaterThanOrEqual(
      parsed.recommendations.warnThreshold
    );
    expect(typeof parsed.expectedCost.totalCost).toBe("number");
  });

  it("supports cost-aware calibration with class-prior reweighting", async () => {
    writeFileSync(
      calibrationPath,
      JSON.stringify([
        { identifier: "paypal", label: "malicious", target: "paypal", weight: 2 },
        { identifier: "pa\u0443pal", label: "malicious", target: "paypal" },
        { identifier: "teamspace", label: "benign", target: "paypal", weight: 3 },
        { identifier: "builders-hub", label: "benign", target: "paypal" },
      ])
    );

    const code = await run(
      argv(
        "calibrate",
        calibrationPath,
        "--cost-block-benign",
        "9",
        "--cost-warn-benign",
        "1",
        "--cost-allow-malicious",
        "15",
        "--cost-warn-malicious",
        "4",
        "--malicious-prior",
        "0.4",
        "--json"
      )
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(logs[0]);
    expect(parsed.costModel.blockBenign).toBe(9);
    expect(parsed.costModel.allowMalicious).toBe(15);
    expect(parsed.priorAdjustment.maliciousPrior).toBe(0.4);
    expect(typeof parsed.expectedCost.averageCost).toBe("number");
  });

  it("recommends risk config and ci gate from one dataset", async () => {
    writeFileSync(
      calibrationPath,
      JSON.stringify([
        { identifier: "paypal", label: "malicious", target: "paypal" },
        { identifier: "pa\u0443pal", label: "malicious", target: "paypal" },
        { identifier: "teamspace", label: "benign", target: "paypal" },
      ])
    );

    const code = await run(argv("recommend", calibrationPath));
    expect(code).toBe(0);
    const out = logs.join("\n");
    expect(out).toContain("Recommendation");
    expect(out).toContain("Baseline drift");
    expect(out).toContain("Suggested namespace-guard risk config");
    expect(out).toContain("ci:drift-gate");
  });

  it("prints recommend output as JSON", async () => {
    writeFileSync(
      calibrationPath,
      JSON.stringify([
        { identifier: "paypal", label: "malicious", target: "paypal" },
        { identifier: "teamspace", label: "benign", target: "paypal" },
      ])
    );

    const code = await run(argv("recommend", calibrationPath, "--json"));
    expect(code).toBe(0);
    const parsed = JSON.parse(logs[0]);
    expect(typeof parsed.recommendedConfig.risk.warnThreshold).toBe("number");
    expect(typeof parsed.recommendedConfig.risk.blockThreshold).toBe("number");
    expect(typeof parsed.calibrate.expectedCost.totalCost).toBe("number");
    expect(typeof parsed.drift.actionFlips).toBe("number");
    expect(parsed.driftBaseline.dataset).toContain("builtin:composability-vectors");
    expect(parsed.ciGate.budgets.maxActionFlips).toBeGreaterThan(0);
    expect(parsed.ciGate.command).toContain("ci:drift-gate");
  });

  it("validates calibration dataset row labels", async () => {
    writeFileSync(
      calibrationPath,
      JSON.stringify([{ identifier: "paypal", label: "maybe" }])
    );

    const code = await run(argv("calibrate", calibrationPath));
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("missing a valid label");
  });

  it("validates cost-aware calibration option values", async () => {
    const code = await run(
      argv("calibrate", "missing.json", "--cost-block-benign", "-1")
    );
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("Invalid --cost-block-benign");
  });

  it("runs built-in drift corpus and reports summary", async () => {
    const code = await run(argv("drift"));
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain("Drift results");
    expect(logs.join("\n")).toContain("action flip");
  });

  it("prints drift output as JSON", async () => {
    const code = await run(argv("drift", "--json"));
    expect(code).toBe(0);
    const parsed = JSON.parse(logs[0]);
    expect(parsed.dataset).toContain("builtin:composability-vectors");
    expect(parsed.total).toBeGreaterThan(0);
    expect(typeof parsed.actionFlips).toBe("number");
  });

  it("lists each built-in row's target once", async () => {
    // Each vector names its letter as both target and protect; 0.23.0 before this fix printed "targets [o,o]"
    expect(await run(argv("drift", "--limit", "3"))).toBe(0);
    const rows = logs.filter((line) => line.includes("targets ["));
    expect(rows).toHaveLength(3);
    for (const line of rows) expect(line).toMatch(/targets \[[^,\]]+\]$/);
    expect(rows[0]).toContain("targets [o]");

    logs.length = 0;
    expect(await run(argv("drift", "--json"))).toBe(0);
    const parsed = JSON.parse(logs[0]);
    for (const row of parsed.changedPreview) expect(row.protect).toHaveLength(1);
  });

  it("lists a custom row's target once when it is also in protect", async () => {
    writeFileSync(calibrationPath, JSON.stringify([{ identifier: "rnicrosoft", target: "microsoft", protect: ["microsoft", "github"] }]));
    expect(await run(argv("drift", calibrationPath, "--json"))).toBe(0);
    expect(JSON.parse(logs[0]).changedPreview[0].protect).toEqual(["microsoft", "github"]);
  });

  it("supports drift on a custom dataset", async () => {
    writeFileSync(
      calibrationPath,
      JSON.stringify([{ identifier: "\u017f", target: "f" }])
    );

    const code = await run(argv("drift", calibrationPath, "--json"));
    expect(code).toBe(0);
    const parsed = JSON.parse(logs[0]);
    expect(parsed.total).toBe(1);
    expect(parsed.changedCount).toBeGreaterThanOrEqual(1);
    expect(parsed.changedPreview[0].identifier).toBe("\u017f");
  });

  it("audits canonical collisions from dataset", async () => {
    writeFileSync(
      canonicalAuditPath,
      JSON.stringify([
        { id: "u1", handle: "BigBird", handleCanonical: "bigbird" },
        { id: "u2", handle: "ᴮᴵᴳᴮᴵᴿᴰ", handleCanonical: "bigbird" },
        { id: "u3", handle: "Alice", handleCanonical: "alice" },
      ])
    );

    const code = await run(argv("audit-canonical", canonicalAuditPath));
    expect(code).toBe(1);
    const out = logs.join("\n");
    expect(out).toContain("Canonical audit");
    expect(out).toContain('canonical "bigbird"');
  });

  it("prints canonical audit output as JSON", async () => {
    writeFileSync(
      canonicalAuditPath,
      JSON.stringify([
        { id: "u1", identifier: "Acme", canonical: "acme" },
        { id: "u2", identifier: "ACME", canonical: "acme" },
        { id: "u3", identifier: "Bravo", canonical: "bravo" },
      ])
    );

    const code = await run(argv("audit-canonical", canonicalAuditPath, "--json"));
    expect(code).toBe(1);
    const parsed = JSON.parse(logs[0]);
    expect(parsed.collisions).toBe(1);
    expect(parsed.conflictingRows).toBe(2);
    expect(parsed.collisionsPreview[0].canonical).toBe("acme");
  });
});

describe("CLI with config file", () => {
  const configPath = resolve(__dirname, "test-config.json");

  afterEach(() => {
    try {
      unlinkSync(configPath);
    } catch {}
  });

  it("blocks reserved names from config", async () => {
    writeFileSync(
      configPath,
      JSON.stringify({ reserved: ["admin", "api"] })
    );

    const code = await run(argv("check", "admin", "--config", configPath));
    expect(code).toBe(1);
    expect(logs[0]).toContain("admin");
    expect(logs[0]).toContain("reserved");
  });

  it("blocks reserved names with categories", async () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        reserved: { system: ["admin"], brand: ["oncor"] },
      })
    );

    const code = await run(argv("check", "oncor", "--config", configPath));
    expect(code).toBe(1);
    expect(logs[0]).toContain("oncor");
    expect(logs[0]).toContain("reserved");
  });

  it("uses custom pattern from config", async () => {
    writeFileSync(
      configPath,
      JSON.stringify({ pattern: "^[a-z]{3,10}$" })
    );

    // "ab" is too short for 3-10
    const code = await run(argv("check", "ab", "--config", configPath));
    expect(code).toBe(1);

    // "abc" passes
    const code2 = await run(argv("check", "abc", "--config", configPath));
    expect(code2).toBe(0);
  });

  it("errors on missing config file when explicitly specified", async () => {
    // Mock process.exit to prevent test runner from dying
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    await expect(
      run(argv("check", "test", "--config", "/nonexistent/config.json"))
    ).rejects.toThrow("process.exit called");

    expect(errors.join("\n")).toContain("Config file not found");
    mockExit.mockRestore();
  });

  it("handles invalid regex pattern gracefully", async () => {
    writeFileSync(
      configPath,
      JSON.stringify({ pattern: "(?P<invalid>)" })
    );

    const code = await run(argv("check", "test", "--config", configPath));
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("Invalid regex pattern");
  });

  it("includes reserved names as protected targets for risk checks", async () => {
    writeFileSync(configPath, JSON.stringify({ reserved: ["admin"] }));

    const code = await run(argv("risk", "admin", "--config", configPath));
    expect(code).toBe(1);
    expect(logs[0]).toContain("(block)");
  });

  it("can exclude reserved-name targets for risk checks", async () => {
    writeFileSync(configPath, JSON.stringify({ reserved: ["admin"] }));

    const code = await run(
      argv("risk", "adm\u0456n", "--config", configPath, "--no-reserved")
    );
    expect(code).toBe(0);
    expect(logs[0]).toContain("(allow)");
  });
});
