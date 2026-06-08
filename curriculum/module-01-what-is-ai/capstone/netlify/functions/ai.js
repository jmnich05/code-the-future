// ==========================================================================
// Code the Future — Module 1 Capstone · OpenAI proxy (Netlify Function)
//
// Keeps the OpenAI API key SERVER-SIDE. The browser calls /api/ai (redirected
// here by netlify.toml); the key lives only in Netlify env vars and never
// reaches the page. Set OPENAI_API_KEY in: Netlify → Site → Environment.
// Optional: OPENAI_MODEL (default gpt-4o-mini).
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

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: "Server is missing OPENAI_API_KEY. Add it in your host's environment variables." }, 500);

  let body = {};
  try { body = await req.json(); } catch (e) { return json({ error: "Invalid JSON body." }, 400); }

  const mode = body.mode === "adults" ? "adults" : "kids";
  const prompt = (body.prompt || "").toString().slice(0, 2000).trim();
  if (!prompt) return json({ error: "Please type something first." }, 400);

  // Temperature only honored for adults (the lesson dial); kids stay steady.
  let temperature = 0.7;
  if (mode === "adults" && typeof body.temperature === "number") {
    temperature = Math.max(0, Math.min(1.2, body.temperature));
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: MAX_TOKENS[mode],
        messages: [
          { role: "system", content: SYSTEM[mode] },
          { role: "user", content: prompt }
        ]
      })
    });

    if (!r.ok) {
      const detail = await r.text();
      return json({ error: "OpenAI request failed (" + r.status + ").", detail: detail.slice(0, 300) }, 502);
    }
    const data = await r.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    return json({ text: text, model, temperature });
  } catch (e) {
    return json({ error: "Could not reach the AI service.", detail: String(e).slice(0, 200) }, 502);
  }
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" }
  });
}
