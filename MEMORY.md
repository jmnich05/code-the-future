# Project Memory — Code the Future

## What This Project Is

A platform + in-person summer camp (summer 2026) teaching kids AI literacy and modern
coding, with emphasis on how AI is reshaping software development. Origin material:
`docs/source/codex-handoff/`.

## Open Decisions (resolve as we go)

- Platform tech stack — not yet chosen. Leaning TypeScript web app + Supabase + Netlify to
  match existing Animo muscle memory. **Decide and record here before scaffolding code.**
- Camp format, ages, length, location — TBD.
- Relationship between platform and camp (is the platform the camp's LMS? a standalone
  product? both?) — TBD.

## Platform Backend — Supabase (scaffolded 06-08-2026)

- **Project:** ref `zlchimvgtpxojssblhlf` · `https://zlchimvgtpxojssblhlf.supabase.co`.
- **Auth model (decided):** **anonymous + cohort codes** — kids start with no email/PII
  (COPPA-minded); camp/classes join via a code; cohort staff can read members' progress.
  Adults/parents can attach email later.
- **Schema (in `supabase/migrations/`):** `profiles, cohorts, cohort_members,
  lesson_progress, widget_responses, badges, events` — **RLS on every table** (learners own
  their rows via `auth.uid()`; staff read their cohort via SECURITY DEFINER helpers).
  `join_cohort(code)` RPC; auto-profile trigger on signup; pilot cohort `FUTURE26` seeded.
- **Apply:** via Supabase **CLI** (`supabase login` → `link --project-ref …` → `db push`).
  CLI is installed (brew). Login is interactive → Jon runs it, OR drops the DB password in
  `supabase/.env` (gitignored) for me to push.
- **Client lib:** `platform/lib/ctf-db.js` (`window.CTFDB`) — anonymous-first; methods for
  progress/widget-responses/badges/cohort/profile/events; **no-ops gracefully** if not
  configured (player still works on localStorage). Config: copy `config.example.js` →
  `config.js` (gitignored) with the anon key.
- **Migrations APPLIED 06-08-2026** via CLI `supabase db push` (creds in gitignored
  `supabase/.env`: access token + DB password). `migration list --linked` confirms
  `20260608170040` + `…41` on remote. Note: Supabase applies migration statements WITHOUT a
  wrapping transaction, and SQL-language functions validate at creation — so order tables
  before SQL helpers; the init migration is written idempotently (clean-slate drops on top).
- **GitHub integration now CORRECT + ACTIVE (06-08-2026):** the Supabase project's GitHub
  integration was initially pointed at the WRONG repo (`Code-the-Future-Louisv…`); Jon
  re-pointed it to `jmnich05/code-the-future`. Confirmed working — a **"Supabase Preview"**
  check (Supabase app) now posts `success` on `main`. Branching is available (Pro plan).
- **Migration deploy REALITY (corrected 06-09-2026):** the GitHub integration is connected
  but does **NOT** auto-apply migrations. On PR #2 the "Supabase Preview" check **skipped**
  (preview branches not enabled), and merging to `main` did **not** deploy to production
  (verified: the new column was missing until we ran CLI `db push`). So the actual apply
  mechanism is still **CLI `supabase db push`** (creds in `supabase/.env`). PRs are good for
  review, but you must `db push` to apply. **Write migrations idempotently** (`add ... if not
  exists`, clean-slate drops) so CLI and any future integration deploy can't conflict.
- **WIRED & VERIFIED 06-08-2026:** player + widgets persist to Supabase (local-first +
  cloud sync). `platform/lib/config.js` holds the anon key (gitignored). `player.html` loads
  config + `ctf-db.js` (ESM) and inits anonymous auth; `player.js` saves position, awards
  per-mission badges (`<track>-m<n>`) + a module-complete badge, logs events, and resumes
  from cloud progress on a fresh device; `ctf-widgets.js` saves widget responses on
  completion. Verified against the live DB (progress, badges, widget response, event all
  round-tripped under RLS).
- **Anonymous sign-ins ENABLED** on the project (was off by default; flipped via Management
  API: `PATCH /v1/projects/{ref}/config/auth {external_anonymous_users_enabled:true}`).
