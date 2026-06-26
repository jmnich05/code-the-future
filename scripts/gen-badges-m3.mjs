// ==========================================================================
// Generate 12 themed badge artworks (gpt-image-1) → platform/assets/badges/
// One per Module 3 mission ("How Coding Got Done"), matching the Module 1/2
// kid-sticker style, transparent bg. Files: badge-mod3-1.png … badge-mod3-12.png
//   node scripts/gen-badges-m3.mjs            (reads capstone/.env for the key)
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

// Order matches KIDS_NAMES_M3 in platform/lib/badge.js
const THEMES = [
  "a smiling kid cadet in front of a tiny glowing screen of colorful code blocks, ready to start (Code Cadet)",
  "two friendly speech bubbles linked by a glowing chain, one human one computer, a little translator robot between them (Language Linker)",
  "a friendly hand holding a glowing pen writing a neat line of code on a small scroll (Line Writer)",
  "a cute cartoon ladybug bug caught inside a round magnifying glass, a friendly net beside it (Bug Hunter)",
  "a friendly toolbox open with a little snake, globe and lightning-bolt tool mascots popping out (Toolsmith)",
  "a cheerful clock-rocket zooming forward with a small gear and a sparkle trail, time speeding up (Time Traveler)",
  "a glowing target with a clear arrow hitting the bullseye, a small speech bubble beside it, clear aim (Prompt Pilot)",
  "a friendly little robot agent running happily around a small circular loop track of glowing gears (Agent Ace)",
  "a friendly robot wearing a director's headset pointing confidently, three tiny helper bots around it (Team Director)",
  "a friendly chef-hat character tasting and giving a golden star to a small glowing app screen (Chief of Taste)",
  "a happy kid and a friendly robot together holding up a freshly built glowing app, teamwork (Real Builder)",
  "a golden champion trophy shaped like a coding bracket with a star and laurel wreath, confetti (Future Coder champion)"
];

async function gen(i) {
  const fp = join(OUT, "badge-mod3-" + (i + 1) + ".png");
  if (existsSync(fp)) { console.log("· badge-mod3-" + (i + 1) + " exists, skipping"); return; }
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt: STYLE + THEMES[i],
      n: 1, size: "1024x1024", quality: "medium", background: "transparent", output_format: "png"
    })
  });
  if (!r.ok) throw new Error("badge-mod3-" + (i + 1) + ": " + r.status + " " + (await r.text()).slice(0, 160));
  const d = await r.json();
  const b64 = d?.data?.[0]?.b64_json;
  if (!b64) throw new Error("badge-mod3-" + (i + 1) + ": no image");
  writeFileSync(fp, Buffer.from(b64, "base64"));
  console.log("✓ badge-mod3-" + (i + 1) + ".png  (" + THEMES[i].split("(")[1]);
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
