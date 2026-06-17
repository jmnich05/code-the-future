/* ==========================================================================
   Code the Future — Build Lab · shared realtime + AI helper
   Cross-device sync via Supabase Realtime BROADCAST (no tables needed).
   One channel per session code; the big screen is the source of truth.
   ========================================================================== */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(window.CTF_SUPABASE_URL, window.CTF_SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

// Join a lab channel. onMsg(payload) fires for every broadcast from OTHER clients.
export function joinLab(code, onMsg, onReady) {
  const ch = sb.channel("buildlab:" + code, { config: { broadcast: { self: false } } });
  ch.on("broadcast", { event: "msg" }, function (e) { onMsg(e.payload); });
  ch.subscribe(function (status) { if (status === "SUBSCRIBED" && onReady) onReady(); });
  return {
    send: function (payload) { ch.send({ type: "broadcast", event: "msg", payload: payload }); },
    leave: function () { sb.removeChannel(ch); }
  };
}

// Call the real AI (the existing /api/ai proxy). Works when deployed; locally it
// returns a friendly mock so the flow is still demoable on a plain file server.
export async function runAI(promptText) {
  try {
    const r = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "kids", prompt: promptText })
    });
    if (!r.ok) {
      const e = await r.json().catch(function () { return {}; });
      throw new Error(e.error || ("AI error " + r.status));
    }
    const d = await r.json();
    return d.text || "(the AI didn't say anything)";
  } catch (err) {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      return "[local preview — deploy to talk to the real AI] I'm your class AI! I only know what you taught me so far.";
    }
    throw err;
  }
}

// Preferred: the dedicated /api/buildlab endpoint — structured input, a fixed
// kid-safe system preamble, and a bigger knowledge base than /api/ai allows.
// Falls back to a friendly mock on localhost (no Netlify function there).
export async function runBuildLab(state, question) {
  const payload = {
    name: state.name, topic: state.topic, personality: state.personality,
    rules: (state.rules || []).map(function (r) { return r.text; }),
    facts: (state.facts || []).map(function (f) { return f.text; }),
    question: question
  };
  try {
    const r = await fetch("/api/buildlab", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    if (!r.ok) { const e = await r.json().catch(function () { return {}; }); throw new Error(e.error || ("AI error " + r.status)); }
    const d = await r.json();
    return d.text || "(the AI didn't say anything)";
  } catch (err) {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      return "[local preview — deploy to talk to the real AI] Hi! I'm " + (state.name || "your class AI") +
        ". I only know the " + ((state.facts || []).length) + " facts you taught me so far!";
    }
    throw err;
  }
}

// ---- persistence: one state blob per code, so a big-screen reload restores ----
export async function saveState(code, state) {
  try { await sb.from("buildlab_sessions").upsert({ code: code, state: state, updated_at: new Date().toISOString() }); }
  catch (e) { /* prototype: persistence is best-effort */ }
}
export async function loadState(code) {
  try {
    const { data } = await sb.from("buildlab_sessions").select("state").eq("code", code).maybeSingle();
    return data ? data.state : null;
  } catch (e) { return null; }
}

// Legacy single-field assembly (kept for the /api/ai fallback path).
export function buildPrompt(state, question) {
  const facts = (state.facts || []).map(function (f) { return "- " + f.text; });
  let factBlock = "", i = 0;
  for (; i < facts.length; i++) {
    if ((factBlock + facts[i]).length > 1200) break;
    factBlock += facts[i] + "\n";
  }
  const rules = (state.rules || []).map(function (r) { return r.text; });
  return (
    'You ARE an AI named "' + (state.name || "Sparky") + '" that a class of kids built.\n' +
    "You are an expert on " + (state.topic || "fun facts") + ". Your personality: " + (state.personality || "friendly and curious") + ".\n" +
    "Rules you must follow: " + (rules.join("; ") || "be kind and honest") + ".\n" +
    "Here is everything your class has taught you so far — use ONLY these facts, and if the answer isn't here, cheerfully say you haven't been taught that yet:\n" +
    (factBlock || "(nothing yet!)") + "\n" +
    'A kid in the class asks: "' + question + '"\n' +
    "Answer in character, in 1–3 short, kid-friendly sentences."
  );
}

export function filterClean(t) {
  return window.CTFFilter ? window.CTFFilter.isClean(t) : true;
}

// short, kid-readable session code (no confusing chars)
export function genCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const arr = new Uint32Array(4);
  (window.crypto || window.msCrypto).getRandomValues(arr);
  for (let i = 0; i < 4; i++) s += A[arr[i] % A.length];
  return s;
}

export function uid() {
  return "k" + Math.abs((Date.now() ^ (Math.floor(performance.now() * 1000)))).toString(36).slice(-6);
}
