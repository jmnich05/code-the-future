# studentdemos.codethefuture.net — setup & how it works

The student showcase (Module 4 published builds) is served at
`studentdemos.codethefuture.net`, which is a **domain alias on the main Netlify
site**. A host-aware edge function makes that subdomain serve only the
`/studentdemos` folder, behind the cohort password — so kid-generated HTML sits
on its own origin (its own `localStorage`, gated) without needing a second site.

## How it works (already wired in the repo)
- `studentdemos/` — the showcase: gallery (`index.html`), manifest
  (`creations.json`), logo, and each published build under `<slug>/`.
- `netlify/edge-functions/showcase-gate.js` (registered on `/*` in
  `netlify.toml`):
  - **studentdemos host** → requires the cohort password, then serves the
    request out of `/studentdemos/…`.
  - **apex `/studentdemos/*`** → 301s to the gated subdomain (so the raw folder
    is never served un-gated from `codethefuture.net`).
  - **every other host/path** → untouched (public sales site + the existing
    platform gate keep working exactly as before).
- `scripts/publish-kid-build.mjs` writes each creation into `studentdemos/<slug>/`.

## What's left for you
1. **Confirm the password.** The edge function reuses the main site's existing
   `GATE_PASSWORD` (already set to the cohort password, `launchpad-july6`) — so
   there's likely **nothing to do**. Just confirm it's still set in the main
   site's Netlify → Environment variables.
2. **The alias is already added** (your screenshot — Netlify DNS, verified). ✅
3. **Ship it.** Once Module 4 is merged to `main` and deployed, visit
   `https://studentdemos.codethefuture.net` — you should hit the password
   prompt, then the empty "The Showcase" gallery. (Edge routing only runs on the
   real Netlify deploy, not the local dev server.)

## Publishing a kid's build (your routine, per creation)
```
node scripts/publish-kid-build.mjs <creation.html> <slug> "Title" "By Name"
git add studentdemos && git commit -m "Showcase: <slug>" && git push
```
Live at `https://studentdemos.codethefuture.net/<slug>/` within a minute or two
of the push (it deploys with the main site).

> The kid downloads their finished HTML at checkpoint 12 ("Ship & Show"); that
> downloaded file is the `<creation.html>` you pass to the script.
