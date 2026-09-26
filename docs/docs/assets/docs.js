// namespace-guard docs: search, runnable examples, the contents list, copy buttons and the mobile sidebar.
import { transformExample, parseExpected, matchesExpected, formatValue, highlight, escapeHtml, markLookalikes } from "./docs-markdown.mjs";

const root = document.body.dataset.root;
const libBase = document.body.dataset.lib;

// ---- The library, loaded once, for examples and the home page's check ----
let libPromise;
export function loadLibrary() {
  // import() resolves against this script, so the page-relative path is made absolute first
  const at = (f) => new URL(`${libBase}${f}`, document.baseURI).href;
  libPromise ??= Promise.all([
    import(at("namespace-guard.mjs")),
    import(at("confusable-weights.mjs")),
  ]).then(([main, weights]) => ({ ...main, ...weights }));
  return libPromise;
}

// ---- Examples: run against the real library, each shown line checked against what the page says ----
const examples = JSON.parse(document.getElementById("examples")?.textContent ?? "[]");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function runExample(figure) {
  const out = figure.querySelector(".output");
  const pre = figure.querySelector("pre");
  const editing = pre.isContentEditable;
  const { body, checks, labels = [] } = editing ? transformExample(pre.innerText) : examples[+figure.dataset.example];
  const shown = [];
  let error = null;
  try {
    const lib = await loadLibrary();
    const names = Object.keys(lib).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
    const fn = new AsyncFunction(...names, "__show", body);
    await fn(...names.map((k) => lib[k]), (k, v) => { shown[k] = v; });
  } catch (e) {
    error = e;
  }
  const rows = checks.map((expected, k) => {
    if (!(k in shown)) return "";
    const parsed = parseExpected(expected);
    const ok = parsed ? matchesExpected(shown[k], parsed.value) : null;
    const mark = ok === null ? "→" : ok ? "✓" : "≠";
    const title = ok === false ? ` title="The page says ${escapeHtml(expected)}"` : "";
    const expr = labels[k] ? `<span class="expr">${markLookalikes(escapeHtml(labels[k]))}</span>` : "";
    return `<li><span class="mark${ok === false ? " off" : ""}"${title}>${mark}</span><span class="line">${expr}<span class="val">${markLookalikes(escapeHtml(formatValue(shown[k])))}</span></span></li>`;
  });
  if (error) rows.push(`<li><span class="mark off">!</span><span class="err">${escapeHtml(String(error.message ?? error))}</span></li>`);
  out.innerHTML = `<p class="output-head">${editing ? "Your version, run in this page" : "Run in this page against namespace-guard"}</p><ol>${rows.join("")}</ol>`;
  out.hidden = false;
}

document.querySelectorAll("figure.runnable").forEach((figure) => {
  const run = figure.querySelector(".run");
  run.addEventListener("click", () => runExample(figure));
  // Run once when the example first comes into view, so its results are there to read
  new IntersectionObserver((entries, obs) => {
    if (entries.some((e) => e.isIntersecting)) { obs.disconnect(); runExample(figure); }
  }, { rootMargin: "200px" }).observe(figure);
  // Double-click the code to edit it; Run (or ⌘↵) runs your version
  const pre = figure.querySelector("pre");
  pre.addEventListener("dblclick", () => {
    if (pre.isContentEditable) return;
    pre.contentEditable = "true";
    pre.spellcheck = false;
    run.textContent = "Run yours";
    pre.focus();
  });
  pre.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runExample(figure); }
  });
  pre.addEventListener("blur", () => {
    const code = pre.querySelector("code") ?? pre;
    code.innerHTML = highlight(pre.innerText, "ts");
  });
});

// ---- Copy buttons ----
document.querySelectorAll("figure.code .copy").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const text = btn.closest("figure").querySelector("pre").innerText;
    try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; }
    catch { btn.textContent = "Select and copy"; }
    setTimeout(() => (btn.textContent = "Copy"), 1400);
  });
});

// ---- On this page: the section you're reading ----
const tocLinks = [...document.querySelectorAll(".toc a")];
if (tocLinks.length) {
  const targets = tocLinks.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean);
  const mark = () => {
    const y = scrollY + 140;
    let current = targets[0];
    for (const t of targets) if (t.offsetTop <= y) current = t;
    tocLinks.forEach((a) => a.classList.toggle("active", a.hash === `#${current?.id}`));
  };
  addEventListener("scroll", mark, { passive: true });
  mark();
}

// ---- Sidebar on narrow screens ----
const toggle = document.querySelector(".nav-toggle");
toggle?.addEventListener("click", () => {
  const open = document.body.classList.toggle("nav-open");
  toggle.setAttribute("aria-expanded", String(open));
});
document.querySelector(".sidebar a[aria-current]")?.scrollIntoView({ block: "center" });

// ---- Search: ⌘K, Ctrl+K or / ----
const search = document.querySelector(".search");
const input = search.querySelector("input");
const list = search.querySelector(".search-results");
let index, selected = 0, results = [];

async function openSearch() {
  search.hidden = false;
  input.value = "";
  input.focus();
  index ??= await fetch(`${root}search.json`).then((r) => r.json()).catch(() => []);
  render();
}
function closeSearch() { search.hidden = true; }

// Curly and straight quotes match each other, so "isn't" finds "isn’t"
const fold = (s) => s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');

