// ==========================================================================
// Code the Future — The Bad AI Challenge (in-person session tool)
//
// POST /api/badai { round: 1|2|3, prompt: "..." }  →  text/plain STREAM
//
// Powers the projector demo where kids watch a real model respond live:
//   Round 1 — deliberately generic (vague prompt in, bland idea out)
//   Round 2 — the group rewrite: quality tracks the details given
//   Round 3 — the team prompt: full glow-up treatment
//
// The model streams a THINKING block first (design notes the room can watch),
// then `---`, then the RESULT. The page renders the two parts differently.
// Kid-safe guardrails are server-side so the projector can never surprise us.
// Same key/model env as the build studio: OPENAI_API_KEY, OPENAI_BUILD_MODEL.
// ==========================================================================

const SAFE =
  "You are presenting live on a projector to children ages 8-11 at a coding camp " +
  "called Code the Future in Louisville. Everything you write is read aloud to kids. " +
  "Strictly kid-safe: no violence beyond cartoon silliness, nothing scary, romantic, " +
  "or inappropriate; no brand names; never ask for personal information. If the prompt " +
  "requests anything unsafe, cheerfully redesign it into something kid-friendly instead. " +
  "ALWAYS answer in exactly this shape:\n" +
  "First a section starting with the line 'THINKING' — 4 to 6 short first-person design " +
  "thoughts, one per line, each starting with '• ' (like someone planning out loud: what " +
  "was asked, what's missing or given, what I'll pick and why).\n" +
  "Then a line containing only '---'.\n" +
  "Then the RESULT.";

const ROUNDS = {
  1:
    SAFE +
    "\nThis is ROUND 1: THE TERRIBLE PROMPT. The kids gave a vague prompt on purpose. " +
    "Your THINKING should notice how little you were told (what kind? for whom? what goal?) " +
    "and shrug — you'll have to guess the most ordinary thing. The RESULT must be " +
    "deliberately GENERIC and forgettable: the most average, obvious idea possible, " +
    "described in 4-6 plain sentences. No title, no characters with names, no sparkle, " +
    "no surprises, no lists. Competent but boring — that's the whole lesson.",
  2:
    SAFE +
    "\nThis is ROUND 2: THE GROUP REWRITE. The kids improved the prompt together. Your " +
    "THINKING should call out each specific detail they gave you and how it shapes the " +
    "design. The RESULT should be noticeably better than a generic answer — give it a " +
    "short TITLE line, a one-sentence hook, then 3-5 tight bullet points that USE EVERY " +
    "detail from the prompt. If details are still missing, pick something reasonable and " +
    "note it in THINKING. Under 180 words. The quality must visibly track the detail " +
    "level: a barely-improved prompt earns only a slightly-improved answer.",
  3:
    SAFE +
    "\nThis is ROUND 3: THE TEAM PROMPT — the finale. The kids wrote a detailed prompt " +
    "with characters, setting, goals, and style. Your THINKING should celebrate what a " +
    "designer can do with this much direction (reference their specific choices). The " +
    "RESULT is the full glow-up, under 230 words: a TITLE line, a one-sentence pitch, " +
    "THE HERO, THE WORLD, HOW IT PLAYS (3 beats), ONE SURPRISE TWIST that builds on " +
    "their idea (never replaces it), and FIRST THING WE'D BUILD (one concrete step). " +
    "Make their idea feel amazing — it is THEIR idea, you just organized it."
};

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: "Server is missing OPENAI_API_KEY." }, 500);

  let body = {};
  try { body = await req.json(); } catch (e) { return json({ error: "Invalid JSON body." }, 400); }
  const round = [1, 2, 3].includes(+body.round) ? +body.round : 1;
  const prompt = (body.prompt || "").toString().slice(0, 1500).trim();
  if (!prompt) return json({ error: "Type the kids' prompt first." }, 400);

  const model = process.env.OPENAI_BUILD_MODEL || process.env.OPENAI_MODEL || "gpt-5.4-mini";

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      max_completion_tokens: 1200,
      messages: [
        { role: "system", content: ROUNDS[round] },
        { role: "user", content: prompt }
      ]
    })
  });
  if (!upstream.ok) {
    const detail = await upstream.text();
    return json({ error: "AI service error (" + upstream.status + ").", detail: detail.slice(0, 300) }, 502);
  }

  // Re-stream OpenAI's SSE as plain text tokens the page can render directly.
  const decoder = new TextDecoder(), encoder = new TextEncoder();
  let buf = "";
  const out = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop();
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const payload = t.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch (e) {}
          }
        }
      } catch (e) {}
      controller.close();
    }
  });
  return new Response(out, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Model": model }
  });
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json" } });
}
