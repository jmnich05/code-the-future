// Password gate for the learner platform while the sales site stays public.
// Covers /platform/* and /curriculum/* (configured in netlify.toml), except the
// asset/lib folders the public sales page reuses (excludedPath in netlify.toml).
//
// Enable it by setting GATE_PASSWORD in Netlify -> Environment variables and
// redeploying. Any username works; the browser remembers the password after the
// first prompt. If GATE_PASSWORD is unset, the gate is OFF and everything is
// public (so a missing env var can never lock you out).
export default async (request, context) => {
  const password = Netlify.env.get("GATE_PASSWORD");
  if (!password) return context.next();

  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Basic ")) {
    try {
      const given = atob(auth.slice(6)).split(":").slice(1).join(":");
      if (given === password) return context.next();
    } catch {}
  }
  return new Response("Code the Future — password required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Code the Future platform"' }
  });
};