function score(entry, terms) {
  const title = fold(`${entry.page} ${entry.heading ?? ""}`);
  const text = fold(entry.text);
  let s = 0;
  for (const t of terms) {
    const inHead = fold(entry.heading ?? "").includes(t), inPage = fold(entry.page).includes(t);
    const inText = text.includes(t);
    if (!inHead && !inPage && !inText) return 0;
    s += (inHead ? 8 : 0) + (inPage ? 4 : 0) + (inText ? 1 + Math.min(3, text.split(t).length - 1) * 0.3 : 0);
    if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(title)) s += 3;
  }
  return s + (entry.heading ? 0 : 0.5);
}

function highlightTerms(text, terms) {
  let html = escapeHtml(text);
  for (const t of terms) html = html.replace(new RegExp(`(${escapeHtml(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"), "<mark>$1</mark>");
  return html;
}

function render() {
  const q = fold(input.value.trim());
  const terms = q.split(/\s+/).filter(Boolean);
  if (!terms.length) {
    results = (index ?? []).filter((e) => !e.heading).slice(0, 8);
  } else {
    results = (index ?? []).map((e) => [score(e, terms), e]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, 12).map(([, e]) => e);
  }
  selected = 0;
  if (!results.length) { list.innerHTML = `<li class="search-empty">Nothing found for “${escapeHtml(input.value)}”.</li>`; return; }
  list.innerHTML = results.map((e, k) => {
    const at = terms.length ? fold(e.text).indexOf(terms[0]) : -1;
    const snip = at >= 0 ? `${at > 40 ? "…" : ""}${e.text.slice(Math.max(0, at - 40), at + 110)}` : e.text.slice(0, 120);
    return `<li role="option" aria-selected="${k === 0}"><a href="${root}${e.url}"><span class="where">${escapeHtml(e.section)}${e.heading ? ` · ${escapeHtml(e.page)}` : ""}</span><span class="title">${highlightTerms(e.heading ?? e.page, terms)}</span><span class="snip">${highlightTerms(snip, terms)}</span></a></li>`;
  }).join("");
}

function move(d) {
  const items = [...list.querySelectorAll("li[role=option]")];
  if (!items.length) return;
  items[selected]?.setAttribute("aria-selected", "false");
  selected = (selected + d + items.length) % items.length;
  items[selected].setAttribute("aria-selected", "true");
  items[selected].scrollIntoView({ block: "nearest" });
}

input.addEventListener("input", render);
input.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
  else if (e.key === "Enter") { const a = list.querySelectorAll("li[role=option] a")[selected]; if (a) location.href = a.href; }
  else if (e.key === "Escape") closeSearch();
});
search.querySelector(".search-backdrop").addEventListener("click", closeSearch);
document.querySelector(".search-open").addEventListener("click", openSearch);
addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) { e.preventDefault(); openSearch(); }
});
if (!/Mac|iPhone|iPad/.test(navigator.platform)) document.querySelectorAll(".search-open kbd").forEach((k) => (k.textContent = "Ctrl K"));

// ---- The home page's check: the same fixed guard as the homepage demo ----
const tryInput = document.querySelector(".try-form input");
if (tryInput) {
  const out = document.querySelector(".try-out");
  const PROTECT = ["paypal", "microsoft", "github", "vercel"];
  let guard;
  const verdict = (tone, v, why) => `<span class="verdict ${tone}"><span class="v">${escapeHtml(v)}</span><span>${escapeHtml(why)}</span></span>`;
  async function check(value) {
    const name = value.trim();
    if (!name) { out.innerHTML = '<span class="hint">Type a name, or pick one below.</span>'; return; }
    const lib = await loadLibrary();
    guard ??= lib.createNamespaceGuardWithProfile("consumer-handle", {
      reserved: { system: ["admin", "api", "settings", "login", "help", "support", "billing"] },
      sources: [{ name: "user", column: "handle", scopeKey: "id" }],
      risk: { protect: PROTECT },
      validators: [lib.createInvisibleCharacterValidator(), lib.createHomoglyphValidator({ rejectMixedScript: true })],
    }, { findOne: async (_s, v) => (["sarah", "bob"].includes(v) ? { id: v } : null) });
    const r = await guard.check(name);
    if (!r.available) {
      if (r.reason === "taken") { out.innerHTML = verdict("bad", "Taken", "by a user"); return; }
      if (r.reason === "reserved") { out.innerHTML = verdict("warn", "Reserved", `${r.category ?? "reserved"} name`); return; }
      out.innerHTML = verdict("bad", "Refused", r.message); return;
    }
    const d = guard.enforceRisk(name, { failOn: "block" });
    const top = d.risk?.matches?.[0];
    if (!d.allowed && top) { out.innerHTML = verdict("bad", "Blocked", `${lib.areConfusable(name.normalize("NFKC"), top.target) ? "reads as" : "too close to"} ${top.target}`); return; }
    if (d.action === "warn" && top) { out.innerHTML = verdict("warn", "Free", `but close to ${top.target}`); return; }
    out.innerHTML = verdict("ok", "Free", "nobody has it");
  }
  let t;
  tryInput.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => check(tryInput.value), 180); });
  document.querySelectorAll(".try-chips button").forEach((b) => b.addEventListener("click", () => { tryInput.value = b.dataset.name; check(b.dataset.name); }));
  check(tryInput.value);
}
