// ==========================================================================
// Code the Future — Lesson content builder
// Converts the curriculum markdown + widget configs + images into structured
// "beats" JSON that the full-screen lesson PLAYER renders one screen at a time.
//
//   node lessons/build.mjs   →  lessons/content/kids.json, adults.json
//
// One beat = one focused screen. Beat types: title | text | quote | list |
// image | widget | complete | capstone.  Node 18+, no deps.
// ==========================================================================
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOD = join(HERE, "..");

const IMG = {
  turing: { src: "../assets/img/turing.jpg", cap: "<b>Alan Turing</b> — in 1950 he asked, “Can machines think?”", credit: "Public domain · Wikimedia Commons" },
  eniac: { src: "../assets/img/eniac.jpg", cap: "<b>ENIAC (1947)</b> — early computers were great at math, but couldn't learn.", credit: "U.S. Army · public domain" },
  neuron: { src: "../assets/img/neuron-cajal.jpg", cap: "<b>Real neurons</b>, drawn by Santiago Ramón y Cajal. AI's “neural networks” borrow this idea.", credit: "Ramón y Cajal · public domain" },
  galaxy: { src: "../assets/img/galaxy-nasa.jpg", cap: "<b>The universe is vast.</b> Your generation will explore it with AI as a tool.", credit: "NASA · public domain" }
};

const TRACKS = {
  kids: {
    md: "type-a-kids.md", out: "kids.json", cls: "track-kids",
    title: "What Is AI?", eyebrow: "Module 1 · Ages 8–11", unitWord: "Mission",
    capstone: { href: "../capstone/kids-big-mission.html", eyebrow: "🚀 The Big Mission", h: "Now use AI yourself", p: "You earned all 12 badges. Time for the best part — talk to a real AI.", btn: "Start the Big Mission →" },
    figs: { "Is AI Like a Brain": ["neuron"], "The Story of AI": ["turing", "eniac"], "The Future Is Yours": ["galaxy"] }
  },
  adults: {
    md: "type-b-adults.md", out: "adults.json", cls: "track-adults",
    title: "What Is AI?", eyebrow: "Module 1 · Adults", unitWord: "Section",
    capstone: { href: "../capstone/adults-capstone.html", eyebrow: "Capstone", h: "Create & use AI", p: "You understand what AI is. Now operate one — write prompts and turn the temperature dial.", btn: "Open the capstone →" },
    figs: { "70-Year Story, Part 1": ["turing", "eniac"], "Brain Inspiration": ["neuron"], "The Transformation Ahead": ["galaxy"] }
  }
};

// original concept art (assets/art/*.svg) — one per mission, by number
const ART_MAP = {
  kids: { 1: "welcome", 2: "learns", 3: "patterns", 4: "training", 5: "seeing", 6: "words", 7: "attention", 8: "brain-net", 9: "timeline", 10: "trust", 11: "future", 12: "trophy" },
  adults: { 1: "welcome", 2: "learns", 3: "patterns", 4: "timeline", 5: "timeline", 6: "future", 7: "brain-net", 8: "words", 9: "seeing", 10: "training", 11: "trust", 12: "trophy" }
};
function artBeat(track, n) {
  const name = ART_MAP[track] && ART_MAP[track][n];
  return name ? { type: "image", html: `<div class="lesson-art"><img src="../assets/art/${name}.svg" alt="" loading="lazy"></div>` } : null;
}