- **Multi-client gotcha:** only ONE Supabase client per page (shared GoTrue storage key) —
  spinning up extra clients corrupts the session/deadlocks. The app uses the single
  `window.CTFDB`.
- **PROD CONFIG TODO:** `config.js` is gitignored, so the Netlify build won't have the anon
  key → Supabase disabled in production until we either commit `config.js` (anon key is
  public-safe — RLS guards data) or inject it via a Netlify build step. Local works today.
- Paths assume the site is served from the REPO ROOT (Netlify does; `player.html` uses
  `../../../platform/lib/...`). For local preview, serve the repo root, not the module dir.

## Evening build (06-09-2026, post-demo)

- **Production APIs at repo root now:** `netlify.toml` (root) + `netlify/functions/{ai,image}.js`
  with `/api/ai` + `/api/image` redirects — so the capstone AND the new image studio work on
  the live Netlify site. **Jon must set `OPENAI_API_KEY` in Netlify env vars** or both 500.
  Local dev: `node scripts/dev.mjs` (port 8160, serves repo root + both APIs, reads
  `capstone/.env`).
- **OpenAI images gotchas (learned live):** this account has **`gpt-image-1` only — `dall-e-3`
  does not exist** for it; `response_format` param is rejected (b64 returned by default);
  valid landscape size `1536x1024`, quality `low|medium|high|auto`. Function handles both
  b64_json and url responses. ~22s/gen at medium.
- **Homepage = photo hero + remix studio:** Jon's AI Louisville artwork
  (`platform/assets/hero-louisville.jpg`, optimized from `assets/*.png`) full-bleed, "Code
  the Future / LOUISVILLE" headline, coral CTA. Below: **🎨 Remix studio** — kid prompts →
  `/api/image` → preview → "Make it my homepage" (canvas-compressed to ~180KB JPEG →
  `localStorage ctf:hero`; "use original" resets). Verified end-to-end incl. persistence.
- **Board is full-service now:** channels + **📖 FAQ & AI Dictionary** (`platform/faq.js` —
  20 kid-voiced Q&As: platform how-tos + AI terms for 8–11) + **💬 Live Chat**
  (`messages` table, migration `…013000_chat.sql`, realtime publication; RLS = cohort
  members; persistent so staff can review). Chat verified live via postgres_changes.
- **Presence:** `CTFDB.joinPresence(cohortId, info, onSync)` (Supabase Realtime presence) —
  "Online now" avatar strip on home + board, green dots on the roster. Works with anon auth.
- Board/home link: home presence strip links to `board.html#chat` (opens chat view).

## Safety + cohort scope (06-10-2026)

- **Profanity filter, defense in depth:** DB triggers (migration `…150000_profanity_filter.sql`,
  applied) on `posts`, `post_comments`, `messages`, AND `profiles` (names/taglines) — raise
  `PROFANITY_BLOCKED`; matching = lowercase + leetspeak normalize → word-boundary list +
  collapsed-substring list (catches "f u c k", "5h1t", "b1tch"; passes "classic assistant").
  Client mirror `platform/lib/filter.js` (`window.CTFFilter`) gives instant kid-friendly
  rejections ("Our robots only deliver kind words! 🤖💙") — wired into board compose/replies/
  chat + onboarding/profile names. Verified: client blocks, DB blocks direct-API bypass,
  clean text flows. To extend the word list: edit BOTH the migration (new migration) and
  filter.js.
- **First cohort = KIDS ONLY (8–11).** Adult path hidden, NOT deleted (content/json/player
  all intact): home links → kids player directly, home tracks row kids-only, lessons +
  capstone choosers show adults dimmed "coming soon". To re-enable: restore the two chooser
  cards + home tracks/links. Jon reviewing Module 1 content next; expect feedback edits.

## Platform screens (06-09-2026)

- **Production config:** `platform/lib/config.js` is now COMMITTED (anon key is public-safe /
  RLS-guarded) so the live Netlify site connects. `config.example.js` stays as the template.
- **Composable avatar** (`platform/lib/avatar.js`, `window.CTFAvatar`): a friendly "buddy"
  from swappable parts (bg, color, face, accessory), original SVG, saved as JSON in
  `profiles.avatar` (jsonb). `profiles` gained `avatar, accent, tagline, onboarded` (migration
  `…113942_profile_customization`).
