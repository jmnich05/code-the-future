// ==========================================================================
// Generate 12 mission-opening artworks (gpt-image-1) → curriculum assets/art/
// Replaces the abstract SVGs with concrete, kid-readable scenes: you can tell
// what each mission is about just by looking. Landscape, picture-book style.
//   node scripts/gen-mission-art.mjs        (reads capstone/.env for the key)
// Re-run safe: skips files that already exist (delete a PNG to regenerate).
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

const OUT = join(ROOT, "curriculum", "module-01-what-is-ai", "assets", "art");
mkdirSync(OUT, { recursive: true });

const STYLE =
  "Warm children's picture-book illustration, flat modern vector style with soft texture, " +
  "bold rounded friendly shapes, palette of electric blue, teal, coral and golden amber on a soft cream background, " +
  "wide landscape composition with one clear focal scene, cute and optimistic, " +
  "absolutely no words, letters, numbers or text anywhere in the image. Scene: ";

// One concrete, self-explanatory scene per mission — a kid and a friendly
// little robot DOING the thing the mission teaches.
const SCENES = [
  "a diverse kid and a friendly small robot high-fiving in front of a half-built glowing futuristic city skyline, with a laptop, blueprints and building blocks around them (becoming builders together)",
  "a kid holding up big picture flashcards of a cat, an apple and a shoe to a curious robot whose head shows a glowing question mark turning into a lightbulb (showing examples so the machine can guess)",
  "a kid pointing happily at six very different dogs — huge fluffy, tiny spotted, long sausage dog — while a glowing thought bubble above the kid's head connects them all with sparkling lines (a brain finding the dog pattern)",
  "a small robot sitting at a school desk while a kid teacher shows it a tall stack of animal photo cards, gold stars floating where the robot guessed right and a gentle red X where it guessed wrong (training with lots of examples)",
  "a giant friendly robot eye looking at a picture of a cat that is breaking apart into big chunky colorful pixel squares, with a magnifying glass revealing the tiny squares up close (computers see pixels, not cats)",
  "a cozy robot reading a storybook out loud while colorful floating word-bubbles of different sizes hover ahead of the page and the robot reaches for the biggest closest bubble (guessing the next word)",
  "a robot detective holding a glowing flashlight that shines a bright spotlight beam on one single glowing item in a row of dim items on a long shelf (paying attention to what matters most)",
  "a kid's silhouette head with a colorful brain and a robot's head with a circuit-board brain facing each other, connected by strings of glowing lights with tiny sparks traveling along them (two kinds of brains talking)",
  "a winding road through time: starting at a giant room-sized vintage computer with spinning tape reels, passing a chunky desktop computer, ending at a kid holding a tiny glowing phone with a sparkle assistant, small flags marking stops along the road (the story of AI through time)",
  "a robot happily juggling chess pieces, photographs and puzzle cubes on one side, while on the other side it scratches its head confused in front of a crying kid holding a melted ice cream cone (great at patterns, bad at feelings)",
  "a kid captain and robot copilot standing at a glowing holographic control table steering toward a bright future city through a big window, stars outside (the future is yours to drive)",
  "a kid and a small robot celebrating on a gold winners' podium under falling confetti, the kid holding a trophy high while a banner of twelve colorful round medals hangs above them (mission complete champion)"
];

async function gen(i) {
  const fp = join(OUT, "mission-" + (i + 1) + ".png");
  if (existsSync(fp)) { console.log("· mission-" + (i + 1) + " exists, skipping"); return; }
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt: STYLE + SCENES[i],
      n: 1, size: "1536x1024", quality: "medium", output_format: "png"
    })
  });
  if (!r.ok) throw new Error("mission " + (i + 1) + ": " + r.status + " " + (await r.text()).slice(0, 160));
  const d = await r.json();
  const b64 = d?.data?.[0]?.b64_json;
  if (!b64) throw new Error("mission " + (i + 1) + ": no image");
  writeFileSync(fp, Buffer.from(b64, "base64"));
  try { execSync(`sips --resampleWidth 1024 "${fp}" >/dev/null 2>&1`); } catch {}
  console.log("✓ mission-" + (i + 1) + ".png");
}

const queue = [...SCENES.keys()];
const workers = Array.from({ length: 1 }, async () => {
  while (queue.length) {
    const i = queue.shift();
    try { await gen(i); } catch (e) { console.error("✗", e.message); queue.push(i); await new Promise(r => setTimeout(r, 30000)); }
    await new Promise(r => setTimeout(r, 12000));
  }
});
await Promise.all(workers);
console.log("done");
