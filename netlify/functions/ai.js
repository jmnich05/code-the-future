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
  ,musicriff:
    "You generate beat patterns for a kids' music-making app (ages 8-11). The kid gives a " +
    "vibe; you reply with ONLY minified JSON on one line, no markdown, no explanation: " +
    '{"name":"...","emoji":"🎵","drums":{"kick":[16],"snare":[16],"hat":[16],"clap":[16]},"melody":[16]} ' +
    "Each drums array is exactly 16 entries of 0 or 1 (one bar of 16th notes). melody is " +
    "exactly 16 integers from -1 to 7 (-1 = rest, 0 = low note up to 7 = high note). Make it " +
    "GROOVE: kick anchors beats 1/5/9/13-ish, hats keep time, snare on 5 and 13 or a fun " +
    "variation, melody catchy with some rests. Match the kid's vibe (spooky = sparse minor " +
    "feel, party = busy and bright). name is a fun kid-safe title under 24 characters that " +
    "matches their vibe; emoji is one matching kid-safe emoji."
};
const MAX_TOKENS = { kids: 220, adults: 400, musicriff: 300 };

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: "Server is missing OPENAI_API_KEY. Add it in your host's environment variables." }, 500);

  let body = {};
  try { body = await req.json(); } catch (e) { return json({ error: "Invalid JSON body." }, 400); }

  const mode = ["adults","musicriff"].indexOf(body.mode) > -1 ? body.mode : "kids";
  const prompt = (body.prompt || "").toString().slice(0, 2000).trim();
  if (!prompt) return json({ error: "Please type something first." }, 400);

  // Temperature only honored for adults (the lesson dial); kids stay steady.
  let temperature = 0.7;
  if (mode === "musicriff") temperature = 0.9;   // variety between riffs
  if (mode === "adults" && typeof body.temperature === "number") {
    temperature = Math.max(0, Math.min(1.2, body.temperature));
  }

  const model = process.env.OPENAI_MODEL || "gpt-5.6-terra";

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
          { role: "user", content: userContent(prompt, body.image) }
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

// optional vision: body.image = data URL (e.g. a kid's canvas drawing)
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