function widgetBlocks(previewFile) {
  const html = readFileSync(join(MOD, "interactive", previewFile), "utf8");
  return html.match(/<div class="ctf"><div data-ctf-widget[\s\S]*?<\/div><\/div>/g) || [];
}
function inline(t) {
  t = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return t;
}
function listItems(lines, marker) {
  const items = [];
  for (const ln of lines) {
    if (marker.test(ln)) items.push(ln.replace(marker, "").trim());
    else if (items.length) items[items.length - 1] += " " + ln.trim();
  }
  return items;
}
function figFor(track, title) {
  const map = TRACKS[track].figs;
  const key = Object.keys(map).find((k) => title.includes(k));
  if (!key) return null;
  const items = map[key].map((id) => {
    const im = IMG[id];
    return `<figure><img src="${im.src}" alt="" loading="lazy"><figcaption>${im.cap}<br><span class="credit">${im.credit}</span></figcaption></figure>`;
  });
  return `<div class="lesson-fig${items.length > 1 ? " row" : ""}">${items.join("")}</div>`;
}
function blockHtml(lines) {
  const first = lines[0];
  if (/^####\s/.test(first)) return `<h4>${inline(first.replace(/^####\s/, ""))}</h4>`;
  if (/^###\s/.test(first)) return `<h3>${inline(first.replace(/^###\s/, ""))}</h3>`;
  if (/^>\s?/.test(first)) {
    const ps = lines.map((l) => l.replace(/^>\s?/, "")).filter((l) => l.trim() !== "");
    return `<blockquote>${ps.map((p) => `<p>${inline(p)}</p>`).join("")}</blockquote>`;
  }
  if (/^\d+\.\s/.test(first)) return `<ol>${listItems(lines, /^\d+\.\s/).map((i) => `<li>${inline(i)}</li>`).join("")}</ol>`;
  if (/^-\s/.test(first)) return `<ul>${listItems(lines, /^-\s/).map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`;
  if (/Next →|Next up|Badge earned|Progress:|of 12 ·/.test(lines.join("\n"))) return `<p>${lines.map((l) => inline(l.trim())).join("<br>")}</p>`;
  return `<p>${inline(lines.join(" ").trim())}</p>`;
}
function blockType(first) {
  if (/^>\s?/.test(first)) return "quote";
  if (/^-\s/.test(first) || /^\d+\.\s/.test(first)) return "list";
  return "text";
}
const isMeta = (l) => /^\*.*(minutes|of 12).*\*$/.test(l.trim());
const isComplete = (l) => /^###\s/.test(l) && /complete/i.test(l);

function buildUnit(unitText, ctx) {
  const rawLines = unitText.split("\n").filter((l) => l.trim() !== "---");
  const heading0 = rawLines[0].replace(/^##\s/, "").trim();
  const isIntro = /how this module works/i.test(heading0);
  // strip the "Mission N — " / "Section N — " prefix (the number is shown separately)
  const heading = heading0.replace(/^(Mission|Section)\s+\d+\s*[—–-]\s*/i, "");

  // group remaining into blocks separated by blank lines
  const blocks = [];
  let buf = [];
  for (const ln of rawLines.slice(1)) {
    if (ln.trim() === "") { if (buf.length) { blocks.push(buf); buf = []; } }
    else buf.push(ln);
  }
  if (buf.length) blocks.push(buf);

  let meta = "";
  const beats = [];
  let pendingHead = "";
  let completeBuf = [];
  let inComplete = false;

  for (const blk of blocks) {
    const f0 = blk[0];
    const joined = blk.join("\n");
    if (isMeta(f0)) { meta = inline(f0.trim().replace(/^\*|\*$/g, "")).replace(/\s*·\s*(Mission|Section)\s+\d+\s+of\s+\d+/i, ""); continue; }
    if (/\[CAPSTONE/.test(joined)) { ctx.capstoneHtml = capstoneHtml(ctx.track); continue; }
    if (inComplete) { completeBuf.push(blk); continue; }
    if (isComplete(f0)) { inComplete = true; completeBuf.push(blk); continue; }
    if (/\[INTERACTIVE/.test(joined)) { beats.push({ type: "widget", html: ctx.nextWidget() }); continue; }
    if (/^####\s|^###\s/.test(f0)) { pendingHead += blockHtml(blk); continue; }
    const html = pendingHead + blockHtml(blk);
    beats.push({ type: blockType(f0), html });
    pendingHead = "";
  }
  if (completeBuf.length) beats.push({ type: "complete", html: completeBuf.map(blockHtml).join("") });

  // lead visuals after the title: original concept art, then any PD photo
  const lead = [];
  const art = isIntro ? null : artBeat(ctx.track, ctx.n);
  if (art) lead.push(art);
  const fig = figFor(ctx.track, heading);
  if (fig) lead.push({ type: "image", html: fig });

  return { n: ctx.n, kind: isIntro ? "intro" : "unit", title: heading, meta, beats: [...lead, ...beats] };
}

function capstoneHtml(track) {
  const c = TRACKS[track].capstone;
  return `<p class="cap-eyebrow">${c.eyebrow}</p><h2>${c.h}</h2><p>${c.p}</p><a class="cap-btn" href="${c.href}">${c.btn}</a>`;
}

function buildTrack(track) {
  const cfg = TRACKS[track];
  const md = readFileSync(join(MOD, cfg.md), "utf8");
  const widgets = widgetBlocks(track === "kids" ? "preview-kids.html" : "preview-adults.html");
  let wi = 0;
  const ctx = { track, n: 0, nextWidget: () => widgets[wi++] || "", capstoneHtml: null };

  const body = md.replace(/^#\s.*$/m, "").replace(/^>\sTrack:[\s\S]*?(?=\n##\s)/m, "");
  const units = body.split(/\n(?=##\s)/).map((u) => u.trim()).filter((u) => u.startsWith("## "));

  const missions = [];
  for (const u of units) {
    const heading = u.split("\n")[0];
    if (!/how this module works/i.test(heading)) ctx.n += 1;
    missions.push(buildUnit(u, ctx));
  }
  if (ctx.capstoneHtml) missions.push({ kind: "capstone", title: cfg.capstone.h, meta: "", beats: [{ type: "capstone", html: ctx.capstoneHtml }] });

  const data = { track, cls: cfg.cls, title: cfg.title, eyebrow: cfg.eyebrow, unitWord: cfg.unitWord, total: ctx.n, missions };
  mkdirSync(join(HERE, "content"), { recursive: true });
  writeFileSync(join(HERE, "content", cfg.out), JSON.stringify(data, null, 1));
  const beatCount = missions.reduce((a, m) => a + m.beats.length, 0);
  return { track, units: ctx.n, beats: beatCount, widgets: wi };
}

for (const t of ["kids", "adults"]) {
  const r = buildTrack(t);
  console.log(`${r.track}: ${r.units} units · ${r.beats} beats · ${r.widgets} widgets → lessons/content/${TRACKS[t].out}`);
}
