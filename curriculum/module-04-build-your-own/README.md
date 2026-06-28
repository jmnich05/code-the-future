# Module 4 — Build Your Own

The capstone module. After Modules 1–3, the kids spend the whole week **building
their own app or game with a real AI**, in **12 layered checkpoints** that mirror
the mission structure of the other modules — except every checkpoint adds one new
layer to the *same* growing project. The final checkpoint publishes it and they
present it to their families at the library.

On the `module-4` branch — **not yet deployed to `main`** (it touches live
onboarding; ship once the Netlify subdomain below is set up).

## The pieces

| File | What it is |
|---|---|
| `platform/build-dream.html` | The **dream picker**. A visual menu of build ideas + an "add your own twist" field. Saves to `localStorage['ctf:buildDream']` (and the Supabase profile via `CTFDB.updateProfile({build_dream})` when available). **Gated before Module 2** — `missions.html` bounces a learner with no dream here, then back to Module 2's map (`?m=2`). |
| `curriculum/module-04-build-your-own/studio.html` | The **Build Studio** — 12 checkpoints (`?mission=N`). Each one shows that layer's guide, opens the accumulating project (`ctf:m4project`), has the AI add the layer, awards `kids-mod4-N`, and advances `ctf:m4progress`. Mission 1 kicks off from the dream; mission 12 publishes + presents. Runs the AI's output in a **sandboxed iframe**. |
| `netlify/functions/buildstudio.js` | The **code-gen endpoint** (`/api/buildstudio`). Turns the idea + each layer request into one self-contained HTML file. Locked system prompt (self-contained, no network, kid-safe). Model = `OPENAI_BUILD_MODEL` (see below). Key stays server-side. |
| `platform/missions.html` | The **journey map**. Module 4 = the **Big Four Bridge** route (12 checkpoints from Waterfront Park, up the spiral ramp, across the span, to Jeffersonville + the Colgate Clock). Each node links to `studio.html?mission=N`. |
| `scripts/publish-kid-build.mjs` | The **publish flow Jon runs**. `node scripts/publish-kid-build.mjs <creation.html> <slug> "Title" "By"` writes the creation under `studentdemos/<slug>/` and refreshes the gallery. After `git add studentdemos && git commit && git push` it's live at `studentdemos.codethefuture.net/<slug>/`. |
| `studentdemos/` | The **student showcase**, deployed as its **own Netlify site** at `studentdemos.codethefuture.net`, behind the cohort password. Separate origin = kid builds live well away from the platform. See `docs/studentdemos-setup.md`. |

## The flow, end to end
1. **Before Module 2:** kid picks a build dream (`build-dream.html`) → saved.
2. **Week 4:** kid walks the Big Four Bridge — 12 checkpoints, each adding one layer to their app/game (canvas → star → movement → goal → score → … → ship).
3. **Checkpoint 12 (Ship & Show):** the creation is saved to the device + (best-effort) the platform. **Jon** runs `publish-kid-build.mjs` on each one → it goes live on the showcase. Kids present to families at the library.

## Safety (important)
- The AI's output runs **only inside a sandboxed iframe** (`sandbox="allow-scripts"`, **no** `allow-same-origin` → null origin). It can't reach the parent page, cookies, or `localStorage`.
- The `buildstudio` system prompt forbids external files, network calls, logins, and unsafe content, and is not overridable by kid text. Kid input is also run through `CTFFilter`.
- Published creations are **doubly isolated**: wrapped in a sandboxed-iframe shell *and* served from their own origin (`studentdemos.codethefuture.net`), behind the cohort password.

## Settled decisions (Jun 28)
- **Picker placement:** gated **before Module 2** (not before Module 1). ✓ wired.
- **Hosting origin:** dedicated subdomain **`studentdemos.codethefuture.net`**, its own Netlify site, cohort-password gated. ✓ in repo — Jon does the Netlify site + DNS (see `docs/studentdemos-setup.md`).
- **Model:** `OPENAI_BUILD_MODEL` → `OPENAI_MODEL` → default `gpt-5.4-mini`. Set `OPENAI_BUILD_MODEL` in Netlify to the exact OpenAI slug (confirm it in the OpenAI dashboard).
- **Publishing:** **Jon** runs the publish script per creation (no kid self-publish). ✓

## Still open
- **Framing missions.** If you want short "what makes a good app idea" / "how to give the AI good instructions" framing beats before the build, we can add them like M1–M3.
