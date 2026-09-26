// build-docs.mjs: the namespace-guard docs site. Reads guide/nav.json and the Markdown pages in guide/, and
// CHANGELOG.md, and writes docs/docs/ (served at https://paultendo.github.io/namespace-guard/docs/):
//   docs/docs/<page>/index.html   one page each, with the sidebar, a contents list and previous/next links
//   docs/docs/search.json         the search index
//   docs/docs/assets/             docs.css, docs.js and docs-markdown.mjs (which runs the examples in the browser)
//
// Examples in ```ts run fences get a Run button and run against docs/lib/ (npm run build:docs-lib); lines ending in
// `// → value` show their value, checked against the text. tests/docs-examples.test.ts runs the same examples.
//
// Usage: node scripts/build-docs.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderMarkdown, escapeHtml, plainText, slugify } from "./docs-markdown.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const guideDir = path.join(root, "guide");
const outDir = path.join(root, "docs/docs");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const nav = JSON.parse(fs.readFileSync(path.join(guideDir, "nav.json"), "utf8"));
const REPO = "https://github.com/paultendo/namespace-guard";

// ---- The changelog, as a page: each release a section with its date as a pill ----
function changelogMarkdown() {
  const md = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  // Link definitions at the foot ([0.22.0]: https://www.npmjs.com/…) mark the versions on npm
  const npm = new Map([...md.matchAll(/^\[([0-9.]+)\]:\s*(\S+)\s*$/gm)].map((m) => [m[1], m[2]]));
  return md
    .replace(/^\[[0-9.]+\]:\s*\S+\s*$/gm, "")
    .replace(/^# Changelog[\s\S]*?(?=^## )/m, "# Changelog\n\nWhat changed in each release. The newest is at the top.\n\n")
    .replace(/^## \[?([0-9][0-9.]*)\]?\s*-\s*(.+)$/gm, (_, v, date) => {
      const when = /unreleased/i.test(date) ? "Unreleased" : date.trim();
      const link = npm.has(v) ? `<a class="npm" href="${npm.get(v)}">npm</a>` : "";
      return `## ${v} {#v${v.replace(/\./g, "-")}}\n\n<p class="release-date"><span class="seg"><span class="kind">${v}</span><span class="when">${escapeHtml(when)}</span></span>${link}</p>`;
    });
}

