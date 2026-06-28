# Module 4 — Build Your Own (v1)

The capstone module. After Modules 1–3, the kids spend the week **building their
own app or game with a real AI**, then publish it to the open internet. Unlike
M1–M3 (12 lesson-missions each), M4 is one guided **Build Studio** experience.

This is a working v1 on the `module-4` branch — **not deployed to `main`** (it
touches the live onboarding and needs a couple of decisions from Jon first).

## The pieces

| File | What it is |
|---|---|
| `platform/build-dream.html` | The **onboarding picker**. Shown right at the start (before Module 1): a visual menu of build ideas + an "add your own twist" field. Saves the choice to `localStorage['ctf:buildDream']` (and the Supabase profile via `CTFDB.updateProfile({build_dream})` when available). |
| `curriculum/module-04-build-your-own/studio.html` | The **Build Studio** — the heart of M4. Recalls the kid's dream → they describe it → a real AI builds a complete, self-contained app/game → it renders live in a **sandboxed iframe** → they iterate ("add a score", "brighter colors", or type their own) → then **publish**. |
| `netlify/functions/buildstudio.js` | The **code-gen endpoint** (`/api/buildstudio`). Turns the idea + iteration requests into one self-contained HTML file. Bigger token budget than `/api/ai`, with a locked system prompt (self-contained, no network, kid-safe). Key stays server-side. |
| `scripts/publish-kid-build.mjs` | The **publish flow Jon runs**. `node scripts/publish-kid-build.mjs <creation.html> <slug> "Title" "By"` writes the creation under `showcase/<slug>/` and refreshes the gallery. After `git add showcase && git commit && git push` it's live at `codethefuture.net/showcase/<slug>/`. |
| `showcase/index.html` + `showcase/creations.json` | The public **gallery** of kids' shipped creations. |

## The flow, end to end
1. **Start of journey:** kid picks a build dream (`build-dream.html`) → saved.
2. **Week 4:** kid opens the Studio → it greets them with their dream → describe → AI builds → live preview → iterate → name + publish.
3. **Publish:** the creation is saved to the device + (best-effort) the platform. Jon runs `publish-kid-build.mjs` on each one → it goes live in the Showcase.

## Safety (important)
- The AI's output runs **only inside a sandboxed iframe** (`sandbox="allow-scripts"`, **no** `allow-same-origin` → null origin). It can't reach the parent page, cookies, or `localStorage`.
- The `buildstudio` system prompt forbids external files, network calls, logins, and unsafe content, and is not overridable by kid text. Kid input is also run through `CTFFilter`.
- Published creations are wrapped the same way: `showcase/<slug>/index.html` is a branded shell that loads the raw `creation.html` in a sandboxed iframe — so even on the main domain the kid's code is origin-isolated.

## Decisions / next steps for Jon
- **Wire the picker into onboarding.** Right now `build-dream.html` is standalone (supports `?next=`). The clean spot is the end of `platform/onboarding.html`, right before the kid lands. I left it un-wired so we don't change the live July-6 onboarding without your say-so.
- **Hosting origin.** v1 hosts creations under `codethefuture.net/showcase/` (sandbox-isolated, so it's safe). If you'd rather fully separate them, we can point them at a dedicated subdomain / second Netlify site — say the word.
- **Model.** Code-gen uses `OPENAI_BUILD_MODEL` (falls back to `OPENAI_MODEL` → `gpt-4o-mini`). For nicer games, set `OPENAI_BUILD_MODEL` to a stronger coding model in Netlify env.
- **Auto-publish.** v1 is "kid builds → Jon runs the script." If you want kids to publish themselves, we can add a save endpoint + an automated Netlify deploy. Flagged on purpose — that's a bigger call (moderation, abuse).
- **Module framing.** Right now M4 is the Studio + the dream picker. If you want a few short framing missions first (e.g., "what makes a good app idea", "how to give the AI good instructions"), we can add them like M1–M3.
