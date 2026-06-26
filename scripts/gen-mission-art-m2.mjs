// ==========================================================================
// Generate 12 mission-opening artworks for Module 2 (gpt-image-1) →
// curriculum/module-02-ai-and-society/assets/art/mission-N.jpg
// Concrete, kid-readable picture-book scenes (the build prefers .jpg over the
// stylized .svg). Re-run safe: skips files that already exist.
//   node scripts/gen-mission-art-m2.mjs
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
  "wide landscape composition with one clear focal scene, cute and optimistic, " +
  "absolutely no words, letters, numbers or text anywhere in the image. Scene: ";

// One concrete, self-explanatory scene per Module 2 mission ("AI and Our World").
const SCENES = [
  "a diverse kid and a friendly small robot happily reuniting with a wave and a high-five at a glowing doorway, a colorful map of the whole world behind them ready for a new adventure (welcome back, exploring the wider world of AI)",
  "a busy friendly town street where a small robot helper quietly appears in many places at once — at a hospital window, on a delivery drone, inside a weather balloon, beside a traffic light — kids walking by not noticing (AI is already everywhere in the real world)",
  "a gentle robot assistant standing beside a smiling human doctor, both looking at a glowing medical scan on a screen where a tiny spot softly lights up, a big friendly heart symbol nearby (AI helping doctors spot what tired eyes miss)",
  "a friendly robot and a kid caring for a healthy green planet Earth — solar panels and wind turbines glowing, a little drone scanning a field of crops, clean rivers and trees, the Earth smiling (AI helping take care of the planet)",
  "a cheerful workplace where humans and friendly robots team up — a robot carrying boxes while a person plans on a glowing board, another robot helping an artist and a builder, everyone collaborating (AI helping people at work)",
  "a glowing magic wand or multi-tool floating in the middle, with a bright helpful sunny scene on one side and a stormy careless mess on the other, a thoughtful kid choosing the bright side (a tool can help or hurt — the choice is ours)",
  "a kid holding a personal treasure chest of belongings — photos, a diary, a key — safely closing a glowing padlock, deciding what to share and what to keep private from curious robots peeking (your information is yours to control)",
  "a few enormous powerful robots holding giant glowing tools towering over a small group of regular kids looking up, a balance scale in the sky tipping (who holds the biggest, most powerful AI tools matters)",
  "a split friendly scene: on one side a flashlight lights a safe path home for a kid, on the other the same flashlight shines too brightly in a face; gentle road signs and guardrails along a winding road (tools, rules, and freedom — same tool, different choices)",
  "many diverse people of all ages and a few friendly robots gathered around a big round glowing table, hands reaching in together to steer a bright holographic globe of the future (everyone decides the future of AI together)",
  "an excited kid inventor at a workbench building their very own friendly AI helper from colorful glowing blocks, gears and a big heart, a lightbulb of curiosity above their head (you get to help build it — curiosity, judgment and kindness)",
  "a kid and a friendly robot celebrating on a gold winners' podium under falling confetti, holding up a glowing trophy shaped like the Earth, a banner of colorful round medals above (Module 2 complete — champion of AI and our world)"
];

async function gen(i) {
  const fp = join(OUT, "mission-" + (i + 1) + ".jpg");
  if (existsSync(fp)) { console.log("· mission-" + (i + 1) + ".jpg exists, skipping"); return; }
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt: STYLE + SCENES[i],
      n: 1, size: "1536x1024", quality: "medium", output_format: "jpeg"
    })
  });
  if (!r.ok) throw new Error("mission " + (i + 1) + ": " + r.status + " " + (await r.text()).slice(0, 160));
  const d = await r.json();
  const b64 = d?.data?.[0]?.b64_json;
  if (!b64) throw new Error("mission " + (i + 1) + ": no image");
  writeFileSync(fp, Buffer.from(b64, "base64"));
  try { execSync(`sips --resampleWidth 1200 "${fp}" >/dev/null 2>&1`); } catch {}
  console.log("✓ mission-" + (i + 1) + ".jpg  (" + SCENES[i].split("(")[1]);
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
