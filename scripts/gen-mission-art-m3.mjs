// ==========================================================================
// Generate Module 3 artwork (gpt-image-1) →
//   curriculum/module-03-how-coding-got-done/assets/art/mission-N.jpg   (opening scene)
//   curriculum/module-03-how-coding-got-done/assets/art/mission-N-b.jpg (inline analogy)
// Same warm picture-book style as M1/M2. No text in images. Re-run safe.
//   node scripts/gen-mission-art-m3.mjs
// ==========================================================================
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "..", ".."));
for (const p of [join(ROOT, ".env"), join(ROOT, "curriculum", "module-01-what-is-ai", "capstone", ".env")]) {
  if (existsSync(p)) for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error("Missing OPENAI_API_KEY"); process.exit(1); }

const OUT = join(ROOT, "curriculum", "module-03-how-coding-got-done", "assets", "art");
mkdirSync(OUT, { recursive: true });

const STYLE =
  "Warm children's picture-book illustration, flat modern vector style with soft texture, " +
  "bold rounded friendly shapes, palette of electric blue, teal, coral and golden amber on a soft cream background, " +
  "wide landscape composition with one clear focal scene, cute and optimistic, " +
  "absolutely no words, letters, numbers or text anywhere in the image. Scene: ";

// opening scene per mission
const OPEN = [
  "a happy diverse kid sitting at a desk in front of a glowing screen filled with friendly colorful code blocks, excited and curious to start building",
  "a smiling kid handing a glowing note written in simple friendly code-symbols to a cute computer character that lights up because it understands",
  "a focused programmer at a cozy desk typing line after line of glowing code by hand late at night, neat stacks of paper beside them, proud and careful",
  "a big magnifying glass held over a line of glowing code, revealing one tiny cute cartoon ladybug sitting on a wrong symbol, a gentle red glow around it",
  "an open toolbox spilling out friendly coding-tool mascots — a cute green snake, a little blue globe, a golden lightning bolt, a small filing cabinet — each glowing",
  "a split before-and-after scene: on the left a tired kid typing one glowing line at a time, on the right the same kid smiling as a friendly AI instantly fills the screen with code",
  "a kid speaking a clear glowing instruction into a friendly AI robot that builds exactly the right shiny object, a sharp clear thought-bubble above the kid",
  "a cheerful robot agent jogging around a small circular loop track marked with four glowing gear-stations, carrying little tools, happy and busy",
  "a kid sitting in a director's chair with a headset, calmly pointing and directing three friendly robot helpers who are each doing a different building job",
  "a kid wearing a chef's hat tasting and judging little plates of glowing work that friendly robots bring over, giving a happy thumbs-up to the best one",
  "a kid and a friendly AI robot building something cool together from glowing blocks — the kid pointing and deciding while the robot assembles",
  "a proud happy kid on a winners' podium holding up a glowing trophy shaped like a coding bracket, confetti falling, friendly little robots cheering below"
];

// inline analogy per mission (matches the lesson captions)
const INLINE = [
  "a friendly recipe card magically turning into glowing step-by-step code that a cute robot follows one step at a time, like following a recipe",
  "a friendly translator character standing between a person speaking warm word-bubbles and a computer showing rows of gentle on-and-off light switches, turning one into the other",
  "an enormously long scroll of neat handwritten glowing code unrolling across the scene, a tired but proud coder at the end of it, showing how much was written by hand",
  "a long glowing line of code brought to a complete stop by one single tiny cute cartoon bug sitting where a small comma is missing, a soft red stop-glow",
  "a tidy workbench with three labeled friendly tools at work: a green snake shaping a glowing AI brain, a blue globe building a little webpage, a golden bolt powering a game controller",
  "a dramatic before-and-after: on one side an old hand-cranked typewriter slowly printing code, on the other a glowing fountain of code pouring instantly from a friendly AI, a surprised delighted kid in the middle",
  "two thought-bubbles side by side: a blurry fuzzy one producing a weird lumpy blob, and a sharp clear one producing exactly the right shiny button, a thoughtful kid choosing the clear one",
  "a friendly robot agent happily going around a circular track with four glowing stations — a clipboard, a gear, a magnifying glass, and a wrench — looping again and again",
  "a kid head-chef in a busy bright kitchen calmly directing several friendly robot cooks at different stations, tasting and pointing to keep every dish great",
  "a balance scale: on one side a fast blurry speedy robot, on the other a calm thoughtful kid holding a glowing star, a heart, and a checkmark, perfectly balanced",
  "a hopeful loop drawn in the scene: a kid sketches a glowing idea, a friendly AI builds it, the kid improves it, and it gets a little brighter and better each time around",
  "a confident happy kid standing tall holding a glowing toolbox full of colorful code, a bright friendly future city of things they built glowing behind them"
];

async function one(prompt, fp, label) {
  if (existsSync(fp)) { console.log("· " + label + " exists, skipping"); return; }
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
    body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1", prompt: STYLE + prompt, n: 1, size: "1536x1024", quality: "medium", output_format: "jpeg" })
  });
  if (!r.ok) throw new Error(label + ": " + r.status + " " + (await r.text()).slice(0, 160));
  const d = await r.json();
  const b64 = d?.data?.[0]?.b64_json;
  if (!b64) throw new Error(label + ": no image");
  writeFileSync(fp, Buffer.from(b64, "base64"));
  try { execSync(`sips --resampleWidth 1200 "${fp}" >/dev/null 2>&1`); } catch {}
  console.log("✓ " + label);
}

// build the work queue: opening + inline for each mission
const jobs = [];
for (let i = 0; i < 12; i++) {
  jobs.push({ p: OPEN[i], fp: join(OUT, `mission-${i + 1}.jpg`), label: `mission-${i + 1}.jpg` });
  jobs.push({ p: INLINE[i], fp: join(OUT, `mission-${i + 1}-b.jpg`), label: `mission-${i + 1}-b.jpg` });
}

while (jobs.length) {
  const j = jobs.shift();
  try { await one(j.p, j.fp, j.label); } catch (e) { console.error("✗", e.message); jobs.push(j); await new Promise(r => setTimeout(r, 30000)); }
  await new Promise(r => setTimeout(r, 11000));
}
console.log("done");
