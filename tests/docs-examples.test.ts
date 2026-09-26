import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error plain ESM module without types
import { renderMarkdown, parseExpected, matchesExpected, formatValue } from "../scripts/docs-markdown.mjs";
import * as main from "../src/index";
import * as weights from "../src/confusable-weights";

// Every ```ts run example in guide/*.md runs here against the source, and each line ending in `// → value` must show
// that value: the docs site runs the same examples in the browser.
const lib: Record<string, unknown> = { ...main, ...weights };
const names = Object.keys(lib).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const guideDir = join(__dirname, "../guide");

for (const file of readdirSync(guideDir).filter((f) => f.endsWith(".md")).sort()) {
  const { examples } = renderMarkdown(readFileSync(join(guideDir, file), "utf8"));
  if (examples.length === 0) continue;
  describe(`guide/${file}`, () => {
    examples.forEach((ex: { source: string; body: string; checks: string[] }, n: number) => {
      const firstLine = ex.source.split("\n").find((l) => l.trim() && !l.startsWith("import")) ?? "";
      it(`example ${n + 1}: ${firstLine.slice(0, 60)}`, async () => {
        const shown: unknown[] = [];
        const fn = new AsyncFunction(...names, "__show", ex.body);
        await fn(...names.map((k) => lib[k]), (k: number, v: unknown) => { shown[k] = v; });
        ex.checks.forEach((expected, k) => {
          expect(k in shown, `line ${k + 1} with "// → ${expected}" never ran`).toBe(true);
          const parsed = parseExpected(expected);
          if (!parsed) return; // a description, not a value
          expect(matchesExpected(shown[k], parsed.value), `the page says ${expected}, the code gives ${formatValue(shown[k])}`).toBe(true);
        });
      });
    });
  });
}
