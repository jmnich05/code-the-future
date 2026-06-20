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
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOD = join(HERE, "..");

const IMG = {
  turing: { src: "../assets/img/turing.jpg", cap: "<b>Alan Turing</b> — in 1950 he asked, “Can machines think?”", credit: "Public domain · Wikimedia Commons" },
  eniac: { src: "../assets/img/eniac.jpg", cap: "<b>ENIAC (1947)</b> — early computers were great at math, but couldn't learn.", credit: "U.S. Army · public domain" },
  neuron: { src: "../assets/img/neuron-cajal.jpg", cap: "<b>Real neurons</b>, drawn by Santiago Ramón y Cajal. AI's “neural networks” borrow this idea.", credit: "Ramón y Cajal · public domain" },
  galaxy: { src: "../assets/img/galaxy-nasa.jpg", cap: "<b>The universe is vast.</b> Your generation will explore it with AI as a tool.", credit: "NASA · public domain" },
  ada: { src: "../assets/img/ada-lovelace.jpg", cap: "<b>Ada Lovelace</b> — wrote the first computer program in the 1840s, a century before computers existed.", credit: "Public domain · Wikimedia Commons" },
  rover: { src: "../assets/img/mars-rover-nasa.jpg", cap: "<b>A robot on Mars.</b> NASA's Curiosity rover took this selfie — built by people who once sat where you are.", credit: "NASA/JPL-Caltech · public domain" },
  deepfield: { src: "../assets/img/deep-field-nasa.jpg", cap: "<b>Thousands of galaxies</b> in one tiny patch of sky — discovery is just getting started.", credit: "NASA/ESA Hubble · public domain" },
  eliza: { src: "../assets/img/eliza.png", cap: "<b>ELIZA (1966)</b> — the first chatbot! People typed to it like a friend… but it was just clever pattern tricks.", credit: "Public domain · Wikimedia Commons" },
  shakey: { src: "../assets/img/shakey.jpg", cap: "<b>Shakey (1969)</b> — the first robot that could look around and plan its own moves. (Yes, it shook a lot.)", credit: "Photo: The wub · CC BY-SA 4.0" },
  deepblue: { src: "../assets/img/deep-blue.jpg", cap: "<b>Deep Blue (1997)</b> — the chess computer that beat the human world champion. This is one of its towers.", credit: "Photo: James the photographer · CC BY 2.0" },
  perceptron: { src: "../assets/img/perceptron.png", cap: "<b>The Perceptron (1958)</b> — the very first “pretend brain” machine. Every neural network today is its grandkid.", credit: "Operator's manual · public domain" }
};

const TRACKS = {
  kids: {
    md: "type-a-kids.md", out: "kids.json", cls: "track-kids",
    title: "What Is AI?", eyebrow: "Module 1 · Ages 8–11", unitWord: "Mission",
    capstone: { href: "../capstone/kids-big-mission.html", eyebrow: "🚀 The Big Mission", h: "Now use AI yourself", p: "You earned all 12 badges. Time for the best part — talk to a real AI.", btn: "Start the Big Mission →" },
    figs: { "Is AI Like a Brain": ["neuron", "perceptron"], "The Story of AI": ["ada", "turing", "eliza", "shakey", "deepblue"], "What AI Is Great At": ["eniac"], "The Future Is Yours": ["rover", "galaxy"], "You Did It": ["deepfield"] }
  },
  adults: {
    md: "type-b-adults.md", out: "adults.json", cls: "track-adults",
    title: "What Is AI?", eyebrow: "Module 1 · Adults", unitWord: "Section",
    capstone: { href: "../capstone/adults-capstone.html", eyebrow: "Capstone", h: "Create & use AI", p: "You understand what AI is. Now operate one — write prompts and turn the temperature dial.", btn: "Open the capstone →" },
    figs: { "70-Year Story, Part 1": ["turing", "eniac"], "Brain Inspiration": ["neuron"], "The Transformation Ahead": ["rover", "galaxy"], "Your Place in It": ["ada"], "Consolidation": ["deepfield"] }
  }
};

