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

// ---- cohort board ---------------------------------------------------------
async function myCohorts() {
  if (!ok()) return [];
  const { data } = await sb.from("cohort_members").select("role, cohorts(id,name,join_code,track,starts_on)").eq("user_id", uid());
  return (data || []).map((r) => ({ role: r.role, ...r.cohorts }));
}

async function profilesById(ids) {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return {};
  const { data } = await sb.from("profiles").select("id, display_name, avatar").in("id", uniq);
  const map = {};
  (data || []).forEach((p) => { map[p.id] = p; });
  return map;
}

async function listMembers(cohortId) {
  if (!ok()) return [];
  const { data } = await sb.from("cohort_members").select("user_id, role").eq("cohort_id", cohortId);
  const profs = await profilesById((data || []).map((m) => m.user_id));
  return (data || []).map((m) => ({ ...m, profiles: profs[m.user_id] || null }));
}

async function listPosts(cohortId, channel) {
  if (!ok()) return [];
  let q = sb.from("posts")
    .select("id, channel, body, pinned, created_at, author_id, post_reactions(emoji, user_id), post_comments(id)")
    .eq("cohort_id", cohortId).order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(50);
  if (channel) q = q.eq("channel", channel);
  const { data, error } = await q;
  if (error) { console.warn("[CTFDB] listPosts:", error.message); return []; }
  const profs = await profilesById((data || []).map((p) => p.author_id));
  return (data || []).map((p) => ({ ...p, profiles: profs[p.author_id] || null }));
}

async function createPost(cohortId, channel, body, pinned = false) {
  if (!ok()) return { error: "not-connected" };
  const { data, error } = await sb.from("posts").insert({ cohort_id: cohortId, author_id: uid(), channel, body, pinned }).select().maybeSingle();
  return error ? { error: error.message } : { post: data };
}

async function toggleReaction(postId, emoji) {
  if (!ok()) return;
  const { error } = await sb.from("post_reactions").insert({ post_id: postId, user_id: uid(), emoji });
  if (error) await sb.from("post_reactions").delete().match({ post_id: postId, user_id: uid(), emoji });
}

async function listComments(postId) {
  if (!ok()) return [];
  const { data } = await sb.from("post_comments").select("id, body, created_at, author_id").eq("post_id", postId).order("created_at");
  const profs = await profilesById((data || []).map((c) => c.author_id));
  return (data || []).map((c) => ({ ...c, profiles: profs[c.author_id] || null }));
}

async function addComment(postId, body) {
  if (!ok()) return { error: "not-connected" };
  const { data, error } = await sb.from("post_comments").insert({ post_id: postId, author_id: uid(), body }).select().maybeSingle();
  return error ? { error: error.message } : { comment: data };
}

// ---- presence (who's online) + live chat (Supabase Realtime) -------------
let presenceChannel = null;

function joinPresence(cohortId, info, onSync) {
  if (!ok()) return null;
  if (presenceChannel) { sb.removeChannel(presenceChannel); presenceChannel = null; }
  presenceChannel = sb.channel("presence:cohort:" + cohortId, { config: { presence: { key: uid() } } });
  presenceChannel.on("presence", { event: "sync" }, () => {
    const state = presenceChannel.presenceState();
    const online = Object.keys(state).map((k) => ({ user_id: k, ...(state[k][0] || {}) }));
    onSync(online);
  });
  presenceChannel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") await presenceChannel.track(info || {});
  });
  return presenceChannel;
}

async function listMessages(cohortId, limit = 50, dmWith = null) {
  if (!ok()) return [];
  let q = sb.from("messages").select("id, body, created_at, author_id, recipient_id").eq("cohort_id", cohortId);
  if (dmWith) {
    q = q.or(`and(author_id.eq.${uid()},recipient_id.eq.${dmWith}),and(author_id.eq.${dmWith},recipient_id.eq.${uid()})`);
  } else {
    q = q.is("recipient_id", null);
  }
  const { data } = await q.order("created_at", { ascending: false }).limit(limit);
  const msgs = (data || []).reverse();
  const profs = await profilesById(msgs.map((m) => m.author_id));
  return msgs.map((m) => ({ ...m, profiles: profs[m.author_id] || null }));
}

async function sendMessage(cohortId, body, recipientId = null) {
  if (!ok()) return { error: "not-connected" };
  const { data, error } = await sb.from("messages").insert({ cohort_id: cohortId, author_id: uid(), body, recipient_id: recipientId }).select().maybeSingle();
  return error ? { error: error.message } : { message: data };
}

// ---- staff console (RLS: *_select_staff policies gate these to cohort staff) --
async function progressByUsers(uids) {
  if (!ok() || !uids.length) return [];
  const { data } = await sb.from("lesson_progress")
    .select("user_id, module, track, position, completed, updated_at").in("user_id", uids);
  return data || [];
}

async function badgesByUsers(uids) {
  if (!ok() || !uids.length) return [];
  const { data } = await sb.from("badges").select("user_id, badge_key, earned_at").in("user_id", uids);
  return data || [];
}

// DM threads where I'm the recipient or sender — newest message per partner
async function myDmMessages(cohortId, limit = 100) {
  if (!ok()) return [];
  const { data } = await sb.from("messages")
    .select("id, body, created_at, author_id, recipient_id")
    .eq("cohort_id", cohortId).not("recipient_id", "is", null)
    .or(`author_id.eq.${uid()},recipient_id.eq.${uid()}`)
    .order("created_at", { ascending: false }).limit(limit);
  return data || [];
}

// latest Help & Questions posts with their comment authors (to spot unanswered)
async function helpPosts(cohortId, limit = 20) {
  if (!ok()) return [];
  const { data } = await sb.from("posts")
    .select("id, body, created_at, author_id, post_comments(author_id, created_at)")
    .eq("cohort_id", cohortId).eq("channel", "help")
    .order("created_at", { ascending: false }).limit(limit);
  return data || [];
}

function onNewMessage(cohortId, cb) {
  if (!ok()) return null;
  const ch = sb.channel("chat:cohort:" + cohortId)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "cohort_id=eq." + cohortId },
      async (payload) => {
        const m = payload.new;
        const profs = await profilesById([m.author_id]);
        cb({ ...m, profiles: profs[m.author_id] || null });
      })
    .subscribe();
  return ch;
}

export const CTFDB = {
  init, saveProgress, getProgress, saveWidgetResponse, getWidgetResponse,
  awardBadge, listBadges, joinCohort, getProfile, updateProfile, logEvent,
  myCohorts, listMembers, listPosts, createPost, toggleReaction, listComments, addComment,
  joinPresence, listMessages, sendMessage, onNewMessage,
  progressByUsers, badgesByUsers, myDmMessages, helpPosts,
  get user() { return user; }, get enabled() { return enabled; }
};
if (typeof window !== "undefined") window.CTFDB = CTFDB;
