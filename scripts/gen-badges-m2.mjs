// ==========================================================================
// Generate 12 themed badge artworks (gpt-image-1) → platform/assets/badges/
// One per Module 2 mission ("AI and Our World"), matching the Module 1
// kid-sticker style, transparent bg. Files: badge-mod2-1.png … badge-mod2-12.png
//   node scripts/gen-badges-m2.mjs            (reads capstone/.env for the key)
// ==========================================================================
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "..", ".."));
for (const p of [join(ROOT, ".env"), join(ROOT, "curriculum", "module-01-what-is-ai", "capstone", ".env")]) {
  if (existsSync(p)) for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error("Missing OPENAI_API_KEY"); process.exit(1); }

const OUT = join(ROOT, "platform", "assets", "badges");
mkdirSync(OUT, { recursive: true });

const STYLE =
  "A single circular achievement badge sticker for a children's coding camp, flat modern vector style, " +
  "bold rounded shapes, thick outline ring, vibrant palette of electric blue, teal, coral and golden amber, " +
  "cute and friendly, centered composition, isolated on a transparent background, no words or letters. Theme: ";

// Order matches KIDS_NAMES_M2 in platform/lib/badge.js
const THEMES = [
  "a smiling kid-astronaut robot waving hello as it steps through a glowing round portal, welcome back (Returning Builder)",
  "a friendly robot looking through binoculars spotting tiny app, map and photo icons floating around a small globe (World Spotter)",
  "a cute robot doctor-helper holding a glowing heart with a medical cross, a little stethoscope around its neck (Healer's Helper)",
  "a happy planet Earth character hugged by a green leaf and shielded by a friendly little robot, protected and healthy (Planet Protector)",
  "a friendly robot wearing a captain's hat holding a bright flag, leading a tiny team of helper tool-bots (Team Captain)",
  "a wise friendly owl-robot wearing a builder's hard hat, holding a wrench in one wing and an open book in the other (Wise Builder)",
  "a friendly shield character with a glowing padlock keeping a little folder of personal data safe, a small golden key (Privacy Guard)",
  "a balanced golden scale held up by two friendly hands, two equal smiling icons on each side, fairness (Fair Player)",
  "a cheerful bird bursting a light chain into sparkles and flying free over an open gate, freedom and openness (Freedom Keeper)",
  "a friendly robot judge holding a small wooden gavel beside a checklist scroll, making fair and kind rules (Rule Maker)",
  "a child and a friendly robot building a tiny glowing city and planet together out of colorful blocks (World Builder)",
  "a golden champion trophy decorated with a small globe and a laurel wreath, confetti bursting around it (AI Explorer Level 2 champion)"
];

async function gen(i) {
  const fp = join(OUT, "badge-mod2-" + (i + 1) + ".png");
  if (existsSync(fp)) { console.log("· badge-mod2-" + (i + 1) + " exists, skipping"); return; }
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt: STYLE + THEMES[i],
      n: 1, size: "1024x1024", quality: "medium", background: "transparent", output_format: "png"
    })
  });
  if (!r.ok) throw new Error("badge-mod2-" + (i + 1) + ": " + r.status + " " + (await r.text()).slice(0, 160));
  const d = await r.json();
  const b64 = d?.data?.[0]?.b64_json;
  if (!b64) throw new Error("badge-mod2-" + (i + 1) + ": no image");
  writeFileSync(fp, Buffer.from(b64, "base64"));
  console.log("✓ badge-mod2-" + (i + 1) + ".png  (" + THEMES[i].split("(")[1]);
}

const queue = [...THEMES.keys()];
const workers = Array.from({ length: 1 }, async () => {
  while (queue.length) {
    const i = queue.shift();
    try { await gen(i); } catch (e) { console.error("✗", e.message); queue.push(i); await new Promise(r => setTimeout(r, 30000)); }
    await new Promise(r => setTimeout(r, 12000));
  }
});
await Promise.all(workers);
console.log("done");
