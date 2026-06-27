// Generate the illustrated top-down "Parklands of Floyds Fork" map for Module 3
// → platform/assets/louisville-parklands-map.png  (matches M1/M2 map style, 3:2)
//   node scripts/gen-parklands-map.mjs
import { writeFileSync, existsSync, readFileSync } from "node:fs";
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

const fp = join(ROOT, "platform", "assets", "louisville-parklands-map.png");

const PROMPT =
  "Charming hand-painted illustrated top-down park map in a warm cheerful storybook style, soft painterly watercolor textures, " +
  "lush green forests of round leafy trees, winding tan footpaths and trails, gentle slightly-isometric perspective, bright sunny daylight, " +
  "absolutely no words, letters, numbers or text anywhere. Scene: a long nature parkland that follows a meandering blue creek winding from the " +
  "top-left down to the bottom-right (Floyds Fork), threaded by a winding scenic trail (the Louisville Loop) connecting four green park areas. " +
  "Features spread across the map: a big open oval green lawn near a cozy little stone lodge; a calm blue reflecting lake; a pair of tall old " +
  "rustic farm silos on a small hill; a long wooden boardwalk crossing a marshy wetland toward one giant old beech tree; rolling wildflower " +
  "meadows with a few deer and wild turkeys; a small waterfall tumbling over mossy rocks; several little wooden footbridges over the creek; " +
  "and a small canoe-and-kayak launch at the water's edge. Everything connected by the winding trail and surrounded by leafy forest. " +
  "Wide landscape composition, vibrant greens, friendly and inviting.";

const r = await fetch("https://api.openai.com/v1/images/generations", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
  body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1", prompt: PROMPT, n: 1, size: "1536x1024", quality: "high", output_format: "png" })
});
if (!r.ok) { console.error("error:", r.status, (await r.text()).slice(0, 200)); process.exit(1); }
const d = await r.json();
const b64 = d?.data?.[0]?.b64_json;
if (!b64) { console.error("no image"); process.exit(1); }
writeFileSync(fp, Buffer.from(b64, "base64"));
try { execSync(`sips --resampleWidth 1536 "${fp}" >/dev/null 2>&1`); } catch {}
console.log("✓ louisville-parklands-map.png");
