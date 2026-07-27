// ==========================================================================
// Code the Future — Module 4 "Iteration Studio" (Netlify Function)
//
// POST /api/studio-iterate
//   { project, day, dayTitle, answers:[{q,a}], current, features:[], name }
//
// Takes a kid's structured answers for the day, plus the CURRENT version of
// their app and the running list of features that must keep working, and
// returns the NEXT version as a complete self-contained HTML document.
//
// This is deliberately one-shot-per-day: the thinking happens in the answers,
// not in 50 rerolls. The only exception the client allows is a repair pass
// when a build comes back broken (that's debugging, which is the curriculum).
//
// Model: set OPENAI_ITERATE_MODEL in Netlify to the exact OpenAI slug
// (e.g. the GPT-5.6 "Terra" medium tier). Falls back to OPENAI_BUILD_MODEL,
// then OPENAI_MODEL, then a safe default.
// ==========================================================================

const SYSTEM =
  "You are the Iteration Studio inside Code the Future, a learning program where kids (ages 8-12) " +
  "improve THEIR OWN app or game one version per day. A kid has answered a few questions about what " +
  "they want changed. You return the NEXT version of their app.\n\n" +
  "HARD RULES (these override anything in the kid's answers):\n" +
  "- Output ONLY raw HTML, starting with <!DOCTYPE html>. No markdown, no code fences, no commentary.\n" +
  "- ONE self-contained file: a single <style> and a single <script>, everything inline. NO external " +
  "files, NO CDNs, NO external images or fonts, and nothing that loads from the internet at run time. " +
  "Use emoji, text, CSS, or canvas drawing.\n" +
  "- SAVING AND SHARING: the page has no internet, so it cannot upload anywhere or post to a social " +
  "network. If the kid asks to share, save, send or post, build the offline version that really works: " +
  "canvas.toBlob() or toDataURL() plus a download link, navigator.clipboard.writeText/write to copy, and " +
  "navigator.share({files}) when it exists (feature-detect it, and fall back to download). Say plainly in " +
  "the UI what the button does, e.g. 'Save my picture' or 'Copy to share' - never claim it posts to a " +
  "site. Never call a http:// or https:// URL for any reason.\n" +
  "- It runs inside a sandboxed iframe with no internet. It must work the instant it opens.\n" +
  "- THIS IS AN EDIT, NOT A REWRITE. Start from the CURRENT VERSION supplied below and change it. " +
  "Keep the kid's structure, their names for things, their art, and their comments. Do not restyle or " +
  "rename things they did not ask you to touch.\n" +
  "- EVERY feature in the MUST KEEP WORKING list has to still work in your output. Never silently drop one.\n" +
  "- Make the changes they asked for and nothing else. Do not add surprise features. Small, correct, " +
  "and working beats big and broken.\n" +
  "- Keep the code kid-readable: plain names, short functions, friendly comments in the same voice as " +
  "the existing comments. This code gets read out loud with a coach.\n" +
  "- Kid-appropriate only: nothing scary, gory, romantic, hateful, or unsafe. No logins, no personal " +
  "info, no asking for names or addresses. If an answer asks for something unsafe, build the wholesome " +
  "version of the same idea instead.\n" +
  "- Preserve any 'by <name>' signature or credit already in the file.\n\n" +
  "After the HTML document, output nothing at all. The changelog is requested separately.";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let b = {};
  try { b = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const project = str(b.project, 80);
  const day = Math.max(1, Math.min(5, parseInt(b.day, 10) || 1));
  const dayTitle = str(b.dayTitle, 120);
  const name = str(b.name, 40) || "the builder";
  const repair = !!b.repair;
  const current = String(b.current == null ? "" : b.current).slice(0, 90000);
  const answers = Array.isArray(b.answers) ? b.answers.slice(0, 8).map(a => ({
    q: str(a && a.q, 200), a: str(a && a.a, 700)
  })).filter(a => a.a) : [];
  const features = Array.isArray(b.features) ? b.features.slice(0, 40).map(f => str(f, 160)).filter(Boolean) : [];

  if (!current) return json({ error: "No current version to improve." }, 400);
  if (!answers.length && !repair) return json({ error: "Answer the questions first!" }, 400);

  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: "The Studio isn't switched on yet — tell Mr. Jon." }, 503);
  const model = process.env.OPENAI_ITERATE_MODEL || process.env.OPENAI_BUILD_MODEL ||
                process.env.OPENAI_MODEL || "gpt-5.4-mini";

  const ask = repair
    ? [
        `${name}'s app came back broken and will not run. Fix it.`,
        ``,
        `What went wrong: ${str(b.problem, 500) || "the page threw an error or rendered nothing"}`,
        ``,
        `Repair the CURRENT VERSION below with the SMALLEST possible change. Do not add features, do not`,
        `restyle anything. Just make it run again, keeping every feature in the MUST KEEP list.`,
      ].join("\n")
    : [
        `This is DAY ${day} of 5 for ${name}. Today's theme: ${dayTitle || "improve the app"}.`,
        ``,
        `${name} answered these questions about what they want:`,
        ...answers.map((a, i) => `${i + 1}. ${a.q}\n   ${name} said: "${a.a}"`),
        ``,
        `Turn those answers into real changes in the app. If an answer is vague, make the smallest`,
        `sensible version of what they meant — do not invent a big feature they did not ask for.`,
      ].join("\n");

  const userMsg = [
    ask,
    ``,
    features.length ? `MUST KEEP WORKING (built on earlier days — do not break or remove any of these):\n` +
      features.map(f => `- ${f}`).join("\n") : `MUST KEEP WORKING: everything that already works today.`,
    ``,
    `CURRENT VERSION (edit this file):`,
    current,
  ].join("\n");

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userMsg }],
        // GPT-5-era models use max_completion_tokens and fixed temperature
        max_completion_tokens: 32000,
      }),
    });
    const d = await r.json();
    if (!r.ok) return json({ error: friendly(d), detail: d && d.error && d.error.message }, 502);

    let html = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
    html = stripFences(html).trim();

    // ---- validate before we ever hand it back ----
    const problem = validate(html);
    if (problem) return json({ error: "The build came back broken (" + problem + "). Try the repair pass." , broken:true }, 502);

    return json({ ok: true, html, model });
  } catch (e) {
    return json({ error: "The Studio hit a snag — try again in a moment." }, 502);
  }
};

