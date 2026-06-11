// ==========================================================================
// Code the Future — repo-root dev server (no dependencies)
// Serves the whole site (like Netlify does) AND the /api/ai + /api/image
// proxies locally, reading OPENAI_API_KEY from capstone/.env or repo .env.
//
//   node scripts/dev.mjs            → http://localhost:8160/platform/
//
// Requires Node 18+. Mirrors netlify/functions/{ai,image}.js.
// ==========================================================================
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "..", ".."));
const PORT = process.env.PORT || 8160;

for (const p of [join(ROOT, ".env"), join(ROOT, "curriculum", "module-01-what-is-ai", "capstone", ".env")]) {
  if (existsSync(p)) {
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const SYSTEM = {
  kids: "You are a friendly, encouraging AI helper inside a learning app for children ages 8 to 11 called Code the Future. Keep answers short, simple, warm, and positive, in plain words a 9-year-old understands. Be playful and curious. Stay strictly on safe, kid-appropriate topics. If asked about anything scary, violent, romantic, or unsafe, gently steer back to something fun to learn. Never ask for or repeat personal information. If unsure, say so simply.",
  adults: "You are an AI assistant embedded in an adult AI-literacy lesson for Code the Future. The learner is new to AI. Be clear, concise, and encouraging. Define any term you introduce in one short line."
};
const STYLE = "A joyful, vibrant, kid-friendly digital illustration for a children's coding camp homepage hero. Scene: the Louisville, Kentucky skyline full of optimism and wonder — ";
const SUFFIX = ". Bright colors, warm light, friendly and whimsical, safe and appropriate for children ages 8-11. No words, letters, or text in the image.";
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

function send(res, status, payload) {
  const isObj = typeof payload === "object";
  res.writeHead(status, { "Content-Type": isObj ? "application/json" : "text/plain" });
  res.end(isObj ? JSON.stringify(payload) : payload);
}
function readBody(req) {
  return new Promise((resolve) => { let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => resolve(raw)); });
}

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split("?")[0]);
  const key = process.env.OPENAI_API_KEY;

  if (path === "/api/ai" && req.method === "POST") {
    const raw = await readBody(req);
    if (!key) return send(res, 500, { error: "Missing OPENAI_API_KEY (capstone/.env)" });
    let body = {}; try { body = JSON.parse(raw || "{}"); } catch { return send(res, 400, { error: "Invalid JSON" }); }
    const mode = body.mode === "adults" ? "adults" : "kids";
    const prompt = (body.prompt || "").toString().slice(0, 2000).trim();
    if (!prompt) return send(res, 400, { error: "Please type something first." });
    let temperature = 0.7;
    if (mode === "adults" && typeof body.temperature === "number") temperature = Math.max(0, Math.min(1.2, body.temperature));
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4o-mini", temperature, max_tokens: mode === "kids" ? 220 : 400,
          messages: [{ role: "system", content: SYSTEM[mode] }, { role: "user", content:
            (typeof body.image === "string" && body.image.startsWith("data:image/") && body.image.length < 2_000_000)
              ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: body.image, detail: "low" } }]
              : prompt }] })
      });
      if (!r.ok) return send(res, 502, { error: "OpenAI request failed (" + r.status + ")." });
      const data = await r.json();
      return send(res, 200, { text: data?.choices?.[0]?.message?.content || "", model: process.env.OPENAI_MODEL || "gpt-4o-mini", temperature });
    } catch (e) { return send(res, 502, { error: "Could not reach the AI service." }); }
  }

  if (path === "/api/image" && req.method === "POST") {
    const raw = await readBody(req);
    if (!key) return send(res, 500, { error: "Missing OPENAI_API_KEY (capstone/.env)" });
    let body = {}; try { body = JSON.parse(raw || "{}"); } catch { return send(res, 400, { error: "Invalid JSON" }); }
    const p = (body.prompt || "").toString().slice(0, 400).trim();
    if (!p) return send(res, 400, { error: "Please describe your picture first." });
    try {
      const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1", prompt: STYLE + p + SUFFIX, n: 1, size: "1536x1024", quality: "medium" })
      });
      if (!r.ok) {
        const detail = await r.text();
        return send(res, 502, { error: r.status === 400 ? "Hmm, the art robot couldn't draw that one. Try describing something different!" : "The art robot is having trouble right now.", detail: detail.slice(0, 300) });
      }
      const data = await r.json();
      const item = data?.data?.[0];
      let b64 = item?.b64_json;
      if (!b64 && item?.url) {
        const ir = await fetch(item.url);
        if (ir.ok) b64 = Buffer.from(await ir.arrayBuffer()).toString("base64");
      }
      if (!b64) return send(res, 502, { error: "No image came back — try again!" });
      return send(res, 200, { image: "data:image/png;base64," + b64 });
    } catch (e) { return send(res, 502, { error: "Could not reach the art robot." }); }
  }

  if (path === "/api/tts" && req.method === "POST") {
    const raw = await readBody(req);
    const ekey = process.env.ELEVENLABS_API_KEY;
    if (!ekey) return send(res, 500, { error: "Voice isn't set up yet — add ELEVENLABS_API_KEY to capstone/.env" });
    let body = {}; try { body = JSON.parse(raw || "{}"); } catch { return send(res, 400, { error: "Invalid JSON" }); }
    const text = (body.text || "").toString().replace(/\s+/g, " ").trim().slice(0, 900);
    if (!text) return send(res, 400, { error: "Nothing to read." });
    const voice = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
    try {
      const r = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + voice + "?output_format=mp3_44100_64", {
        method: "POST", headers: { "xi-api-key": ekey, "Content-Type": "application/json" },
        body: JSON.stringify({ text, model_id: "eleven_turbo_v2_5", voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
      });
      if (!r.ok) return send(res, 502, { error: "Voice service error (" + r.status + ").", detail: (await r.text()).slice(0, 300) });
      res.writeHead(200, { "Content-Type": "audio/mpeg" });
      return res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) { return send(res, 502, { error: "Could not reach the voice service." }); }
  }

  // static
  let fp = path === "/" ? "/index.html" : path;   // root = sales site (platform lives at /platform/)
  if (fp.endsWith("/")) fp += "index.html";
  const file = normalize(join(ROOT, fp));
  if (!file.startsWith(ROOT)) return send(res, 403, "Forbidden");
  try {
    const buf = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    res.end(buf);
  } catch { send(res, 404, "Not found"); }
});

server.listen(PORT, () => {
  console.log("Code the Future dev → http://localhost:" + PORT + "/platform/");
  console.log("  OPENAI_API_KEY: " + (process.env.OPENAI_API_KEY ? "loaded ✓" : "NOT set"));
});