// ---- Pages ----
const pages = [];
for (const section of nav) {
  for (const entry of section.pages) {
    const slug = entry.slug;
    const md = slug === "changelog" ? changelogMarkdown() : fs.readFileSync(path.join(guideDir, `${slug}.md`), "utf8");
    const title = entry.title ?? (md.match(/^#\s+(.+)$/m) ?? [])[1] ?? slug;
    pages.push({ slug, title, section: section.section, md, file: slug === "changelog" ? "CHANGELOG.md" : `guide/${slug}.md` });
  }
}
const bySlug = new Map(pages.map((p) => [p.slug, p]));
const urlOf = (slug) => (slug === "index" ? "" : `${slug}/`);
const relRoot = (slug) => (slug === "index" ? "./" : "../");

function linkFor(from) {
  return (href) => {
    if (/^(https?:|mailto:|#)/.test(href)) return href;
    const [file, hash] = href.split("#");
    const slug = file.replace(/^\.\//, "").replace(/\.md$/, "");
    if (file === "../CHANGELOG.md" || slug === "changelog") return `${relRoot(from)}changelog/${hash ? `#${hash}` : ""}`;
    if (!bySlug.has(slug)) {
      if (/^\.\.\//.test(file)) return `${REPO}/blob/main/${file.replace(/^\.\.\//, "")}${hash ? `#${hash}` : ""}`;
      console.warn(`  ${from}.md: link to missing page ${href}`);
      return href;
    }
    return `${relRoot(from)}${urlOf(slug)}${hash ? `#${hash}` : ""}`;
  };
}

function sidebar(current) {
  return nav.map((section) => `<div class="nav-section"><p class="nav-label">${escapeHtml(section.section)}</p><ul>${section.pages
    .map((e) => {
      const p = bySlug.get(e.slug);
      const here = e.slug === current;
      return `<li><a href="${relRoot(current)}${urlOf(e.slug)}"${here ? ' aria-current="page"' : ""}>${escapeHtml(p.navTitle ?? e.navTitle ?? p.title)}</a></li>`;
    })
    .join("")}</ul></div>`).join("");
}

const searchIndex = [];
fs.mkdirSync(path.join(outDir, "assets"), { recursive: true });

pages.forEach((page, n) => {
  const { html, headings, examples } = renderMarkdown(page.md, { link: linkFor(page.slug) });
  const prev = pages[n - 1], next = pages[n + 1];
  const r = relRoot(page.slug);
  // The changelog's contents list is its releases; Changed/Added/Fixed under each would only repeat
  const toc = headings.filter((h) => h.level <= (page.slug === "changelog" ? 2 : 3));
  const isHome = page.slug === "index";

  // Search: the page, and each section under its heading
  const parts = page.md.split(/^(?=#{2,3}\s)/m);
  parts.forEach((part, k) => {
    const heading = k === 0 ? null : part.match(/^#{2,3}\s+(.+?)\s*(?:\{#[\w-]+\})?$/m)?.[1];
    const id = heading ? headings.find((h) => h.text === heading.replace(/`/g, ""))?.id ?? slugify(heading) : "";
    const text = plainText(k === 0 ? part.replace(/^#\s+.+$/m, "") : part.replace(/^#{2,3}\s+.+$/m, "")).slice(0, 600);
    searchIndex.push({ page: page.title, section: page.section, heading: heading?.replace(/`/g, "") ?? null, url: `${urlOf(page.slug)}${id ? `#${id}` : ""}`, text });
  });

  const out = `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(isHome ? "namespace-guard docs" : `${page.title} · namespace-guard docs`)}</title>
  <meta name="description" content="${escapeHtml(plainText(page.md.replace(/^#.+$/m, "")).slice(0, 155))}">
  <meta name="theme-color" content="#090e17">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>&#x1f6e1;</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Google+Sans+Code:wght@400;500&family=Instrument+Sans:wght@400;500;600;700&family=Syne:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${r}assets/docs.css">
</head>
<body class="${isHome ? "home" : ""}" data-root="${r}" data-lib="${r}../lib/">
  <a class="skip" href="#content">Skip to content</a>
  <header class="topbar">
    <button class="nav-toggle" type="button" aria-label="Open the contents" aria-expanded="false"><span></span></button>
    <a class="wordmark" href="${r}../">namespace-guard</a><a class="wordmark-docs" href="${r}">docs</a>
    <button class="search-open" type="button" aria-label="Search the docs"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>Search</span><kbd>⌘K</kbd></button>
    <nav class="topnav" aria-label="Site">
      <a href="${r}../#playground">Playground</a>
      <a href="${REPO}">GitHub</a>
      <a class="version-tag" href="${r}changelog/">v${pkg.version}</a>
    </nav>
  </header>
  <div class="layout">
    <nav class="sidebar" aria-label="Docs">${sidebar(page.slug)}</nav>
    <main id="content" class="article-wrap">
      <article class="article">
        ${isHome ? "" : `<p class="crumb">${escapeHtml(page.section)}</p>`}
        ${html}
        <footer class="page-foot">
          <a class="edit" href="${REPO}/blob/main/${page.file}">Edit this page on GitHub</a>
          <div class="pager">${prev ? `<a class="prev" href="${r}${urlOf(prev.slug)}"><span>Previous</span>${escapeHtml(prev.title)}</a>` : "<span></span>"}${next ? `<a class="next" href="${r}${urlOf(next.slug)}"><span>Next</span>${escapeHtml(next.title)}</a>` : ""}</div>
        </footer>
      </article>
      ${toc.length > 1 && !isHome ? `<aside class="toc" aria-label="On this page"><p class="nav-label">On this page</p><ul>${toc.map((h) => `<li class="toc-${h.level}"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`).join("")}</ul></aside>` : ""}
    </main>
  </div>
  <div class="search" hidden>
    <div class="search-backdrop"></div>
    <div class="search-panel" role="dialog" aria-modal="true" aria-label="Search the docs">
      <div class="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" placeholder="Search the docs" aria-label="Search the docs" autocomplete="off" spellcheck="false"><kbd>esc</kbd></div>
      <ul class="search-results" role="listbox"></ul>
      <p class="search-hint"><kbd>↑</kbd><kbd>↓</kbd> to move <kbd>↵</kbd> to open</p>
    </div>
  </div>
  ${examples.length ? `<script type="application/json" id="examples">${JSON.stringify(examples.map((e) => ({ body: e.body, checks: e.checks, labels: e.labels }))).replace(/</g, "\\u003c")}</script>` : ""}
  <script type="module" src="${r}assets/docs.js"></script>
</body>
</html>
`;
  const file = path.join(outDir, urlOf(page.slug), "index.html");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
});

fs.writeFileSync(path.join(outDir, "search.json"), JSON.stringify(searchIndex));
fs.copyFileSync(path.join(root, "scripts/docs-markdown.mjs"), path.join(outDir, "assets/docs-markdown.mjs"));
for (const f of ["docs.css", "docs.js"]) fs.copyFileSync(path.join(guideDir, "assets", f), path.join(outDir, "assets", f));
console.log(`docs/docs: ${pages.length} pages, ${searchIndex.length} search entries`);
