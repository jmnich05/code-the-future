// ==========================================================================
// Code the Future — Module 2 lesson content builder
// Converts type-a-kids.md + the widget configs + video map into structured
// "beats" JSON that the full-screen lesson PLAYER renders one screen at a time.
//
//   node lessons/build.mjs   →  lessons/content/kids.json
//
// One beat = one focused screen. Beat types: title | text | quote | list |
// image | video | widget | complete | capstone.  Node 18+, no deps.
//
// Pass 1 = words + interactives + verified videos. Mission art is Pass 2
// (ART_MAP intentionally empty for now), adults track is a later pass.
// ==========================================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOD = join(HERE, "..");

const TRACKS = {
  kids: {
    md: "type-a-kids.md", out: "kids.json", cls: "track-kids",
    title: "AI and Our World", eyebrow: "Module 2 · Ages 8–11", unitWord: "Mission",
    capstone: { href: "../capstone/kids-big-mission.html", eyebrow: "🚀 The Big Mission", h: "Build an AI Helper for the World", p: "You earned all 12 badges. Time for the best part — build something good with a real AI, then check it like a true builder.", btn: "Start the Big Mission →" },
    figs: {}   // Module 1 used public-domain photo figures; Module 2 art is Pass 2.
  }
};

// mission-opening art — Pass 2 (generated scenes). Empty for now → no lead art,
// the player just opens each Mission on its first text beat.
const ART_MAP = { kids: {} };
const ART_CAPTIONS = {};
function artBeat(track, n) {
  if (track === "kids" && existsSync(join(MOD, "assets", "art", `mission-${n}.jpg`))) {
    const cap = ART_CAPTIONS[n] ? `<p class="art-cap">${ART_CAPTIONS[n]}</p>` : "";
    return { type: "image", html: `<div class="lesson-art"><img src="../assets/art/mission-${n}.jpg" alt="" loading="lazy">${cap}</div>` };
  }
  const name = ART_MAP[track] && ART_MAP[track][n];
  return name ? { type: "image", html: `<div class="lesson-art"><img src="../assets/art/${name}.svg" alt="" loading="lazy"></div>` } : null;
}

// video breaks — verified via YouTube oEmbed. Mixed reputable sources (Code.org
// preferred; Google, Common Sense Education, TED-Ed where Code.org had no fit).
// Healthcare (M3), energy/science (M4), and the heaviest ethics mission (M9)
// have NO kid-appropriate verified video and are intentionally discussion-led.
const VIDEO_MAP = {
  kids: {
    2:  { id: "oJC8VIDSx_Q", channel: "Google",                  title: "How AI Works in Everyday Life",                 cap: "🍿 Video break! A quick look at AI quietly helping all around us — maps, photos, translation, and more." },
    5:  { id: "zNxw5gJtHLc", channel: "Code.org",                title: "Ethics & AI: Privacy & the Future of Work",     cap: "🍿 Video break! How AI is changing the way grown-ups work." },
    6:  { id: "dWRnCXbUDgA", channel: "Code.org",                title: "Why AI Matters",                                cap: "🍿 Video break! Why being careful and responsible with AI really matters." },
    7:  { id: "kHYkWtI7004", channel: "Common Sense Education",   title: "The Digital Footprint",                         cap: "🍿 Video break! The trail of info you leave online — your digital footprint." },
    8:  { id: "tJQSyzBUAew", channel: "Code.org",                title: "Ethics & AI: Equal Access and Algorithmic Bias", cap: "🍿 Video break! Why fair access to powerful AI tools matters for everyone." },
    10: { id: "RzkD_rTEBYs", channel: "TED-Ed",                  title: "How Will AI Change the World?",                 cap: "🍿 Video break! Big ideas about how people get to shape what AI does next." },
    11: { id: "nKIu9yen5nc", channel: "Code.org",                title: "What Most Schools Don't Teach",                 cap: "🍿 Video break! You can be a builder of technology — not just a user of it." }
  }
};
function videoBeat(track, n) {
  const v = VIDEO_MAP[track] && VIDEO_MAP[track][n];
  if (!v) return null;
  const t = String(v.title).replace(/&/g, "&amp;");
  return { type: "video", html:
    `<div class="lesson-video"><div class="vframe"><iframe src="https://www.youtube-nocookie.com/embed/${v.id}?rel=0&modestbranding=1" title="${t}" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture; web-share" allowfullscreen></iframe></div>` +
    `<p class="vcap">${v.cap}<br><span class="vcredit">“${t}” · ${v.channel} · YouTube</span></p></div>` };
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
  return key ? map[key] : null;
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
  ctx.videoDone = false;
  const rawLines = unitText.split("\n").filter((l) => l.trim() !== "---");
  const heading0 = rawLines[0].replace(/^##\s/, "").trim();
  const isIntro = /how this module works/i.test(heading0);
  const heading = heading0.replace(/^(Mission|Section)\s+\d+\s*[—–-]\s*/i, "");

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
    if (/\[INTERACTIVE/.test(joined)) {
      if (!ctx.videoDone) { const vb = videoBeat(ctx.track, ctx.n); if (vb) { beats.push(vb); ctx.videoDone = true; } }
      beats.push({ type: "widget", html: ctx.nextWidget() }); continue;
    }
    if (/^####\s|^###\s/.test(f0)) { pendingHead += blockHtml(blk); continue; }
    const html = pendingHead + blockHtml(blk);
    beats.push({ type: blockType(f0), html });
    pendingHead = "";
  }
  if (completeBuf.length) beats.push({ type: "complete", html: completeBuf.map(blockHtml).join("") });

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

for (const t of ["kids"]) {
  const r = buildTrack(t);
  console.log(`${r.track}: ${r.units} units · ${r.beats} beats · ${r.widgets} widgets → lessons/content/${TRACKS[t].out}`);
}
