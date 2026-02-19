import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { run } from "../src/cli";
import { writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";

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
});
