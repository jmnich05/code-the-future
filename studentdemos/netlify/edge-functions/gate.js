// Password gate for the student showcase (studentdemos.codethefuture.net).
// The whole site sits behind the cohort password so only enrolled families can
// browse the kids' published builds. Same scheme as the main platform gate:
// any username works, the password must match GATE_PASSWORD.
//
// If GATE_PASSWORD is unset the gate is OFF (a missing env var can never lock
// the showcase out), so set it in this site's Netlify -> Environment variables.
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
  return new Response("Code the Future — student showcase. Cohort password required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Code the Future student showcase"' }
  });
};
