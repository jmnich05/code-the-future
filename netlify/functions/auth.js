// ============================================================================
// Code the Future — front-door auth (POST /api/auth)
//
// Three actions, all setting a signed `ctf_gate` cookie the edge gate trusts:
//   • register    — parent email + cohort number → create the kid a recoverable
//                   account keyed to a unique login code; returns the code.
//   • login_kid   — kid's unique code → set cookie; returns the synthetic email
//                   the browser signs into Supabase with (password = the code).
//   • login_admin — admin email + ADMIN_PASSWORD → set admin cookie; ensures a
//                   Supabase admin user exists with that password.
//   • logout      — clear the cookie.
//
// Secrets (Netlify env): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (bypasses RLS),
// AUTH_SIGNING_SECRET (signs the cookie), ADMIN_PASSWORD, GATE_PASSWORD (the
// cohort number). Kids' real names are written later (onboarding) into the
// locked-down private_identity table; here we only create the account + code.
// ============================================================================
import { createHmac } from "node:crypto";

const SB = process.env.SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.AUTH_SIGNING_SECRET;
const ADMIN_EMAILS = ["jon@pappyco.com", "hello@closerhorizons.com"];
const KID_EMAIL_DOMAIN = "kids.codethefuture.net";
const COOKIE_DAYS = 30;

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!SB || !SRK || !SECRET) return json({ error: "Auth isn't configured yet." }, 503);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  try {
    switch (body.action) {
      case "register":     return await register(body);
      case "login_kid":    return await loginKid(body);
      case "login_admin":  return await loginAdmin(body);
      case "logout":       return json({ ok: true }, 200, clearCookie());
      default:             return json({ error: "Unknown action." }, 400);
    }
  } catch (e) {
    return json({ error: "Something went wrong — please try again." }, 500);
  }
};

// ---- actions --------------------------------------------------------------

async function register(body) {
  const email = String(body.parentEmail || "").trim().toLowerCase();
  const cohort = String(body.cohort || "").trim();
  if (!email || !cohort) return json({ error: "Enter your email and the cohort number." }, 400);
  if (cohort !== process.env.GATE_PASSWORD) return json({ error: "That cohort number isn't right." }, 401);

  const ep = await rest(`enrolled_parents?select=email,cohort_code&email=eq.${encodeURIComponent(email)}`);
  const row = ep.ok && Array.isArray(ep.data) ? ep.data[0] : null;
  if (!row) return json({ error: "That email isn't on the cohort list. Check with your camp leader." }, 403);
  if (row.cohort_code && row.cohort_code !== cohort) return json({ error: "That cohort number doesn't match your enrollment." }, 401);

  // unique login code
  let code = null;
  for (let i = 0; i < 6; i++) {
    const c = genCode();
    const ex = await rest(`private_identity?select=user_id&login_code=eq.${encodeURIComponent(c)}`);
    if (ex.ok && Array.isArray(ex.data) && ex.data.length === 0) { code = c; break; }
  }
  if (!code) return json({ error: "Couldn't make a code — try again." }, 500);

  const synthEmail = `${code.toLowerCase()}@${KID_EMAIL_DOMAIN}`;
  const cu = await gotrue("admin/users", { method: "POST", body: JSON.stringify({
    email: synthEmail, password: code, email_confirm: true, user_metadata: { kind: "kid" }
  }) });
  if (!cu.ok || !cu.data || !cu.data.id) return json({ error: "Couldn't create the account — try again." }, 500);
  const uid = cu.data.id;

  // profiles row exists from the new-user trigger; mark it a real (non-anon) learner.
  await rest("profiles?on_conflict=id", { method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: uid, role: "learner", is_anonymous: false }) });
  // private identity (names filled in during onboarding)
  await rest("private_identity", { method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: uid, parent_email: email, login_code: code }) });

  return json({ ok: true, code, synthEmail }, 200, gateCookie("learner"));
}

async function loginKid(body) {
  const code = String(body.code || "").trim().toUpperCase();
  if (!code) return json({ error: "Enter your code." }, 400);
  const ex = await rest(`private_identity?select=user_id&login_code=eq.${encodeURIComponent(code)}`);
  if (!ex.ok || !Array.isArray(ex.data) || ex.data.length === 0) return json({ error: "We couldn't find that code." }, 401);
  return json({ ok: true, synthEmail: `${code.toLowerCase()}@${KID_EMAIL_DOMAIN}` }, 200, gateCookie("learner"));
}

async function loginAdmin(body) {
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!ADMIN_EMAILS.includes(email) || !password || password !== process.env.ADMIN_PASSWORD) {
    return json({ error: "Email or admin password is wrong." }, 401);
  }
  const sa = await rest(`staff_accounts?select=user_id&email=eq.${encodeURIComponent(email)}`);
  let uid = sa.ok && Array.isArray(sa.data) && sa.data[0] ? sa.data[0].user_id : null;
  if (uid) {
    await gotrue(`admin/users/${uid}`, { method: "PUT", body: JSON.stringify({ password }) });
  } else {
    const cu = await gotrue("admin/users", { method: "POST", body: JSON.stringify({
      email, password, email_confirm: true, user_metadata: { kind: "admin" }
    }) });
    if (!cu.ok || !cu.data || !cu.data.id) return json({ error: "Couldn't sign in — try again." }, 500);
    uid = cu.data.id;
    await rest("staff_accounts", { method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ email, user_id: uid }) });
    await rest("profiles?on_conflict=id", { method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: uid, role: "admin", is_anonymous: false, display_name: email.split("@")[0] }) });
  }
  await rest(`profiles?id=eq.${uid}`, { method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ role: "admin" }) });
  return json({ ok: true, email }, 200, gateCookie("admin"));
}

// ---- supabase REST + admin helpers ---------------------------------------

const adminHeaders = () => ({ apikey: SRK, Authorization: "Bearer " + SRK, "Content-Type": "application/json" });

async function rest(path, opts = {}) {
  const r = await fetch(SB + "/rest/v1/" + path, { ...opts, headers: { ...adminHeaders(), ...(opts.headers || {}) } });
  const t = await r.text(); let data = null;
  try { data = t ? JSON.parse(t) : null; } catch { data = t; }
  return { ok: r.ok, status: r.status, data };
}
async function gotrue(path, opts = {}) {
  const r = await fetch(SB + "/auth/v1/" + path, { ...opts, headers: { ...adminHeaders(), ...(opts.headers || {}) } });
  const t = await r.text(); let data = null;
  try { data = t ? JSON.parse(t) : null; } catch { data = t; }
  return { ok: r.ok, status: r.status, data };
}

// ---- helpers --------------------------------------------------------------

function genCode() {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L ambiguity
  let s = "";
  for (let i = 0; i < 8; i++) { if (i === 4) s += "-"; s += A[Math.floor(Math.random() * A.length)]; }
  return s;
}
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function gateCookie(role) {
  const payload = { r: role, e: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * COOKIE_DAYS, v: 1 };
  const bodyB64 = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac("sha256", SECRET).update(bodyB64).digest());
  const token = bodyB64 + "." + sig;
  return `ctf_gate=${token}; Path=/; Max-Age=${60 * 60 * 24 * COOKIE_DAYS}; HttpOnly; Secure; SameSite=Lax`;
}
function clearCookie() {
  return "ctf_gate=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
}
function json(obj, status = 200, setCookie) {
  const headers = { "Content-Type": "application/json" };
  if (setCookie) headers["Set-Cookie"] = setCookie;
  return new Response(JSON.stringify(obj), { status, headers });
}
