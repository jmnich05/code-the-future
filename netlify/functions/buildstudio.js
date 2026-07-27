// ==========================================================================
// Code the Future — Module 4 "Build Studio" code generator (Netlify Function)
//
// POST /api/buildstudio  { idea, change?, current? }
// Turns a kid's idea (and iteration requests) into a COMPLETE, self-contained,
// kid-safe HTML app/game that runs inside a sandboxed iframe. The OpenAI key
// stays server-side. Bigger token budget than /api/ai because it writes code.
//   Set OPENAI_API_KEY (+ optional OPENAI_BUILD_MODEL / OPENAI_MODEL) in Netlify.
//
// v2 — added structured logging + automatic retry (up to 2 retries w/ backoff)
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

const MAX_RETRIES = 2;
const RETRY_DELAYS = [1500, 3000]; // ms backoff per retry

export default async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let b = {};
  try { b = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const idea = str(b.idea, 600);
  const change = str(b.change, 600);
  const current = String(b.current == null ? "" : b.current).slice(0, 24000);
  if (!idea && !change) return json({ error: "Tell me what to build first." }, 400);

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    log(requestId, "error", "OPENAI_API_KEY missing from env");
    return json({ error: "Build Studio isn't switched on yet." }, 503);
  }

  const model = process.env.OPENAI_BUILD_MODEL || process.env.OPENAI_MODEL || "gpt-5.6-terra";

  let user;
  if (current && change) {
    user = "Here is the kid's current app/game:\n\n" + current + "\n\nNow make this change: " + change +
      "\n\nReturn the FULL updated HTML document (keep what's working, change what they asked).";
  } else {
    user = "Build this for the kid: " + (idea || change) + (idea && change ? (". Also: " + change) : "") +
      "\n\nReturn the full, self-contained HTML document.";
  }

  log(requestId, "info", "Build request received", {
    model,
    ideaLength: idea.length,
    changeLength: change.length,
    hasCurrentCode: current.length > 0,
    currentCodeLength: current.length
  });

  // Retry loop
  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1] || 3000;
      log(requestId, "warn", `Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms`, {
        previousError: lastError
      });
      await sleep(delay);
    }

    try {
      const attemptStart = Date.now();
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({
          model, max_completion_tokens: 12000,
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }]
        })
      });

      const latencyMs = Date.now() - attemptStart;

      if (!r.ok) {
        const detail = await r.text().catch(() => "(no body)");
        lastError = `OpenAI ${r.status}: ${detail.slice(0, 300)}`;
        log(requestId, "error", "OpenAI API error", {
          attempt,
          status: r.status,
          latencyMs,
          detail: detail.slice(0, 300)
        });

        // Don't retry on 4xx (client errors like bad API key, invalid model)
        if (r.status >= 400 && r.status < 500) {
          return json({ error: "Build failed — configuration error. Please contact your teacher.", detail: detail.slice(0, 200) }, 502);
        }
        continue; // retry on 5xx
      }

      const d = await r.json();
      let html = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
      html = stripFences(html);

      if (html.indexOf("<") < 0) {
        lastError = "AI returned non-HTML content";
        log(requestId, "warn", "AI response contained no HTML", {
          attempt,
          latencyMs,
          responsePreview: html.slice(0, 200)
        });
        continue; // retry
      }

      const totalMs = Date.now() - startTime;
      log(requestId, "info", "Build succeeded", {
        attempt,
        model,
        latencyMs,
        totalMs,
        htmlLength: html.length,
        finishReason: d.choices[0].finish_reason,
        tokensUsed: d.usage ? d.usage.total_tokens : "unknown"
      });

      return json({ html, model });

    } catch (e) {
      lastError = String(e).slice(0, 200);
      log(requestId, "error", "Network/fetch error", {
        attempt,
        error: lastError,
        latencyMs: Date.now() - startTime
      });
      continue; // retry
    }
  }

  // All retries exhausted
  const totalMs = Date.now() - startTime;
  log(requestId, "error", "All retries exhausted", {
    totalMs,
    lastError,
    model,
    idea: idea.slice(0, 100)
  });
  return json({
    error: "Build Studio had trouble connecting — please try again in a moment.",
    requestId
  }, 502);
};

// ── Helpers ──────────────────────────────────────────────────────────────

function log(requestId, level, message, data = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    requestId,
    level,
    message,
    ...data
  };
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else if (level === "warn") {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stripFences(s) {
  s = String(s || "").trim();
  s = s.replace(/^\`\`\`[a-zA-Z]*\s*\n?/, "").replace(/\n?\`\`\`\s*$/, "");
  const i = s.search(/<!DOCTYPE/i);
  if (i > 0) s = s.slice(i);
  return s.trim();
}

function str(v, n) { return String(v == null ? "" : v).slice(0, n).trim(); }
function json(o, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } }); }
