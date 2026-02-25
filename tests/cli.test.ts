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
        "paypa1",
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
        "paypa1",
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
