# studentdemos.codethefuture.net — Netlify setup

The student showcase (Module 4 published builds) deploys as its **own Netlify
site**, separate from the main `codethefuture.net` site, so kid-generated HTML
lives on its own origin behind the cohort password. Everything in the repo is
ready; these are the one-time dashboard + DNS steps only you can do.

## What's already in the repo
- `studentdemos/` — the whole site: gallery (`index.html`), manifest
  (`creations.json`), logo (`assets/logo.svg`), its own `netlify.toml`, and a
  password gate (`netlify/edge-functions/gate.js`).
- `scripts/publish-kid-build.mjs` writes each creation into `studentdemos/<slug>/`.

## One-time setup (≈10 min)

1. **Create the site.** Netlify → **Add new site → Import an existing project**
   → pick the same repo (`jmnich05/code-the-future`).

2. **Point it at the subfolder.** In the site's **Build & deploy → Build
   settings**:
   - **Base directory:** `studentdemos`
   - **Build command:** *(leave empty)*
   - **Publish directory:** `studentdemos` (Netlify resolves it against the base)

   The base directory is what isolates this site — Netlify reads
   `studentdemos/netlify.toml` and ignores the main site's apex-redirect rules.

3. **Set the password.** Site → **Environment variables** → add
   `GATE_PASSWORD = launchpad-july6` (the cohort password — same one the platform
   uses). Without it the gate is off and the showcase is public, so don't skip it.

4. **Add the domain.** Site → **Domain management → Add a domain** →
   `studentdemos.codethefuture.net`.
   - If `codethefuture.net` is on **Netlify DNS**, Netlify adds the record itself.
   - If DNS is elsewhere, Netlify shows a **CNAME** target — add it at your DNS
     host as `studentdemos` → that target. HTTPS provisions automatically.

5. **Deploy** (Trigger deploy). Visit `https://studentdemos.codethefuture.net` —
   you should hit the password prompt, then the empty "The Showcase" gallery.

## Publishing a kid's build (your routine, per creation)
```
node scripts/publish-kid-build.mjs <creation.html> <slug> "Title" "By Name"
git add studentdemos && git commit -m "Showcase: <slug>" && git push
```
The studentdemos site auto-builds on push; the creation is live at
`https://studentdemos.codethefuture.net/<slug>/` within a minute or two.

> The kid downloads their finished HTML at checkpoint 12 ("Ship & Show"); that
> downloaded file is the `<creation.html>` you pass to the script.