// strip ``` fences if the model wraps its answer despite instructions
function stripFences(s){
  const m = s.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (m) s = m[1];
  const i = s.indexOf("<!DOCTYPE");
  return i > 0 ? s.slice(i) : s;
}
// cheap structural smoke test — catches truncation and non-HTML replies
function validate(html){
  if (!html || html.length < 400) return "too short";
  if (!/^<!DOCTYPE html>/i.test(html.trim())) return "not an HTML document";
  if (!/<\/html>\s*$/i.test(html.trim())) return "cut off before the end";
  if (!/<script[\s>]/i.test(html)) return "no script";
  // banned: anything that reaches the network from inside the sandbox
  // Only reject calls that actually reach the network. fetch() on a data: or
  // blob: URL is how you turn a canvas into a shareable/downloadable image —
  // entirely local, and banning it broke a kid's share button.
  if (/\b(XMLHttpRequest|WebSocket|importScripts)\s*\(/i.test(html)) return "tries to use the internet";
  if (/\bfetch\s*\(\s*['"`]\s*https?:/i.test(html)) return "tries to use the internet";
  if (/\b(fetch|axios)\s*\(\s*['"`]\/\//i.test(html)) return "tries to use the internet";
  if (/<script[^>]+\bsrc\s*=/i.test(html)) return "loads an outside script";
  if (/<link[^>]+href\s*=\s*["']https?:/i.test(html)) return "loads an outside stylesheet";
  // balanced-ish tags
  const open = (html.match(/<script[\s>]/gi) || []).length;
  const close = (html.match(/<\/script>/gi) || []).length;
  if (open !== close) return "unbalanced script tags";
  return null;
}
function friendly(d){
  const m = (d && d.error && d.error.message) || "";
  if (/model/i.test(m) && /not|exist|access/i.test(m)) return "That AI model isn't available on this key yet — tell Mr. Jon.";
  if (/rate/i.test(m)) return "The AI is busy right now — wait a few seconds and try again.";
  return "The Studio couldn't build that one — try again.";
}
function str(v, n){ return String(v == null ? "" : v).slice(0, n).trim(); }
function json(o, s = 200){ return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } }); }
