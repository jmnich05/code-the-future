// Generate die-cut sticker artwork for the in-person sessions → docs/stickers/
// (docs/* is blocked from the live site — these are print assets.)
//   node scripts/gen-stickers.mjs
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
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

const OUT = join(ROOT, "docs", "stickers");
mkdirSync(OUT, { recursive: true });

const STYLE =
  "Die-cut vinyl sticker design with a bold thick white kiss-cut border following the shape. " +
  "Clean flat vector-illustration style with subtle soft shading, crisp outlines, vibrant and joyful, " +
  "for kids ages 8-11. Brand palette: electric blue (#3D74FF), bright teal (#26C7D1), warm coral (#FF5A38), " +
  "sunny amber (#FFB320), deep space-navy (#0A1024) accents. Isolated on a fully transparent background, " +
  "single sticker only, no drop shadow outside the border. ";

const STICKERS = [
  { file: "future-builder.png",
    p: 'A happy friendly little robot with round teal eyes giving a thumbs up, wearing a tiny builder hard hat, standing on a curved ribbon banner that reads "FUTURE BUILDER" in bold friendly capitals.' },
  { file: "ai-apprentice.png",
    p: 'A fun club crest / guild badge shield shape with a friendly robot head at the center, a small lightning bolt and star, and a banner across the bottom reading "AI APPRENTICE" in bold capitals.' },
  { file: "boss-of-ai.png",
    p: 'A confident kid (gender-neutral, wearing a cape) standing proudly with arms crossed while a cute small robot salutes them, with a bold arc of text above reading "I\'M THE BOSS OF AI".' },
  { file: "bug-hunter.png",
    p: 'A cute cartoon magnifying glass revealing a tiny mischievous purple computer-glitch bug with pixel antennae, with bold text below reading "BUG HUNTER".' },
  { file: "shipped-it.png",
    p: 'A joyful little rocket ship blasting off with a rainbow-teal exhaust trail and tiny confetti pieces, with bold text below reading "SHIPPED IT!".' },
  { file: "louisville-crew.png",
    p: 'A cheerful hot-air balloon shaped like a friendly robot head floating over a tiny stylized green truss bridge and small city skyline, stars around, with a curved banner reading "CODE THE FUTURE" at the top and a small banner reading "LOUISVILLE" at the bottom.' }
];

for (const s of STICKERS) {
  process.stdout.write("→ " + s.file + " … ");
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
    body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt: STYLE + s.p, n: 1, size: "1024x1024", quality: "high",
      background: "transparent", output_format: "png" })
  });
  if (!r.ok) { console.log("FAILED", r.status, (await r.text()).slice(0, 120)); continue; }
  const d = await r.json();
  const b64 = d?.data?.[0]?.b64_json;
  if (!b64) { console.log("no image"); continue; }
  writeFileSync(join(OUT, s.file), Buffer.from(b64, "base64"));
  console.log("✓");
}
console.log("Done →", OUT);