- **Onboarding** `platform/onboarding.html` — "Create your character" (name + avatar builder +
  Surprise me) → saves to Supabase via `CTFDB.updateProfile`, sets `onboarded`. New users land
  here. Verified: a built character persisted to `profiles.avatar` and reloaded on the profile.
- **Profile** `platform/profile.html` — Roblox-style: big avatar, name, tagline, badges (from
  `badges`), "Join a cohort" (calls `join_cohort` RPC), and an inline editor reusing the
  builder (`platform/profile.js` = `window.CTFBuilder`). Saves to Supabase + localStorage.
- **Cohort board** `platform/board.html` — **LIVE on Supabase (06-09-2026)**: posts,
  comments, reactions tables + RLS (migration `…221000_board.sql`, applied). Channels
  (announcements=staff-only post, general, show_tell, help), compose, emoji reactions,
  replies, member roster, join-cohort overlay (FUTURE26), example posts fill empty channels.
  Verified live: join → post → react → reply round-tripped under RLS.
- **PostgREST embed gotcha:** posts/comments/members FKs point at `auth.users`, NOT
  `profiles`, so `select("profiles:author_id(...)")` embedding FAILS. `ctf-db.js` does a
  second `profiles .in(id,…)` query and joins client-side. Keep this pattern (or repoint
  FKs at profiles in a future migration).
- **Home hub** `platform/index.html` — continue-learning tile (cloud progress %), profile
  card, board card, both track links. **New users auto-route to onboarding** (profile.
  onboarded=false → redirect). Root `/index.html` redirects to the platform home.
- **V1 DEMO STATE (client meeting 06-09):** home → onboarding → profile → board → lessons
  all live + persisting. Module 1 content final: kids 130 beats / adults 102, 17 image
  beats each (PD: Turing, ENIAC, Cajal, Ada Lovelace, Curiosity rover, Hubble deep field,
  NGC 4414 + 12 original SVGs). **Netlify site has Password Protection enabled** (401) —
  Jon's Netlify setting; fine for private demo, disable in Netlify → Site protection when
  ready for public.
- Note: the capstone OpenAI proxy is separate and unaffected.

## Durable Teaching Preferences

- Lead with the answer / the concept, then the example.
- Operator-grade, not generic CS tutoring.
- Prefer practical recommendations over neutral comparison tables.
- Tie every concept to a real work loop: emails, products, orders, inventory, transcripts,
  files, tickets, dashboards.

## Curriculum Architecture (decided 06-07-2026)

- **Two audience tracks per module**, same spine, different voice:
  - **Type A — Kids, ages 8–11**, first-time learners (wonder, analogies, short sentences).
  - **Type B — Adults new to AI**, casual ChatGPT awareness (respectful, real depth).
- **Module format: 2 hours = 12 ten-minute sprints**, one idea per sprint, each ending in a
  satisfying completion beat (focus the attention span, then "done, next").
  - Kids call sprints **Missions** → **Mission Complete!** card with a collectible **badge**
    + progress bar (Mission N of 12).
  - Adults call sprints **Sections** → **Section Complete** checkpoint (takeaways +
    reflection + next), professional, no gamification.
  - Tracks share the same 12-idea spine but order differs (kids: concepts first, history late
    & light; adults: history early as context).
- **Three build passes per module:** (1) full copy with inline `[INTERACTIVE]`/`[CAPSTONE]`
  markers → (2) embeddable interactive widgets for the HTML site → (3) capstone "big
  project" = a live **OpenAI API embedded in the HTML page** where learners *create and use*
  AI (prompts + settings like temperature). Capstone timing is flexible (can be a closing
  session after the 2-hour core).
- **Copy depth:** each sprint's teaching prose was expanded (~2X) to fill closer to a real
  10 minutes; interactive markers were left untouched for Pass 2.
- **Module 1 = "What Is AI?"** — both tracks' copy drafted in `curriculum/module-01-what-is-ai/`.
  This reset the original module roadmap (loops/transformers path is now teacher-reference
  in `00-concept-reference.md`, not the learner sequence).

## Module 1 status — all 3 passes complete (06-07-2026)

