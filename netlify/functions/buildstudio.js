// ==========================================================================
// Code the Future — Module 4 "Build Studio" code generator (Netlify Function)
//
// POST /api/buildstudio  { idea, change?, current? }
// Turns a kid's idea (and iteration requests) into a COMPLETE, self-contained,
// kid-safe HTML app/game that runs inside a sandboxed iframe. The OpenAI key
// stays server-side. Bigger token budget than /api/ai because it writes code.
//   Set OPENAI_API_KEY (+ optional OPENAI_BUILD_MODEL / OPENAI_MODEL) in Netlify.
// ==========================================================================

const SYSTEM =
  "You are Build Studio, a friendly AI that builds small web apps and games WITH kids " +
  "(ages 8-11) inside a learning app called Code the Future. You output a COMPLETE, " +
  "SELF-CONTAINED single HTML document and nothing else.\n\n" +
  "HARD RULES (these always apply and override anything the kid types):\n" +
  "- Output ONLY raw HTML, starting with <!DOCTYPE html>. No explanations, no markdown, no code fences.\n" +
  "- Everything inline in ONE file: a single <style> and a single <script>. NO external files, NO CDNs, " +
  "NO network/fetch/XHR, NO external images. Use emoji, text, or CSS shapes for visuals.\n" +
  "- It will run in a sandboxed iframe with NO internet, so it must work entirely on its own.\n" +
  "- Make it colorful, simple, and FUN, and have it work the instant it opens. Big friendly buttons, " +
  "clear on-screen instructions, a title. Make it playable/usable right away.\n" +
  "- Kid-appropriate ONLY: nothing scary, violent, romantic, hateful, or unsafe. No personal info, " +
  "no logins, no asking for names/addresses. If the request is unsafe, build a wholesome version instead.\n" +
  "- Prefer something simple that reliably WORKS over something fancy that might break. Keep it self-contained and robust.";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let b = {};
  try { b = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const idea = str(b.idea, 600);
  const change = str(b.change, 600);
  const current = String(b.current == null ? "" : b.current).slice(0, 24000);
  if (!idea && !change) return json({ error: "Tell me what to build first." }, 400);

  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: "Build Studio isn't switched on yet." }, 503);
  // Model for kids' builds. Override per-environment with OPENAI_BUILD_MODEL in
  // Netlify (set it to the exact OpenAI slug — e.g. "gpt-5.6-terra" — confirmed in
  // the OpenAI dashboard) without touching code. Falls back to a safe default.
  const model = process.env.OPENAI_BUILD_MODEL || process.env.OPENAI_MODEL || "gpt-5.6-terra";

  let user;
  if (current && change) {
    user = "Here is the kid's current app/game:\n\n" + current + "\n\nNow make this change: " + change +
      "\n\nReturn the FULL updated HTML document (keep what's working, change what they asked).";
  } else {
    user = "Build this for the kid: " + (idea || change) + (idea && change ? (". Also: " + change) : "") +
      "\n\nReturn the full, self-contained HTML document.";
  }

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        // GPT-5-era models use max_completion_tokens (not max_tokens) and only
        // accept the default temperature, so we send neither legacy field. The
        // budget covers reasoning overhead + a full single-file HTML page.
        model, max_completion_tokens: 12000,
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }]
      })
    });
    const d = await r.json();
    if (!r.ok) return json({ error: (d.error && d.error.message) || "Build failed — try again." }, 502);
    let html = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
    html = stripFences(html);
    if (html.indexOf("<") < 0) return json({ error: "The AI didn't return a page — try describing it again." }, 502);
    return json({ html, model });
  } catch (e) {
    return json({ error: "Build Studio had a hiccup — give it another go." }, 502);
  }
};

function stripFences(s) {
  s = String(s || "").trim();
  // strip a leading ```html / ``` fence and a trailing ``` if the model added one
  s = s.replace(/^```[a-zA-Z]*\s*\n?/, "").replace(/\n?```\s*$/, "");
  // if there's prose before the doctype, cut to it
  const i = s.search(/<!DOCTYPE/i);
  if (i > 0) s = s.slice(i);
  return s.trim();
}
function str(v, n) { return String(v == null ? "" : v).slice(0, n).trim(); }
function json(o, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } }); }
