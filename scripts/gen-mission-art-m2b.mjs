// ==========================================================================
// Generate 12 INLINE concept artworks for Module 2 (gpt-image-1) →
// curriculum/module-02-ai-and-society/assets/art/mission-N-b.jpg
// These sit mid-mission and illustrate that mission's core analogy, so the
// idea is shown as well as told. Same warm picture-book style, no text.
//   node scripts/gen-mission-art-m2b.mjs
// Re-run safe: skips files that already exist.
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

const OUT = join(ROOT, "curriculum", "module-02-ai-and-society", "assets", "art");
mkdirSync(OUT, { recursive: true });

const STYLE =
  "Warm children's picture-book illustration, flat modern vector style with soft texture, " +
  "bold rounded friendly shapes, palette of electric blue, teal, coral and golden amber on a soft cream background, " +
  "wide landscape composition with one clear focal idea, cute and optimistic, " +
  "absolutely no words, letters, numbers or text anywhere in the image. Scene: ";

// One concrete ANALOGY per mission — the picture that makes the idea click.
const SCENES = [
  "a happy diverse kid stepping out through a glowing computer screen as if through a doorway, leaving the small screen behind and walking into a big bright real world full of buildings, trees and people (AI leaps off the screen into the real world)",
  "a friendly cutaway of one ordinary street block where a tiny smiling robot helper is tucked into many everyday spots at once — inside a phone, a car dashboard, a mailbox, a doorbell camera, a thermostat — like a hidden-object picture (AI is quietly already everywhere)",
  "a friendly robot holding a metal-detector wand sweeping over a giant glowing medical X-ray where one small spot lights up and beeps, while a smiling human doctor beside it points and makes the decision (AI beeps, the human doctor decides — a metal detector for sickness)",
  "a cheerful smart battery-keeper robot carefully balancing glowing energy between a bright sun and a spinning wind turbine on one side and a cozy lit-up little city on the other, saving extra light in a big battery (AI carefully saving and sharing clean energy)",
  "a clear three-part teamwork picture: a robot tending a smooth conveyor-belt loop of identical boxes, a calm human at a desk making a thoughtful decision, and one odd unusual box sliding over to the human to handle (code runs the loop, AI helps, humans handle the tricky exceptions)",
  "one single hammer shown twice side by side — on the left it gently builds a cute birdhouse, on the right the same hammer is about to break something — with a thoughtful kid choosing the kind, building side (the same tool can help or hurt, the choice is ours)",
  "a kid holding a personal treasure chest of belongings — photos, a diary, a house key — sorting items onto two boards: a public bulletin board for share-it things and a locked private diary for keep-it things, a friendly padlock glowing (your information is yours to sort and protect)",
  "a giant balance scale: on one side a few huge towering robots each holding an enormous glowing power-tool, on the other side a big crowd of regular smiling kids holding tiny tools, hands reaching up wanting a fair share (who holds the biggest, most powerful AI tools matters)",
  "the same flashlight shown twice: on the left it kindly lights a safe path home for a child past gentle guardrails and road signs, on the right it is shined harshly into someone's face — a thoughtful kid choosing the helpful way (tools plus good rules equal freedom)",
  "a big friendly round table with many diverse people of all ages and a couple of helpful robots all seated together, hands reaching in to gently steer a glowing holographic globe of the future (everyone helps decide the future of AI together)",
  "an excited kid inventor at a cozy workbench building their very own friendly little AI helper out of colorful glowing building blocks, gears, a magnifying glass and a big warm heart, a lightbulb of curiosity glowing above (you get to help build it — curiosity, judgment and kindness)",
  "a proud happy kid sitting and looking up at a huge bright thought-bubble filled with all the wonderful things AI can do in the world — hospitals, farms, weather, fairness, friendship — thinking big (look how big you can think about AI now)"
];

async function gen(i) {
  const fp = join(OUT, "mission-" + (i + 1) + "-b.jpg");
  if (existsSync(fp)) { console.log("· mission-" + (i + 1) + "-b.jpg exists, skipping"); return; }
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt: STYLE + SCENES[i],
      n: 1, size: "1536x1024", quality: "medium", output_format: "jpeg"
    })
  });
  if (!r.ok) throw new Error("mission " + (i + 1) + "-b: " + r.status + " " + (await r.text()).slice(0, 160));
  const d = await r.json();
  const b64 = d?.data?.[0]?.b64_json;
  if (!b64) throw new Error("mission " + (i + 1) + "-b: no image");
  writeFileSync(fp, Buffer.from(b64, "base64"));
  try { execSync(`sips --resampleWidth 1200 "${fp}" >/dev/null 2>&1`); } catch {}
  console.log("✓ mission-" + (i + 1) + "-b.jpg");
}

const queue = [...SCENES.keys()];
const workers = Array.from({ length: 1 }, async () => {
  while (queue.length) {
    const i = queue.shift();
    try { await gen(i); } catch (e) { console.error("✗", e.message); queue.push(i); await new Promise(r => setTimeout(r, 30000)); }
    await new Promise(r => setTimeout(r, 11000));
  }
});
await Promise.all(workers);
console.log("done");