// mission-opening art — one per mission, by number.
// kids: generated scene PNGs (assets/art/mission-N.png) with a caption tying
// the picture to the mission's idea; falls back to the old abstract SVGs if a
// PNG hasn't been generated yet (run: node scripts/gen-mission-art.mjs)
const ART_MAP = {
  kids: { 1: "welcome", 2: "learns", 3: "patterns", 4: "training", 5: "seeing", 6: "words", 7: "attention", 8: "brain-net", 9: "timeline", 10: "trust", 11: "future", 12: "trophy" },
  adults: { 1: "welcome", 2: "learns", 3: "patterns", 4: "timeline", 5: "timeline", 6: "future", 7: "brain-net", 8: "words", 9: "seeing", 10: "training", 11: "trust", 12: "trophy" }
};
const ART_CAPTIONS = {
  1: "You + your AI teammate. Building the future is a team sport — that's the whole idea of this camp.",
  2: "AI is a guessing machine: show it stuff, and it guesses what it's looking at.",
  3: "Your brain saw lots of different dogs and found the pattern all by itself. Nobody handed you a dog rulebook!",
  4: "Training = showing a computer LOTS of examples until it spots the pattern — just like you did.",
  5: "To a computer, a picture isn't a cat. It's thousands of tiny colored squares called pixels.",
  6: "AI reads by guessing the next word, over and over, crazy fast. That's really how it works.",
  7: "The attention trick: shine a spotlight on the words that matter most, ignore the rest.",
  8: "A neural network is a pretend brain made of math — inspired by yours, but not the same.",
  9: "AI went from filling a whole room to fitting in your pocket. This mission is that story.",
  10: "AI is amazing at patterns — but feelings, fairness, and judgment? That's YOUR superpower.",
  11: "The future needs builders who understand AI. After this mission, that's you.",
  12: "Every badge, every mission — you earned this one. Final mission!"
};
function artBeat(track, n) {
  if (track === "kids" && existsSync(join(MOD, "assets", "art", `mission-${n}.jpg`))) {
    const cap = ART_CAPTIONS[n] ? `<p class="art-cap">${ART_CAPTIONS[n]}</p>` : "";
    return { type: "image", html: `<div class="lesson-art"><img src="../assets/art/mission-${n}.jpg" alt="" loading="lazy">${cap}</div>` };
  }
  const name = ART_MAP[track] && ART_MAP[track][n];
  return name ? { type: "image", html: `<div class="lesson-art"><img src="../assets/art/${name}.svg" alt="" loading="lazy"></div>` } : null;
}

// video breaks — Code.org "How AI Works" series (classroom-made, ~5 min each).
// IDs verified via YouTube oEmbed. Embedded with youtube-nocookie (privacy mode).
const VIDEO_MAP = {
  kids: {
    2: { id: "Ok-xpKjKp2g", title: "How AI Works", cap: "🍿 Video break! Code.org's quick intro to how AI works — everything we just talked about, in motion." },
    4: { id: "OeU5m6vRyCk", title: "What is Machine Learning?", cap: "🍿 Video break! See machine learning — “learning from examples” — in action." },
    5: { id: "2hXG8v8p0KM", title: "How Computer Vision Works", cap: "🍿 Video break! How a computer really learns to SEE." },
    6: { id: "X-AWdfSFCHQ", title: "How Chatbots and Large Language Models Work", cap: "🍿 Video break! How chatbots guess the next word — for real." },
    8: { id: "JrXazCEACVo", title: "How Neural Networks Work", cap: "🍿 Video break! Inside a neural network — the pretend brain you just learned about." },
    10: { id: "x2mRoFNm22g", title: "Training Data & Bias", cap: "🍿 Video break! Why good examples matter — and what happens when they're unfair." }
  },
  adults: {}
};
function videoBeat(track, n) {
  const v = VIDEO_MAP[track] && VIDEO_MAP[track][n];
  if (!v) return null;
  return { type: "video", html:
    `<div class="lesson-video"><div class="vframe"><iframe src="https://www.youtube-nocookie.com/embed/${v.id}?rel=0&modestbranding=1" title="${v.title}" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture; web-share" allowfullscreen></iframe></div>` +
    `<p class="vcap">${v.cap}<br><span class="vcredit">“${v.title}” · Code.org · YouTube</span></p></div>` };
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
  ctx.videoDone = false;
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
    if (/\[INTERACTIVE/.test(joined)) {
      // a video break (if mapped) lands right before the mission's interactive
      if (!ctx.videoDone) { const vb = videoBeat(ctx.track, ctx.n); if (vb) { beats.push(vb); ctx.videoDone = true; } }
      beats.push({ type: "widget", html: ctx.nextWidget() }); continue;
    }
    if (/^####\s|^###\s/.test(f0)) { pendingHead += blockHtml(blk); continue; }
    const html = pendingHead + blockHtml(blk);
    beats.push({ type: blockType(f0), html });
    pendingHead = "";
  }
  if (completeBuf.length) {
    // distill the recap into a clean, visual card: one affirmation line + what's next.
    // (the badge + progress are shown visually by the player, so we drop the text/ASCII versions)
    const clines = completeBuf.flat();
    let affirmation = "", nextUp = "";
    for (const raw of clines) {
      const l = raw.trim();
      if (!l) continue;
      if (/^#{2,4}\s/.test(l)) continue;                 // "### Mission N Complete!" heading
      if (/you just unlocked/i.test(l)) continue;        // sub-header
      if (/^[-*]\s/.test(l)) continue;                   // unlocked bullets
      if (/badge earned/i.test(l)) continue;             // medal already shows the badge
      if (/^\**\s*progress/i.test(l)) continue;          // ASCII bar → visual dots
      const nm = l.match(/next up\s*(?:[→-]+|:)\s*(.+)/i);
      if (nm) { nextUp = nm[1].replace(/\*\*/g, "").replace(/[.\s]+$/, "").trim(); continue; }
      if (!affirmation) affirmation = inline(l);          // the one motivating prose line
    }
    beats.push({ type: "complete", affirmation, nextUp });
  }

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