- **Pass 1 (copy):** ✅ both tracks, 12 sprints each, ~2X expanded.
- **Pass 2 (widgets):** ✅ `interactive/` — vanilla-JS engine (`ctf-widgets.js/css`),
  9 widget types (poll, sort, choice, nextword, attention, quiz, timeline, reveal, slider).
  Drop-in via `<div data-ctf-widget>`. All Module 1 markers map to an existing type →
  remaining work is JSON config only. Preview: `interactive/preview.html`.
- **Pass 3 (capstone):** ✅ `capstone/` — kids "Big Mission" + adults "Capstone" OpenAI
  sandbox. **Key stays server-side** via a proxy (`netlify/functions/ai.js`); browser calls
  `/api/ai`. Local testing via `server/dev-server.mjs` + gitignored `capstone/.env`.
  Default model `gpt-4o-mini`. Adults get a temperature dial.
- **Reusable infra:** the widget engine + capstone proxy are module-agnostic — future
  modules reuse them; only copy + JSON configs change.
- **Lesson experience = a full-screen PLAYER, not a scroll page** (decided 06-07-2026 — Jon
  rejected the long scroll page as overwhelming). `lessons/player.html?track=kids|adults`:
  one focused "beat" per screen, words trickle in, tap/Space/→ to continue. Beat types:
  title · text · quote · image · widget · complete · capstone. `lessons/build.mjs` GENERATES
  `lessons/content/{kids,adults}.json` (beats) from the markdown copy + widget configs +
  images — don't hand-edit JSON; edit sources and re-run `node lessons/build.mjs`. Player is
  track-agnostic (`player.js`/`player.css`, themes `track-kids`/`track-adults`); position
  persists to localStorage; respects reduced-motion. (Old scroll pages kids.html/adults.html
  + lesson.css were removed.)

## Images / media policy

- **No technical barrier to fetching images; the barrier is licensing.** Default to
  **public-domain / CC0** (Wikimedia Commons, NASA, Openverse, Unsplash) or **original
  generated art** (Firefly/Canva) or the brand's Lucide icons/SVG. Never scrape Google
  Images or embed "all rights reserved" media in the product.
- Module 1 images live in `curriculum/module-01-what-is-ai/assets/img/` (all public domain:
  Turing, ENIAC, Ramón y Cajal neuron, NASA galaxy). Record every image's source + license
  in that folder's `CREDITS.md`.
- **Original concept art:** `assets/art/*.svg` — 12 brand-styled SVG illustrations (one per
  mission concept), generated by `lessons/make-art.mjs` (edit the script + re-run to change
  them). Each mission gets an art beat (+ a PD photo where one fits). Geometric/diagrammatic
  SVG is the right register for this brand (not stock photos or generic AI raster art).

## Tooling / brand

- Design system installed as a **local Claude skill** at `.claude/skills/code-the-future-design/`
  (gitignored; canonical copy committed at repo root "Code the Future — Design System/").
  Widgets/capstone copy the design tokens so they're brand-faithful and embeddable anywhere.

## Curriculum Content Threads (still relevant)

- Teach Python + TypeScript + SQL together when the coding track begins.
- Core concepts: loops, conditionals, functions, APIs, JSON, CSVs → then the AI layer
  (agent loops, memory, tool use, stopping conditions, confidence thresholds, human
  exception handling, evals).

## Concepts Already Drafted (in source thread)

- Programming language landscape (Python, JS, TS, C++, Go, Rust, SQL).
- Looping in code and in AI agents.
- Transformers and attention.
- Transformer limits; post-transformer direction (hybrid systems, state-space models like
  Mamba, retrieval, persistent memory, tools, verifiers, test-time compute).

## Best Mental Models (reuse in lessons)

```text
Python is say what you mean.
JavaScript is make the web move.
TypeScript is make JavaScript safer at scale.
C++ is control the machine.
Go is ship reliable backend tools quickly.
Rust is C++ power with stricter safety.
SQL is ask structured business questions.
```

```text
Code handles the loop.
AI handles the judgment inside the loop.
Rules handle the guardrails.
Humans handle exceptions.
```

```text
Transformers turned language, code, images, and workflow instructions into a common
prediction problem that scales.

The model is becoming less like one brain in a box
and more like a reasoning engine inside a workflow system.
```
