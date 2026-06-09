/* ==========================================================================
   Code the Future — Supabase client + progress API (browser ES module)
   Anonymous-first: a learner gets a session instantly (no email/PII). Progress,
   widget answers, and badges persist to Supabase under RLS (each learner owns
   their rows). Cohorts (camp/class) join via a code.

   Usage (after config.js sets window.CTF_SUPABASE_URL / _ANON_KEY):
     <script src="config.js"></script>
     <script type="module">
       import { CTFDB } from "./ctf-db.js";
       await CTFDB.init();                       // anonymous session
       await CTFDB.saveProgress("module-01-what-is-ai","kids", 12, false);
     </script>
   Falls back gracefully (no-ops) if Supabase isn't configured — so the player
   keeps working on localStorage alone until keys are in place.
   ========================================================================== */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let sb = null;
let user = null;
let enabled = false;

const URL = (typeof window !== "undefined" && window.CTF_SUPABASE_URL) || "";
const KEY = (typeof window !== "undefined" && window.CTF_SUPABASE_ANON_KEY) || "";

async function init() {
  if (sb) return user;
  if (!URL || !KEY || /PASTE|YOUR_/.test(KEY)) {
    console.warn("[CTFDB] Supabase not configured — running local-only. Add platform/lib/config.js.");
    return null;
  }
  sb = createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  const { data: { session } } = await sb.auth.getSession();
  if (session) user = session.user;
  else {
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) { console.warn("[CTFDB] anonymous sign-in failed:", error.message); return null; }
    user = data.user;
  }
  enabled = !!user;
  return user;
}

const uid = () => (user ? user.id : null);
const ok = () => enabled && uid();

async function saveProgress(module, track, position, completed = false) {
  if (!ok()) return null;
  const row = { user_id: uid(), module, track, position, completed };
  if (completed) row.completed_at = new Date().toISOString();
  const { data, error } = await sb.from("lesson_progress").upsert(row, { onConflict: "user_id,module,track" }).select().maybeSingle();
  if (error) console.warn("[CTFDB] saveProgress:", error.message);
  return data;
}

async function getProgress(module, track) {
  if (!ok()) return null;
  const { data } = await sb.from("lesson_progress").select("position,completed,updated_at").eq("user_id", uid()).eq("module", module).eq("track", track).maybeSingle();
  return data;
}

async function saveWidgetResponse(widgetId, { response = {}, isComplete = false, module = null, track = null } = {}) {
  if (!ok()) return null;
  const { data, error } = await sb.from("widget_responses").upsert(
    { user_id: uid(), widget_id: widgetId, response, is_complete: isComplete, module, track },
    { onConflict: "user_id,widget_id" }).select().maybeSingle();
  if (error) console.warn("[CTFDB] saveWidgetResponse:", error.message);
  return data;
}

async function getWidgetResponse(widgetId) {
  if (!ok()) return null;
  const { data } = await sb.from("widget_responses").select("response,is_complete").eq("user_id", uid()).eq("widget_id", widgetId).maybeSingle();
  return data;
}

async function awardBadge(badgeKey, { module = null, track = null } = {}) {
  if (!ok()) return null;
  const { data, error } = await sb.from("badges").upsert(
    { user_id: uid(), badge_key: badgeKey, module, track },
    { onConflict: "user_id,badge_key", ignoreDuplicates: true }).select().maybeSingle();
  if (error) console.warn("[CTFDB] awardBadge:", error.message);
  return data;
}

async function listBadges() {
  if (!ok()) return [];
  const { data } = await sb.from("badges").select("badge_key,module,track,earned_at").eq("user_id", uid());
  return data || [];
}

async function joinCohort(code) {
  if (!ok()) return { error: "not-connected" };
  const { data, error } = await sb.rpc("join_cohort", { p_code: code });
  if (error) return { error: error.message };
  return { cohort: data };
}

async function getProfile() {
  if (!ok()) return null;
  const { data } = await sb.from("profiles").select("*").eq("id", uid()).maybeSingle();
  return data;
}

async function updateProfile(fields) {
  if (!ok()) return null;
  const { data } = await sb.from("profiles").update(fields).eq("id", uid()).select().maybeSingle();
  return data;
}

async function logEvent(kind, props = {}) {
  if (!ok()) return;
  await sb.from("events").insert({ user_id: uid(), kind, props });
}

export const CTFDB = {
  init, saveProgress, getProgress, saveWidgetResponse, getWidgetResponse,
  awardBadge, listBadges, joinCohort, getProfile, updateProfile, logEvent,
  get user() { return user; }, get enabled() { return enabled; }
};
if (typeof window !== "undefined") window.CTFDB = CTFDB;
