// docs-markdown.mjs: the small Markdown dialect the namespace-guard docs are written in, rendered to HTML, and the
// transform that makes an example runnable. Used by scripts/build-docs.mjs and tests/docs-examples.test.ts.
//
// Blocks: # to #### headings, paragraphs, - and 1. lists (nested by two spaces), ``` fences (```ts run makes a
// runnable example), | tables |, > callouts (> **Note** ...), --- rules, and lines starting with < passed through.
// Inline: `code`, **bold**, *italic*, [links](page.md#anchor), <kbd>, and a bare → arrow.

export function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Typographic quotes and apostrophes: isn't becomes isn’t, "taken" becomes “taken”. Run on prose, never on code. */
export function smartQuotes(s) {
  return s
    .replace(/(^|[\s([{\u2014\u2013/-])'/gu, "$1\u2018")
    .replace(/'/g, "\u2019")
    .replace(/(^|[\s([{\u2014\u2013/-])"/gu, "$1\u201C")
    .replace(/"/g, "\u201D");
}

export function slugify(text) {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/`/g, "")
    .toLowerCase()
    .replace(/&[a-z]+;/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

// ---- Lookalikes: every letter outside ASCII is marked, since the docs are about differences you can't see ----

const SCRIPTS = [["Latin", /\p{Script=Latin}/u], ["Cyrillic", /\p{Script=Cyrillic}/u], ["Greek", /\p{Script=Greek}/u],
  ["Armenian", /\p{Script=Armenian}/u], ["Hebrew", /\p{Script=Hebrew}/u], ["Arabic", /\p{Script=Arabic}/u],
  ["Cherokee", /\p{Script=Cherokee}/u], ["Hangul", /\p{Script=Hangul}/u], ["Han", /\p{Script=Han}/u],
  ["Deseret", /\p{Script=Deseret}/u], ["Ol Chiki", /\p{Script=Ol_Chiki}/u]];

/** Wraps each non-ASCII letter of already-escaped HTML text in a span naming its code point and script */
export function markLookalikes(html) {
  // One underline for each run of them, so its dots are evenly spaced; each letter still names itself on hover
  return html.replace(/(?:[\p{L}\p{M}](?<![\x00-\x7f]))+/gu, (run) => {
    const letters = Array.from(run, (ch) => {
      const cp = `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
      const script = SCRIPTS.find(([, re]) => re.test(ch))?.[0];
      return `<span title="${cp}${script ? ` ${script}` : ""}">${ch}</span>`;
    });
    return `<span class="lk">${letters.join("")}</span>`;
  });
}

// ---- Syntax highlighting: enough for TypeScript, shell, JSON, Prisma and SQL snippets ----

const KEYWORDS = new Set(("import from export const let var await async function return new if else for of in while " +
  "type interface extends implements class throw try catch finally default as typeof keyof readonly true false null " +
  "undefined void satisfies switch case break continue").split(" "));
const SQL_KEYWORDS = new Set(("select from where insert into values update set delete create table index unique on " +
  "alter add column not null primary key references constraint lower and or as").split(" "));

export function highlight(code, lang) {
  const out = [];
  const push = (cls, text) => {
    const html = markLookalikes(escapeHtml(text));
    out.push(cls ? `<span class="${cls}">${html}</span>` : html);
  };
  const l = (lang || "").toLowerCase();
  if (l === "text" || l === "") return markLookalikes(escapeHtml(code));
  const shell = l === "bash" || l === "sh" || l === "shell";
  const sql = l === "sql";
  const re = shell
    ? /(#[^\n]*)|("(?:\\.|[^"\\])*"|'[^']*')|(--?[A-Za-z][\w-]*)|(\$ |^\s*(?:npx|npm|node|pnpm|yarn)\b)|([^\s"'#-]+|\s+|.)/gm
    : sql
      ? /(--[^\n]*)|('(?:''|[^'])*')|(\b\d+\b)|([A-Za-z_]\w*)|(\s+|.)/g
      : /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\b\d[\d_.]*\b)|([A-Za-z_$][\w$]*)(\s*\()?|(\s+|.)/g;
  let m;
  while ((m = re.exec(code))) {
    if (shell) {
      if (m[1]) push("cm", m[1]);
      else if (m[2]) push("str", m[2]);
      else if (m[3]) push("var", m[3]);
      else if (m[4]) push("kw", m[4]);
      else push(null, m[0]);
    } else if (sql) {
      if (m[1]) push("cm", m[1]);
      else if (m[2]) push("str", m[2]);
      else if (m[3]) push("num", m[3]);
      else if (m[4]) push(SQL_KEYWORDS.has(m[4].toLowerCase()) ? "kw" : null, m[4]);
      else push(null, m[0]);
    } else {
      if (m[1]) push("cm", m[1]);
      else if (m[2]) push("str", m[2]);
      else if (m[3]) push("num", m[3]);
      else if (m[4]) {
        const word = m[4];
        if (KEYWORDS.has(word)) push("kw", word);
        else if (m[5]) push("fn", word);
        else if (/^[A-Z][A-Z0-9_]+$/.test(word)) push("const", word);
        else if (/^[A-Z]/.test(word)) push("type", word);
        else push(null, word);
        if (m[5]) push(null, m[5]);
      } else push(/[{}()[\]]/.test(m[0]) ? "br" : null, m[0]);
    }
  }
  return out.join("");
}

// ---- Runnable examples ----

/**
 * Turns an example into the body of an async function. Imports from namespace-guard are dropped (its exports are in
 * scope), and each line ending in `// → expected` reports its value: `expr; // → x` shows expr, and
 * `const name = expr; // → x` shows name. Returns the body and, per shown line, the expected text.
 */
export function transformExample(source) {
  const checks = [];
  const labels = [];
  const out = [];
  for (const line of source.split("\n")) {
    if (/^\s*import\s[\s\S]*from\s+["']namespace-guard[^"']*["'];?\s*$/.test(line)) continue;
    const m = line.match(/^(.*?)\s*\/\/\s*→\s*(.*)$/);
    if (!m || !m[1].trim()) { out.push(line); continue; }
    const code = m[1].replace(/;\s*$/, "");
    const k = checks.length;
    checks.push(m[2].trim());
    labels.push(code.trim().replace(/^await\s+/, "").replace(/^(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=.*$/, "$2"));
    const decl = code.match(/^(\s*)(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+)$/);
    if (decl) out.push(`${decl[1]}${decl[2]} ${decl[3]} = ${decl[4]}; __show(${k}, ${decl[3]});`);
    else {
      const indent = code.match(/^\s*/)[0];
      out.push(`${indent}__show(${k}, (${code.trim()}));`);
    }
  }
  return { body: out.join("\n"), checks, labels };
}

/** The expected value of a `// →` comment, if it's a JavaScript literal; otherwise undefined (a description only) */
export function parseExpected(text) {
  const t = text.replace(/\s+\(.*\)\s*$/, "").trim(); // a trailing "(explanation)" isn't part of the value
  try {
    return { value: Function(`"use strict"; return (${t});`)() };
  } catch {
    return undefined;
  }
}

/** Whether a value matches what an example expects: equal, or for an object, equal on every key it names */
export function matchesExpected(actual, expected) {
  if (expected === actual) return true;
  if (expected && typeof expected === "object" && actual && typeof actual === "object") {
    if (Array.isArray(expected)) {
      return Array.isArray(actual) && expected.length === actual.length && expected.every((v, i) => matchesExpected(actual[i], v));
    }
    return Object.keys(expected).every((k) => matchesExpected(actual[k], expected[k]));
  }
  return typeof expected === "number" && typeof actual === "number" && Math.abs(expected - actual) < 1e-9;
}

/** A value as the docs show it: strings quoted, objects on one line where they fit */
export function formatValue(v, depth = 0) {
  if (typeof v === "string") return JSON.stringify(v);
  if (v === undefined) return "undefined";
  if (v === null || typeof v !== "object") return String(v);
  if (v instanceof Set) return `Set(${v.size})`;
  if (v instanceof Map) return `Map(${v.size})`;
  if (depth > 2) return Array.isArray(v) ? "[…]" : "{…}";
  if (Array.isArray(v)) {
    const items = v.slice(0, 8).map((x) => formatValue(x, depth + 1));
    return `[${items.join(", ")}${v.length > 8 ? `, … ${v.length - 8} more` : ""}]`;
  }
  const entries = Object.entries(v).filter(([, x]) => x !== undefined);
  const shown = entries.slice(0, 10).map(([k, x]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${formatValue(x, depth + 1)}`);
  return `{ ${shown.join(", ")}${entries.length > 10 ? ", …" : ""} }`;
}

// ---- Markdown ----

/**
 * Renders a page. `link(href)` rewrites page links (getting-started.md#x). Returns the HTML, the headings (for the
 * contents list and search), and the runnable examples.
 */
export function renderMarkdown(src, { link = (h) => h } = {}) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const headings = [];
  const examples = [];
  const ids = new Set();
  const uniqueId = (base) => {
    let id = base || "section", n = 2;
    while (ids.has(id)) id = `${base}-${n++}`;
    ids.add(id);
    return id;
  };

  const inline = (text) => {
    const codes = [];
    const hrefs = [];
    let s = text.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
    // Quotes are curled in the words only: code and link addresses are set aside first
    s = s.replace(/\]\(([^)\s]+)\)/g, (_, h) => `](\u0001${hrefs.push(h) - 1}\u0001)`);
    s = smartQuotes(s).replace(/\u0001(\d+)\u0001/g, (_, i) => hrefs[+i]);
    s = escapeHtml(s)
      .replace(/&lt;kbd&gt;(.+?)&lt;\/kbd&gt;/g, "<kbd>$1</kbd>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, h) => {
        const href = link(h.replace(/&amp;/g, "&"));
        const external = /^https?:/.test(href);
        return `<a href="${escapeHtml(href)}"${external ? ' rel="noopener"' : ""}>${t}</a>`;
      })
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${markLookalikes(escapeHtml(codes[+i]))}</code>`);
  };

  function blocks(start, end, depth) {
    const html = [];
    let i = start;
    while (i < end) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      const fence = line.match(/^(\s*)```(\w*)\s*(.*)$/);
      if (fence) {
        const [, indent, lang, meta] = fence;
        const body = [];
        i++;
        while (i < end && !lines[i].match(/^\s*```\s*$/)) body.push(lines[i++].slice(indent.length));
        i++;
        const code = body.join("\n");
        const run = /\brun\b/.test(meta);
        const title = (meta.match(/title="([^"]+)"/) ?? [])[1];
        const label = title ?? ({ ts: "TypeScript", typescript: "TypeScript", js: "JavaScript", bash: "Terminal", sh: "Terminal", json: "JSON", sql: "SQL", prisma: "Prisma schema", text: "" }[lang] ?? lang);
        let attrs = "";
        if (run) {
          const ex = transformExample(code);
          examples.push({ source: code, ...ex });
          attrs = ` data-example="${examples.length - 1}"`;
        }
        const shown = code.replace(/\s*\/\/\s*→\s*(.*)$/gm, (_, v) => `  // → ${v}`);
        html.push(`<figure class="code${run ? " runnable" : ""}"${attrs}><figcaption><span class="code-lang">${escapeHtml(label)}</span><span class="code-actions">${run ? '<button class="run" type="button">Run</button>' : ""}<button class="copy" type="button" aria-label="Copy code">Copy</button></span></figcaption><pre><code>${highlight(shown, lang)}</code></pre>${run ? '<div class="output" hidden></div>' : ""}</figure>`);
        continue;
      }

      const h = line.match(/^(#{1,4})\s+(.+?)\s*(?:\{#([\w-]+)\})?$/);
      if (h && depth === 0) {
        const level = h[1].length;
        const inner = inline(h[2]);
        const id = uniqueId(h[3] ?? slugify(h[2]));
        if (level >= 2) headings.push({ level, id, text: smartQuotes(h[2].replace(/`/g, "")) });
        html.push(level === 1
          ? `<h1>${inner}</h1>`
          : `<h${level} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${inner}</h${level}>`);
        i++;
        continue;
      }

      if (/^\s*<(div|section|aside|p|figure|nav|ul|table|dl|span|a|img|h\d)\b/.test(line) && depth === 0) {
        const raw = [];
        while (i < end && lines[i].trim()) raw.push(lines[i++]);
        html.push(raw.join("\n"));
        continue;
      }

      if (/^---+\s*$/.test(line)) { html.push("<hr>"); i++; continue; }

      if (/^\s*>/.test(line)) {
        const inner = [];
        while (i < end && /^\s*>/.test(lines[i])) inner.push(lines[i++].replace(/^\s*>\s?/, ""));
        const text = inner.join("\n");
        const label = text.match(/^\*\*([^*]+)\*\*\s*/);
        const [kind, when] = label ? label[1].split(/\s*\|\s*/) : [null, null];
        const bodyMd = label ? text.slice(label[0].length) : text;
        const sub = renderMarkdown(bodyMd, { link });
        const tone = kind ? kind.toLowerCase().replace(/[^a-z]+/g, "-") : "note";
        html.push(`<aside class="callout callout-${tone}">${kind ? `<p class="callout-label"><span class="seg"><span class="kind">${escapeHtml(kind)}</span>${when ? `<span class="when">${escapeHtml(when)}</span>` : ""}</span></p>` : ""}${sub.html}</aside>`);
        continue;
      }

      if (/^\s*\|/.test(line) && i + 1 < end && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        const row = (l) => l.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
        const head = row(line);
        const align = row(lines[i + 1]).map((c) => (c.endsWith(":") ? (c.startsWith(":") ? "center" : "right") : ""));
        i += 2;
        const rows = [];
        while (i < end && /^\s*\|/.test(lines[i])) rows.push(row(lines[i++]));
        const cell = (tag, c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ""}>${inline(c)}</${tag}>`;
        html.push(`<div class="table-wrap"><table><thead><tr>${head.map((c, k) => cell("th", c, k)).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, k) => cell("td", c, k)).join("")}</tr>`).join("")}</tbody></table></div>`);
        continue;
      }

      const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
      if (li) {
        const indent = li[1].length;
        const ordered = /\d/.test(li[2]);
        const items = [];
        while (i < end) {
          const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
          if (!m || m[1].length !== indent) break;
          const itemLines = [m[3]];
          i++;
          const childStart = i;
          while (i < end && (lines[i].match(/^\s*/)[0].length > indent && lines[i].trim() || (!lines[i].trim() && i + 1 < end && lines[i + 1].match(/^\s*/)[0].length > indent && lines[i + 1].trim()))) i++;
          const child = lines.slice(childStart, i);
          const nested = child.findIndex((l) => /^\s*([-*]|\d+\.)\s+/.test(l));
          const textLines = nested < 0 ? child : child.slice(0, nested);
          const text = [...itemLines, ...textLines.map((l) => l.trim())].filter(Boolean).join(" ");
          let sub = "";
          if (nested >= 0) {
            const minIndent = Math.min(...child.slice(nested).filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
            sub = renderMarkdown(child.slice(nested).map((l) => l.slice(minIndent)).join("\n"), { link }).html;
          }
          items.push(`<li>${inline(text)}${sub}</li>`);
          while (i < end && !lines[i].trim() && i + 1 < end && /^(\s*)([-*]|\d+\.)\s+/.test(lines[i + 1]) && lines[i + 1].match(/^\s*/)[0].length === indent) i++;
        }
        html.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
        continue;
      }

      const para = [];
      while (i < end && lines[i].trim() && !/^\s*(```|#{1,4}\s|>|\||[-*]\s|\d+\.\s|---+\s*$)/.test(lines[i])) para.push(lines[i++].trim());
      if (para.length === 0) { html.push(`<p>${inline(lines[i++].trim())}</p>`); continue; }
      html.push(`<p>${inline(para.join(" "))}</p>`);
    }
    return html.join("\n");
  }

  return { html: blocks(0, lines.length, 0), headings, examples };
}

/** Plain text of a page's Markdown, for the search index */
export function plainText(md) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*`|_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
