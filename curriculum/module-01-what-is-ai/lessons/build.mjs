// ==========================================================================
// Code the Future — Lesson page builder
// Assembles full HTML lesson pages from the curriculum markdown + the widget
// configs (reused from the interactive preview pages) + public-domain images.
//
//   node lessons/build.mjs        (run from the module-01-what-is-ai folder
//                                   or anywhere; paths are resolved relative
//                                   to this file)
//
// Output: lessons/kids.html, lessons/adults.html  (regenerate any time the
// copy or widget configs change — no hand-edited HTML to keep in sync).
// ==========================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOD = join(HERE, "..");

// ---- image library (public domain — see assets/img/CREDITS.md) -----------
const IMG = {
  turing: { src: "../assets/img/turing.jpg", cap: "<b>Alan Turing</b> — in 1950 he asked, “Can machines think?”", credit: "Public domain · Wikimedia Commons" },
  eniac: { src: "../assets/img/eniac.jpg", cap: "<b>ENIAC (1947)</b> — early computers were great at math, but couldn't learn.", credit: "U.S. Army · public domain" },
  neuron: { src: "../assets/img/neuron-cajal.jpg", cap: "<b>Real neurons</b>, drawn by Santiago Ramón y Cajal. AI's “neural networks” borrow this idea.", credit: "Ramón y Cajal · public domain" },
  galaxy: { src: "../assets/img/galaxy-nasa.jpg", cap: "<b>The universe is vast.</b> Your generation will explore it with AI as a tool.", credit: "NASA · public domain" }
};

// ---- per-track config ----------------------------------------------------
const TRACKS = {
  kids: {
    md: "type-a-kids.md", out: "kids.html", cls: "track-kids",
    eyebrow: "Module 1 · What Is AI? · Ages 8–11",
    title: 'What Is <span class="accent">AI</span>?',
    sub: "12 Missions. Earn every badge, then use real AI yourself.",
    pills: ["12 Missions", "~2 hours", "Ages 8–11"],
    capstone: { href: "../capstone/kids-big-mission.html", eyebrow: "🚀 The Big Mission", h: "Now use AI yourself", p: "You earned all 12 badges. Time for the best part — talk to a real AI.", btn: "Start the Big Mission →" },
    figs: { "Is AI Like a Brain": ["neuron"], "The Story of AI": ["turing", "eniac"], "The Future Is Yours": ["galaxy"] }
  },
  adults: {
    md: "type-b-adults.md", out: "adults.html", cls: "track-adults",
    eyebrow: "Module 1 · What Is AI? · Adults",
    title: 'What Is <span class="accent">AI</span>?',
    sub: "12 short sections — what AI is, how it got here, and why it matters.",
    pills: ["12 Sections", "~2 hours", "No background needed"],
    capstone: { href: "../capstone/adults-capstone.html", eyebrow: "Capstone", h: "Create & use AI", p: "You understand what AI is. Now operate one — write prompts and turn the temperature dial.", btn: "Open the capstone →" },
    figs: { "70-Year Story, Part 1": ["turing", "eniac"], "Brain Inspiration": ["neuron"], "The Transformation Ahead": ["galaxy"] }
  }
};

// ---- extract widget blocks (in order) from a preview page ----------------
function widgetBlocks(previewFile) {
  const html = readFileSync(join(MOD, "interactive", previewFile), "utf8");
  return html.match(/<div class="ctf"><div data-ctf-widget[\s\S]*?<\/div><\/div>/g) || [];
}

// ---- inline markdown ------------------------------------------------------
function inline(t) {
  t = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return t;
}

function figFor(track, title) {
  const map = TRACKS[track].figs;
  const key = Object.keys(map).find((k) => title.includes(k));
  if (!key) return "";
  const items = map[key].map((id) => {
    const im = IMG[id];
    return `<figure><img src="${im.src}" alt="" loading="lazy"><figcaption>${im.cap}<br><span class="credit">${im.credit}</span></figcaption></figure>`;
  });
  return `<div class="lesson-fig${items.length > 1 ? " row" : ""}">${items.join("")}</div>`;
}

function capstoneCTA(track) {
  const c = TRACKS[track].capstone;
  return `<div class="capstone-cta"><p class="eyebrow">${c.eyebrow}</p><h2>${c.h}</h2><p>${c.p}</p><a href="${c.href}">${c.btn}</a></div>`;
}

// split a block of lines into list items by a marker regex (handles wrap)
function listItems(lines, marker) {
  const items = [];
  for (const ln of lines) {
    if (marker.test(ln)) items.push(ln.replace(marker, "").trim());
    else if (items.length) items[items.length - 1] += " " + ln.trim();
  }
  return items;
}

