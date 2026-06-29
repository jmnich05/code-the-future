// Front-door gate for the learner platform (/platform/* and /curriculum/*).
//
// Identity now lives in an app login (platform/login.html → /api/auth), which
// sets a signed `ctf_gate` cookie. This edge function just checks that cookie:
//   • valid cookie  → let the request through
//   • no/invalid    → redirect page loads to the login screen (other requests 401)
//
// The cookie is HMAC-SHA256 signed with AUTH_SIGNING_SECRET (same secret the
// /api/auth function signs with). If AUTH_SIGNING_SECRET is unset the gate is
// OFF (fail-open) so a missing env var can never lock everyone out.
const SECRET = Netlify.env.get("AUTH_SIGNING_SECRET");

function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function validCookie(token) {
  if (!token || token.indexOf(".") < 0) return false;
  const [bodyB64, sig] = token.split(".");
  try {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(bodyB64));
    if (bytesToB64url(new Uint8Array(mac)) !== sig) return false;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(bodyB64)));
    return !!payload.e && payload.e >= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export default async (request, context) => {
  if (!SECRET) return context.next();                       // fail-open if unconfigured
  const url = new URL(request.url);
  if (url.pathname === "/platform/login.html") return context.next(); // the door itself

  const cookies = request.headers.get("cookie") || "";
  const m = cookies.match(/(?:^|;\s*)ctf_gate=([^;]+)/);
  if (m && await validCookie(decodeURIComponent(m[1]))) return context.next();

  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) {
    const next = encodeURIComponent(url.pathname + url.search);
    return Response.redirect(url.origin + "/platform/login.html?next=" + next, 302);
  }
  return new Response("Sign in required.", { status: 401 });
};
