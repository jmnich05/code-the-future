// ==========================================================================
// Code the Future — Module 4 Iteration Studio, the slow half.
//
// POST /api/studio-iterate-bg   { userId, ...same payload as studio-iterate }
//
// A real build ("add Flappy Bird to my art studio") can take well over a
// minute, and a normal Netlify function is cut off around 30 seconds — the
// browser then gets an HTML gateway-timeout page, res.json() throws, and the
// kid sees "check your internet" for something that had nothing to do with
// their internet.
//
// Netlify runs any function whose filename ends in -background for up to 15
// minutes, but it answers 202 immediately and can't return a value. So this
// writes the finished build into the kid's OWN widget_responses row, and
// their browser polls for it through the normal RLS-protected read. No new
// table, no new endpoint, and nobody can read anyone else's build.
// ==========================================================================

const SB = process.env.SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  "After the HTML document, output nothing at all.";

export default async (req) => {
  let b = {};
  try { b = await req.json(); } catch { return new Response("bad json", { status: 400 }); }

  const userId = str(b.userId, 64);
  const slug = str(b.project, 80);
  if (!userId || !slug) return new Response("missing user/project", { status: 400 });
  const jobKey = "m4job:" + slug;

  // Everything from here on reports through the job row, because the caller
  // has already been handed a 202 and is watching that row, not this response.
  try {
    const day = Math.max(1, Math.min(5, parseInt(b.day, 10) || 1));
    const dayTitle = str(b.dayTitle, 120);
    const name = str(b.name, 40) || "the builder";
    const repair = !!b.repair;
    const current = String(b.current == null ? "" : b.current).slice(0, 90000);
    const answers = Array.isArray(b.answers) ? b.answers.slice(0, 8).map(a => ({
      q: str(a && a.q, 200), a: str(a && a.a, 700)
    })).filter(a => a.a) : [];
    const features = Array.isArray(b.features)
      ? b.features.slice(0, 40).map(f => str(f, 160)).filter(Boolean) : [];

    if (!current) return await fail(userId, jobKey, day, "There was no version to improve.");
    if (!answers.length && !repair) return await fail(userId, jobKey, day, "Answer the questions first!");

    const key = process.env.OPENAI_API_KEY;
    if (!key) return await fail(userId, jobKey, day, "The Studio isn't switched on yet — tell Mr. Jon.");
    const model = process.env.OPENAI_ITERATE_MODEL || process.env.OPENAI_BUILD_MODEL ||
                  process.env.OPENAI_MODEL || "gpt-5.6-terra";

    const ask = repair
      ? [
          `${name}'s app came back broken and will not run. Fix it.`, ``,
          `What went wrong: ${str(b.problem, 500) || "the page threw an error or rendered nothing"}`, ``,
          `Repair the CURRENT VERSION below with the SMALLEST possible change. Do not add features, do not`,
          `restyle anything. Just make it run again, keeping every feature in the MUST KEEP list.`,
        ].join("\n")
      : [
          `This is DAY ${day} of 5 for ${name}. Today's theme: ${dayTitle || "improve the app"}.`, ``,
          `${name} answered these questions about what they want:`,
          ...answers.map((a, i) => `${i + 1}. ${a.q}\n   ${name} said: "${a.a}"`), ``,
          `Turn those answers into real changes in the app. If an answer is vague, make the smallest`,
          `sensible version of what they meant — do not invent a big feature they did not ask for.`,
        ].join("\n");

    const userMsg = [
      ask, ``,
      features.length
        ? `MUST KEEP WORKING (built on earlier days — do not break or remove any of these):\n` +
          features.map(f => `- ${f}`).join("\n")
        : `MUST KEEP WORKING: everything that already works today.`,
      ``, `CURRENT VERSION (edit this file):`, current,
    ].join("\n");

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userMsg }],
        max_completion_tokens: 32000,
      }),
    });
    const d = await r.json();
    if (!r.ok) return await fail(userId, jobKey, day, friendly(d));

    let html = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
    html = stripFences(html).trim();

    const problem = validate(html);
    if (problem) return await fail(userId, jobKey, day, "The build came back broken (" + problem + "). Try once more.", true);

    await put(userId, jobKey, { status: "done", day, html, model, at: new Date().toISOString() });
    return new Response("ok");
  } catch (e) {
    await fail(userId, jobKey, parseInt(b.day, 10) || 1, "The Studio hit a snag — try again in a moment.");
    return new Response("handled");
  }
};

// ---- job row helpers ------------------------------------------------------
async function put(userId, wid, response) {
  if (!SB || !SRK) return;
  await fetch(SB + "/rest/v1/widget_responses?on_conflict=user_id,widget_id", {
    method: "POST",
    headers: {
      apikey: SRK, Authorization: "Bearer " + SRK,
      "Content-Type": "application/json", Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      user_id: userId, widget_id: wid, response,
      module: "module-04-build-your-own", track: "kids", is_complete: false,
    }),
  });
}
async function fail(userId, wid, day, message, broken) {
  await put(userId, wid, { status: "error", day, error: message, broken: !!broken, at: new Date().toISOString() });
  return new Response("failed");
}

// ---- same guards as the synchronous version -------------------------------
function stripFences(s) {
  const m = s.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (m) s = m[1];
  const i = s.indexOf("<!DOCTYPE");
  return i > 0 ? s.slice(i) : s;
}
function validate(html) {
  if (!html || html.length < 400) return "too short";
  if (!/^<!DOCTYPE html>/i.test(html.trim())) return "not an HTML document";
  if (!/<\/html>\s*$/i.test(html.trim())) return "cut off before the end";
  if (!/<script[\s>]/i.test(html)) return "no script";
  // Only reject calls that actually reach the network. fetch() on a data: or
  // blob: URL is how you turn a canvas into a shareable/downloadable image —
  // entirely local, and banning it broke a kid's share button.
  if (/\b(XMLHttpRequest|WebSocket|importScripts)\s*\(/i.test(html)) return "tries to use the internet";
  if (/\bfetch\s*\(\s*['"`]\s*https?:/i.test(html)) return "tries to use the internet";
  if (/\b(fetch|axios)\s*\(\s*['"`]\/\//i.test(html)) return "tries to use the internet";
  if (/<script[^>]+\bsrc\s*=/i.test(html)) return "loads an outside script";
  if (/<link[^>]+href\s*=\s*["']https?:/i.test(html)) return "loads an outside stylesheet";
  const open = (html.match(/<script[\s>]/gi) || []).length;
  const close = (html.match(/<\/script>/gi) || []).length;
  if (open !== close) return "unbalanced script tags";
  return null;
}
function friendly(d) {
  const m = (d && d.error && d.error.message) || "";
  if (/quota|billing|insufficient/i.test(m)) return "The AI account needs topping up — tell Mr. Jon.";
  if (/model/i.test(m) && /not|exist|access/i.test(m)) return "That AI model isn't available on this key — tell Mr. Jon.";
  if (/rate/i.test(m)) return "The AI is busy right now — wait a few seconds and try again.";
  return "The Studio couldn't build that one — try again.";
}
function str(v, n) { return String(v == null ? "" : v).slice(0, n).trim(); }
