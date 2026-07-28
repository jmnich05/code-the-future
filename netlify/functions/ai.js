// ==========================================================================
// Code the Future — Module 1 Capstone · OpenAI proxy (Netlify Function)
//
// Keeps the OpenAI API key SERVER-SIDE. The browser calls /api/ai (redirected
// here by netlify.toml); the key lives only in Netlify env vars and never
// reaches the page. Set OPENAI_API_KEY in: Netlify -> Site -> Environment.
// Optional: OPENAI_MODEL (default gpt-5.6-terra).
//
// v2 — added structured logging + automatic retry (up to 2 retries w/ backoff)
// ==========================================================================
const SYSTEM = {
  kids:
    "You are a friendly, encouraging AI helper inside a learning app for children ages " +
    "8 to 11 called Code the Future. Keep answers short, simple, warm, and positive, in " +
    "plain words a 9-year-old understands. Be playful and curious. Stay strictly on safe, " +
    "kid-appropriate topics: learning, science, space, animals, nature, art, stories, " +
    "games, and how AI works. If asked about anything scary, violent, romantic, or unsafe, " +
    "gently steer back to something fun to learn. Never ask for or repeat personal " +
    "information (names, addresses, passwords). If you are unsure, say so simply.",
  adults:
    "You are an AI assistant embedded in an adult AI-literacy lesson (Module 1: What Is AI) " +
    "for Code the Future. The learner is new to AI. Be clear, concise, and encouraging. " +
    "When natural, briefly connect what you are doing to the ideas they just learned: " +
    "learning from patterns, attention, predicting the next token, and that confidence is " +
    "not the same as correctness. Define any term you introduce in one short line."
};
const MAX_TOKENS = { kids: 220, adults: 400 };
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 2000];

export default async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    log(requestId, "error", "OPENAI_API_KEY missing from env");
    return json({ error: "Server is missing OPENAI_API_KEY." }, 500);
  }

  let body = {};
  try { body = await req.json(); } catch (e) { return json({ error: "Invalid JSON body." }, 400); }

  const mode = body.mode === "adults" ? "adults" : "kids";
  const prompt = (body.prompt || "").toString().slice(0, 2000).trim();
  if (!prompt) return json({ error: "Please type something first." }, 400);

  let temperature = 0.7;
  if (mode === "adults" && typeof body.temperature === "number") {
    temperature = Math.max(0, Math.min(1.2, body.temperature));
  }

  const model = process.env.OPENAI_MODEL || "gpt-5.6-terra";

  log(requestId, "info", "Chat request received", {
    model, mode, promptLength: prompt.length, temperature
  });

  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1] || 2000;
      log(requestId, "warn", `Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms`, {
        previousError: lastError
      });
      await sleep(delay);
    }

    try {
      const attemptStart = Date.now();
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({
          model, temperature,
          max_tokens: MAX_TOKENS[mode],
          messages: [
            { role: "system", content: SYSTEM[mode] },
            { role: "user", content: userContent(prompt, body.image) }
          ]
        })
      });

      const latencyMs = Date.now() - attemptStart;

      if (!r.ok) {
        const detail = await r.text().catch(() => "(no body)");
        lastError = `OpenAI ${r.status}: ${detail.slice(0, 300)}`;
        log(requestId, "error", "OpenAI API error", {
          attempt, status: r.status, latencyMs, detail: detail.slice(0, 300)
        });
        if (r.status >= 400 && r.status < 500) {
          return json({ error: "AI request failed (" + r.status + ").", detail: detail.slice(0, 200) }, 502);
        }
        continue;
      }

      const data = await r.json();
      const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";

      log(requestId, "info", "Chat succeeded", {
        attempt, model, latencyMs, totalMs: Date.now() - startTime,
        responseLength: text.length,
        finishReason: data.choices[0].finish_reason,
        tokensUsed: data.usage ? data.usage.total_tokens : "unknown"
      });

      return json({ text, model, temperature });

    } catch (e) {
      lastError = String(e).slice(0, 200);
      log(requestId, "error", "Network/fetch error", {
        attempt, error: lastError, latencyMs: Date.now() - startTime
      });
      continue;
    }
  }

  log(requestId, "error", "All retries exhausted", {
    totalMs: Date.now() - startTime, lastError, model
  });
  return json({
    error: "Could not reach the AI service — please try again in a moment.",
    requestId
  }, 502);
};

function log(requestId, level, message, data = {}) {
  const entry = { timestamp: new Date().toISOString(), requestId, level, message, ...data };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function userContent(prompt, image) {
  if (typeof image === "string" && image.startsWith("data:image/") && image.length < 2_000_000) {
    return [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: image, detail: "low" } }
    ];
  }
  return prompt;
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" }
  });
}