// render one block (array of raw lines) to HTML
function renderBlock(lines, ctx) {
  const first = lines[0];
  const joined = lines.join("\n");

  if (/\[INTERACTIVE/.test(joined)) return ctx.nextWidget();
  if (/\[CAPSTONE/.test(joined)) { ctx.capstoneSeen = true; return capstoneCTA(ctx.track); }
  if (/^####\s/.test(first)) return `<h4>${inline(first.replace(/^####\s/, ""))}</h4>`;
  if (/^###\s/.test(first)) return `<h3>${inline(first.replace(/^###\s/, ""))}</h3>`;
  if (/^>\s?/.test(first)) {
    const ps = lines.map((l) => l.replace(/^>\s?/, "")).filter((l) => l.trim() !== "");
    return `<blockquote>${ps.map((p) => `<p>${inline(p)}</p>`).join("")}</blockquote>`;
  }
  if (/^\d+\.\s/.test(first)) return `<ol>${listItems(lines, /^\d+\.\s/).map((i) => `<li>${inline(i)}</li>`).join("")}</ol>`;
  if (/^-\s/.test(first)) return `<ul>${listItems(lines, /^-\s/).map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`;
  if (/^```/.test(first)) { const body = lines.slice(1, lines[lines.length - 1].startsWith("```") ? -1 : undefined).join("\n"); return `<pre><code>${inline(body)}</code></pre>`; }
  // completion meta lines (badge / progress / next / section x of 12) keep breaks
  if (/Next →|Next up|Badge earned|Progress:|of 12 ·/.test(joined)) return `<p>${lines.map((l) => inline(l.trim())).join("<br>")}</p>`;
  // normal paragraph — join wrapped lines
  return `<p>${inline(lines.join(" ").trim())}</p>`;
}

function isMeta(line) { return /^\*.*(minutes|of 12).*\*$/.test(line.trim()); }
function isComplete(line) { return /^###\s/.test(line) && /complete|module \d+ complete/i.test(line); }

function buildUnit(unitText, ctx) {
  const rawLines = unitText.split("\n").filter((l) => l.trim() !== "---");
  const heading = rawLines[0].replace(/^##\s/, "").trim();
  const isIntro = /how this module works/i.test(heading);
  const rest = rawLines.slice(1);

  // group remaining lines into blocks separated by blank lines
  const blocks = [];
  let buf = [];
  for (const ln of rest) {
    if (ln.trim() === "") { if (buf.length) { blocks.push(buf); buf = []; } }
    else buf.push(ln);
  }
  if (buf.length) blocks.push(buf);

  const open = isIntro ? `<section class="lesson-intro">` : `<section class="lesson-unit">`;
  let html = open + `<h2>${inline(heading)}</h2>`;
  let figDone = false, inComplete = false;

  blocks.forEach((blk) => {
    const f0 = blk[0];
    if (isMeta(f0)) { html += `<p class="unit-meta">${inline(f0.trim().replace(/^\*|\*$/g, ""))}</p>`; html += figFor(ctx.track, heading); figDone = true; return; }
    if (/\[CAPSTONE/.test(blk.join("\n")) && inComplete) { html += "</div>"; inComplete = false; }
    if (!inComplete && isComplete(f0)) { html += `<div class="unit-complete">`; inComplete = true; }
    html += renderBlock(blk, ctx);
  });
  if (!figDone) { /* unit without meta line: still allow a figure right after h2 — none expected */ }
  if (inComplete) html += "</div>";
  html += "</section>";
  return html;
}

function buildTrack(track) {
  const cfg = TRACKS[track];
  const md = readFileSync(join(MOD, cfg.md), "utf8");
  const widgets = widgetBlocks(track === "kids" ? "preview-kids.html" : "preview-adults.html");
  let wi = 0;
  const ctx = { track, nextWidget: () => widgets[wi++] || "", capstoneSeen: false };

  // drop the leading author blockquote note + the H1, then split into units at "## "
  const body = md.replace(/^#\s.*$/m, "").replace(/^>\sTrack:[\s\S]*?(?=\n##\s)/m, "");
  const units = body.split(/\n(?=##\s)/).map((u) => u.trim()).filter((u) => u.startsWith("## "));
  const sections = units.map((u) => buildUnit(u, ctx)).join("\n");

  const pills = cfg.pills.map((p) => `<span class="pill">${p}</span>`).join("");
  const out = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Code the Future — ${track === "kids" ? "What Is AI? (Kids)" : "What Is AI? (Adults)"}</title>
<link rel="stylesheet" href="lesson.css">
<link rel="stylesheet" href="../interactive/ctf-widgets.css">
</head>
<body class="${cfg.cls}">
<div class="lesson-progress" id="progress"></div>
<header class="lesson-hero"><div class="inner">
  <p class="eyebrow">◆ ${cfg.eyebrow}</p>
  <h1>${cfg.title}</h1>
  <p>${cfg.sub}</p>
  <div class="meta">${pills}</div>
</div></header>
<main class="lesson-body">
${sections}
<footer class="lesson-foot">CODE THE FUTURE · MODULE 1 · ${track.toUpperCase()}</footer>
</main>
<script>
  var pb=document.getElementById('progress');
  addEventListener('scroll',function(){var h=document.documentElement;var max=h.scrollHeight-h.clientHeight;pb.style.width=(max>0?(h.scrollTop/max*100):0)+'%';},{passive:true});
</script>
<script src="../interactive/ctf-widgets.js"></script>
</body>
</html>`;
  writeFileSync(join(HERE, cfg.out), out);
  return { track, units: units.length, widgets: wi, capstone: ctx.capstoneSeen };
}

for (const t of ["kids", "adults"]) {
  const r = buildTrack(t);
  console.log(`${r.track}: ${r.units} units · ${r.widgets} widgets injected · capstone:${r.capstone ? "yes" : "no"} → lessons/${TRACKS[t].out}`);
}
