// Host-based router + gate for the student showcase.
//
// studentdemos.codethefuture.net is a DOMAIN ALIAS on the main site, so it
// serves this same deploy. This edge function makes that subdomain serve the
// /studentdemos folder (and nothing else), behind the cohort password — while
// leaving every other host (the public sales site, the gated platform) exactly
// as it was. Its whole blast radius is the studentdemos host plus the raw
// /studentdemos/* path on the apex (which it locks down).
//
// Reuses the same GATE_PASSWORD env var the platform gate already uses, so no
// new secret is needed. If GATE_PASSWORD is unset the gate is off (fail-open).
export default async (request, context) => {
  const url = new URL(request.url);
  const onDemoHost = url.host.startsWith("studentdemos.");
  const isDemoPath = url.pathname === "/studentdemos" || url.pathname.startsWith("/studentdemos/");

  // Apex/anything else reaching the raw folder → bounce to the canonical, gated
  // subdomain so the showcase is never served un-gated from the main host.
  if (!onDemoHost && isDemoPath) {
    const rest = url.pathname.replace(/^\/studentdemos/, "") || "/";
    return Response.redirect("https://studentdemos.codethefuture.net" + rest + url.search, 301);
  }
  // Not the showcase host → nothing to do; let the normal pipeline run.
  if (!onDemoHost) return context.next();

  // On the showcase host: require the cohort password (any username).
  const password = Netlify.env.get("GATE_PASSWORD");
  if (password) {
    const auth = request.headers.get("authorization") || "";
    let ok = false;
    if (auth.startsWith("Basic ")) {
      try { ok = atob(auth.slice(6)).split(":").slice(1).join(":") === password; } catch {}
    }
    if (!ok) {
      return new Response("Code the Future — student showcase. Cohort password required.", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Code the Future student showcase"' }
      });
    }
  }

  // Serve the showcase host out of the /studentdemos folder.
  if (!isDemoPath) {
    url.pathname = "/studentdemos" + (url.pathname === "/" ? "/" : url.pathname);
    return context.rewrite(url);
  }
  return context.next();
};
