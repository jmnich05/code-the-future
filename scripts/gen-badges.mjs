// ==========================================================================
// Generate 12 themed badge artworks (gpt-image-1) → platform/assets/badges/
// One per Module 1 mission, consistent kid-sticker style, transparent bg.
//   node scripts/gen-badges.mjs            (reads capstone/.env for the key)
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

const THEMES = [
  "a smiling kid-astronaut robot holding up a glowing golden star (Future Builder)",
  "a cute curious robot looking through a big magnifying glass at a glowing lightbulb (AI Spotter)",
  "a playful repeating pattern of circles and triangles with one golden piece completing the sequence (Pattern Finder)",
  "a happy cartoon brain character lifting tiny dumbbells like a champion (Brain Trainer)",
  "a cat face made of chunky colorful pixels wearing a detective hat (Pixel Detective)",
  "a magic wand casting sparkles over a friendly speech bubble (Word Wizard)",
  "a friendly glowing eye focusing a spotlight beam onto a golden star target (Attention Ace)",
  "a glowing constellation shaped like a brain with connected nodes and sparkling links (Neuron Navigator)",
  "a retro hourglass merged with a clock face and a tiny rocket orbiting it (Time Traveler)",
  "a superhero shield with a big check mark and a small crown on top (Smart Boss)",
  "a rocket launching from an open friendly hand toward little planets (Future Maker)",
  "a golden trophy with a star on it, surrounded by a laurel wreath and confetti (AI Explorer champion)"
];

async function gen(i) {
  const fp = join(OUT, "badge-" + (i + 1) + ".png");
  if (existsSync(fp)) { console.log("· badge-" + (i + 1) + " exists, skipping"); return; }
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt: STYLE + THEMES[i],
      n: 1, size: "1024x1024", quality: "medium", background: "transparent", output_format: "png"
    })
  });
  if (!r.ok) throw new Error("badge " + (i + 1) + ": " + r.status + " " + (await r.text()).slice(0, 160));
  const d = await r.json();
  const b64 = d?.data?.[0]?.b64_json;
  if (!b64) throw new Error("badge " + (i + 1) + ": no image");
  writeFileSync(join(OUT, "badge-" + (i + 1) + ".png"), Buffer.from(b64, "base64"));
  console.log("✓ badge-" + (i + 1) + ".png  (" + THEMES[i].split("(")[1]);
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
