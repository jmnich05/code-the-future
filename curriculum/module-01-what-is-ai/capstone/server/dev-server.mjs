// ==========================================================================
// Code the Future — Capstone local dev server (no dependencies)
//
// Serves the capstone static files AND the /api/ai proxy locally so you can
// test the whole thing with your own key — WITHOUT the key ever touching the
// browser or git.
//
//   1) Put your key in capstone/.env :   OPENAI_API_KEY=sk-...
//   2) node server/dev-server.mjs        (from the capstone/ folder)
//   3) open http://localhost:8788/kids-big-mission.html
//
// Requires Node 18+ (built-in fetch). Mirrors netlify/functions/ai.js.
// ==========================================================================
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "..", ".."));   // capstone/
const PORT = process.env.PORT || 8788;

// --- tiny .env loader (so we don't need dotenv) ---------------------------
for (const p of [join(ROOT, ".env"), join(ROOT, "..", "..", "..", ".env")]) {
  if (existsSync(p)) {
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const SYSTEM = {
  kids:
    "You are a friendly, encouraging AI helper inside a learning app for children ages 8 to 11 " +
    "called Code the Future. Keep answers short, simple, warm, and positive, in plain words a " +
    "9-year-old understands. Be playful and curious. Stay strictly on safe, kid-appropriate " +
    "topics: learning, science, space, animals, nature, art, stories, games, and how AI works. " +
    "If asked about anything scary, violent, romantic, or unsafe, gently steer back to something " +
    "fun to learn. Never ask for or repeat personal information. If unsure, say so simply.",
  adults:
    "You are an AI assistant embedded in an adult AI-literacy lesson (Module 1: What Is AI) for " +
    "Code the Future. The learner is new to AI. Be clear, concise, and encouraging. When natural, " +
    "briefly connect what you are doing to the ideas they just learned: learning from patterns, " +
    "attention, predicting the next token, and that confidence is not the same as correctness. " +
    "Define any term you introduce in one short line."
};
const MAX_TOKENS = { kids: 220, adults: 400 };
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

const server = createServer(async (req, res) => {
  // ---- API proxy ----
  if (req.url.split("?")[0] === "/api/ai" && req.method === "POST") {
    let raw = ""; req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return send(res, 500, { error: "Missing OPENAI_API_KEY. Put it in capstone/.env" });
      let body = {}; try { body = JSON.parse(raw || "{}"); } catch { return send(res, 400, { error: "Invalid JSON" }); }
      const mode = body.mode === "adults" ? "adults" : "kids";
      const prompt = (body.prompt || "").toString().slice(0, 2000).trim();
      if (!prompt) return send(res, 400, { error: "Please type something first." });
      let temperature = 0.7;
      if (mode === "adults" && typeof body.temperature === "number") temperature = Math.max(0, Math.min(1.2, body.temperature));
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      try {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
          body: JSON.stringify({ model, temperature, max_tokens: MAX_TOKENS[mode],
            messages: [{ role: "system", content: SYSTEM[mode] }, { role: "user", content: prompt }] })
        });
        if (!r.ok) return send(res, 502, { error: "OpenAI request failed (" + r.status + ").", detail: (await r.text()).slice(0, 300) });
        const data = await r.json();
        const text = data?.choices?.[0]?.message?.content || "";
        return send(res, 200, { text, model, temperature });
      } catch (e) { return send(res, 502, { error: "Could not reach the AI service.", detail: String(e).slice(0, 200) }); }
    });
    return;
  }

  // ---- static files ----
  let path = decodeURIComponent(req.url.split("?")[0]);
  if (path === "/") path = "/index.html";
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) return send(res, 403, "Forbidden");
  try {
    const buf = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    res.end(buf);
  } catch { send(res, 404, "Not found"); }
});

function send(res, status, payload) {
  const isObj = typeof payload === "object";
  res.writeHead(status, { "Content-Type": isObj ? "application/json" : "text/plain" });
  res.end(isObj ? JSON.stringify(payload) : payload);
}

server.listen(PORT, () => {
  const hasKey = !!process.env.OPENAI_API_KEY;
  console.log("Code the Future capstone → http://localhost:" + PORT);
  console.log("  kids   : http://localhost:" + PORT + "/kids-big-mission.html");
  console.log("  adults : http://localhost:" + PORT + "/adults-capstone.html");
  console.log(hasKey ? "  OPENAI_API_KEY: loaded ✓" : "  OPENAI_API_KEY: NOT set — add it to capstone/.env");
});
