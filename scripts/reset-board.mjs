// ============================================================================
// Board reset for launch (Jul 6): wipe all posts/comments/reactions and live
// chat for the pilot cohort, then pin a welcome from "Mr. Jon & Mrs. Kenya"
// (a dedicated announcer account, created on first run and reused after).
//
// NOTE: Netlify masks secret env values in the CLI, so this can't run locally
// against production. To run it: wrap this logic in a temporary one-off Netlify
// function guarded by a random token (functions get real env values at runtime),
// deploy, invoke once, then DELETE the function and redeploy. (Done Jul 3, 2026.)
// ============================================================================
const SB = process.env.SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !SRK) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const ANNOUNCER_EMAIL = "team@kids.codethefuture.net";
const ANNOUNCER_NAME = "Mr. Jon & Mrs. Kenya";

const WELCOME = `🚀 Welcome, Founding Builders!

Hi everyone — we're Mr. Jon and Mrs. Kenya, and we are SO excited you're here. You're part of the very FIRST Code the Future group ever. That makes you our founding summer crew!

This summer we're exploring one of the newest and most amazing pieces of technology in all of human history: AI. Our goal is to show you how it can feed your curiosity, help you create amazing things, and help you understand how the world works. AI is here to make YOU more powerful — an enhancement, never a replacement for your own brilliant brain.

We have SO many fun missions, games, and activities ahead — and at the end of the summer, you'll build your very own app or game and put it on the internet. For real.

❓ Need help? If you ever get stuck on a question, an activity, or anything at all — tap the "Ask in Help" button right here on the board (or the ❓ Help & Questions room). We see every message and we'll jump in fast.

👀 Want to say hi? When you log in, you can see who's online right now — look for the green dots at the top of the board! Tap the 💬 Live Chat to talk with your fellow builders any time. Say hello, cheer each other on, and share the cool things you make in 🏆 Show & Tell.

Let's build the future — together! 🛠️
— Mr. Jon & Mrs. Kenya`;

const H = { apikey: SRK, Authorization: "Bearer " + SRK, "Content-Type": "application/json" };
async function rest(path, opts = {}) {
  const r = await fetch(SB + "/rest/v1/" + path, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  if (!r.ok) throw new Error(path + " -> " + r.status + " " + (typeof d === "string" ? d : JSON.stringify(d)).slice(0, 220));
  return d;
}
async function gotrue(path, opts = {}) {
  const r = await fetch(SB + "/auth/v1/" + path, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  return { ok: r.ok, status: r.status, data: d };
}

// 1) the pilot cohort
const cohorts = await rest("cohorts?select=id,name,join_code&join_code=eq.FUTURE26");
if (!cohorts.length) { console.error("Pilot cohort FUTURE26 not found"); process.exit(1); }
const cohort = cohorts[0];
console.log("Cohort:", cohort.name, cohort.id);

// 2) wipe: reactions + comments for this cohort's posts, then posts, then chat
const posts = await rest(`posts?select=id&cohort_id=eq.${cohort.id}`);
console.log("Existing posts:", posts.length);
if (posts.length) {
  const ids = posts.map((p) => p.id).join(",");
  await rest(`post_reactions?post_id=in.(${ids})`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(()=>{});
  await rest(`post_comments?post_id=in.(${ids})`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(()=>{});
  await rest(`posts?cohort_id=eq.${cohort.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
}
const msgs = await rest(`messages?select=id&cohort_id=eq.${cohort.id}`);
console.log("Existing chat messages:", msgs.length);
if (msgs.length) await rest(`messages?cohort_id=eq.${cohort.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });

// 3) the announcer account (find-or-create; never logged into)
let uid = null;
const existing = await rest(`staff_accounts?select=user_id&email=eq.${encodeURIComponent(ANNOUNCER_EMAIL)}`);
if (existing.length) uid = existing[0].user_id;
if (!uid) {
  const pw = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"[b % 54]).join("");
  const cu = await gotrue("admin/users", { method: "POST", body: JSON.stringify({ email: ANNOUNCER_EMAIL, password: pw, email_confirm: true, user_metadata: { kind: "announcer" } }) });
  if (!cu.ok || !cu.data?.id) { console.error("Couldn't create announcer:", cu.status, JSON.stringify(cu.data).slice(0, 200)); process.exit(1); }
  uid = cu.data.id;
  await rest("staff_accounts", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ email: ANNOUNCER_EMAIL, user_id: uid }) });
}
await rest("profiles?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify({ id: uid, display_name: ANNOUNCER_NAME, role: "teacher", is_anonymous: false, onboarded: true, avatar: { bg: "night", color: "blue", face: "happy", acc: "cap" } }) });
// staff membership so kids' RLS lets them see the announcer's profile
try {
  await rest("cohort_members?on_conflict=cohort_id,user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ cohort_id: cohort.id, user_id: uid, role: "staff" }) });
} catch (e) {
  console.warn("staff role failed, trying owner:", String(e).slice(0, 120));
  await rest("cohort_members?on_conflict=cohort_id,user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ cohort_id: cohort.id, user_id: uid, role: "owner" }) });
}
console.log("Announcer:", ANNOUNCER_NAME, uid);

// 4) the pinned welcome
const post = await rest("posts", { method: "POST", headers: { Prefer: "return=representation" },
  body: JSON.stringify({ cohort_id: cohort.id, author_id: uid, channel: "announcements", body: WELCOME, pinned: true }) });
console.log("Pinned welcome posted:", post[0]?.id);

// 5) final state
const finalPosts = await rest(`posts?select=id,channel,pinned&cohort_id=eq.${cohort.id}`);
console.log("Board now has", finalPosts.length, "post(s):", JSON.stringify(finalPosts));
