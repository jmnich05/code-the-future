// ============================================================================
// Share a Sandbox creation to Show & Tell — one button for the kid.
//
// POST /api/share-art
//   Authorization: Bearer <the learner's Supabase access token>
//   { image: "data:image/jpeg;base64,...", title: "a dragon eating tacos" }
//
// The function (service role) verifies WHO is asking via their token, uploads
// the composited artwork to the public `showtell` storage bucket (created on
// first use), and inserts a Show & Tell post as that learner with a 📷 image
// line the board renders as a picture. Kids never touch storage directly —
// uploads only happen through here (size-capped, jpeg/png only).
// ============================================================================
const SB = process.env.SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "showtell";
const MAX_B64 = 1_600_000;            // ~1.2 MB binary — plenty for a 768px jpeg

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!SB || !SRK) return json({ error: "Sharing isn't configured yet." }, 503);

  // ---- who is asking? (their own Supabase session token) -------------------
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "Sign in first." }, 401);
  const who = await fetch(SB + "/auth/v1/user", { headers: { apikey: SRK, Authorization: "Bearer " + token } });
  if (!who.ok) return json({ error: "Sign in first." }, 401);
  const uid = (await who.json())?.id;
  if (!uid) return json({ error: "Sign in first." }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const m = String(body.image || "").match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return json({ error: "That doesn't look like a picture." }, 400);
  if (m[2].length > MAX_B64) return json({ error: "That picture is too big — try again." }, 413);
  const title = String(body.title || "my picture").replace(/\s+/g, " ").trim().slice(0, 120) || "my picture";

  // ---- the learner's cohort + display name ---------------------------------
  const [members, profs] = await Promise.all([
    rest(`cohort_members?select=cohort_id&user_id=eq.${uid}&limit=1`),
    rest(`profiles?select=display_name&id=eq.${uid}&limit=1`)
  ]);
  if (!Array.isArray(members) || !members.length) return json({ error: "Join your cohort first (open the Board once)!" }, 400);
  const cohortId = members[0].cohort_id;
  const name = (Array.isArray(profs) && profs[0] && profs[0].display_name) || "A builder";

  // ---- bucket (idempotent) + upload -----------------------------------------
  await fetch(SB + "/storage/v1/bucket", { method: "POST", headers: hdr("application/json"),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }) }).catch(() => {});   // 409 = already exists, fine
  const ext = m[1] === "png" ? "png" : "jpg";
  const path = `${uid.slice(0, 8)}-${Date.now()}.${ext}`;
  const up = await fetch(`${SB}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST", headers: hdr(m[1] === "png" ? "image/png" : "image/jpeg"),
    body: Buffer.from(m[2], "base64")
  });
  if (!up.ok) return json({ error: "Couldn't save the picture — try again." }, 502);
  const url = `${SB}/storage/v1/object/public/${BUCKET}/${path}`;

  // ---- the Show & Tell post, as the learner ----------------------------------
  const post = await fetch(SB + "/rest/v1/posts", { method: "POST",
    headers: { ...hdr("application/json"), Prefer: "return=representation" },
    body: JSON.stringify({ cohort_id: cohortId, author_id: uid, channel: "show_tell",
      body: `🎨 ${name} made “${title}” in the Sandbox!\n📷 ${url}` }) });
  if (!post.ok) return json({ error: "Couldn't post it — try again." }, 502);
  const rows = await post.json();
  return json({ ok: true, url, postId: rows[0]?.id });
};

function hdr(ct) { return { apikey: SRK, Authorization: "Bearer " + SRK, "Content-Type": ct }; }
async function rest(path) {
  const r = await fetch(SB + "/rest/v1/" + path, { headers: hdr("application/json") });
  return r.ok ? r.json() : null;
}
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
