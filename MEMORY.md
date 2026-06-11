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

## Mission Control + notifications (06-11-2026)

- **Staff console at `/platform/admin.html`** ("Mission Control", not linked from nav —
  staff bookmark it). Gated by `cohort_members.role='staff'`; learners see a friendly
  lock screen. Shows: summary cards, per-kid roster (mission via position→mission map
  fetched from kids.json mirroring player.js flatten(), progress bar, badge art, last
  active), stuck signals (⚪ not started / 🔴 quiet 3d+ / 🟡 behind unlocked part),
  DM inbox with reply-needed flags, unanswered Help posts (answered = staff commented).
- **Staff roles state**: Jon's "Mr. Jon" account (977c4246…) promoted to staff via
  Management API (`POST /v1/projects/{ref}/database/query` with SUPABASE_ACCESS_TOKEN —
  the way to run ad-hoc SQL). Kenya: have her onboard + join FUTURE26, then promote her
  user_id the same way. Seed cohort had NO staff originally (seeded without owner).
- **Notification pipeline (LIVE — Slack confirmed 06-11)**: Supabase trigger (pg_net) on
  staff DMs + help-channel posts → POST https://codethefuture.net/api/notify with
  x-ctf-secret → notify.js → Slack webhook (SLACK_WEBHOOK_URL env var, set) and/or
  Resend email (RESEND_API_KEY+NOTIFY_EMAIL, unset). Also supports SLACK_BOT_TOKEN+
  SLACK_CHANNEL as an alternative path. Trigger swallows exceptions so chat never
  breaks. Secret lives in the migration (private repo) + NOTIFY_SECRET Netlify env var.
- **Netlify gotcha**: function env vars are baked at build, and unchanged function
  bundles are CACHED across deploys — after changing NOTIFY_*/any function env, touch
  the function file so its hash changes, or the old env persists. Also: MCP env upsert
  with `envVarIsSecret:true` + scoped silently no-ops — use scopes "all", not secret.
- Debug webhook deliveries: `select * from net._http_response order by created desc`.

## Sales website (06-10-2026, `sales-website` branch / PR #3)

- **Root `index.html` is now the public sales/SEO site**; the kid platform is untouched at
  `/platform/` (sales nav "Log In" → `/platform/`). Was a meta-redirect before — merging the
  PR changes what production root serves.
- **Video slot:** hero has a 16:9 film panel; set `FILM_URL` in the EDIT-ME config block at
  the bottom of index.html (YouTube embed URL or hosted .mp4) when Jon records his film.
- **Cohort cards are placeholder data** in the same EDIT-ME block (`COHORTS` array): Session
  A July 13–24, Session B July 27–Aug 7, Fall AI Club waitlist. Jon edits dates/seats there.
- **Lead capture = Netlify Forms** (form name `cohort-interest`, honeypot, AJAX success
  state). Submissions land in Netlify → Forms; no backend, no Supabase table.
- SEO: meta/OG/canonical + Organization JSON-LD. Indexing blocked until Jon removes the
  Netlify password protection.
- `scripts/dev.mjs` root path now serves `/index.html` (sales) to match production.
- Claims kept honest: psychologist unnamed ("helps design & review"), library unnamed
  ("public library in Louisville"), no fabricated stats or testimonials.

## Experience round (06-10/11 night): new games, lo-fi studio, drip pacing

- **4 new widget types** (kids now has 15 widgets / 152 steps; home TOTAL updated):
  - **draw** (M5b): canvas drawing → REAL gpt-4o-mini VISION guess (`/api/ai` now accepts
    `image` data-URL, both netlify fn + dev server; <2MB, detail:low). Verified live — AI
    guessed a programmatic house drawing ("Is it a cozy little house?").
  - **wordchain** (M6, replaced nextword config): build a sentence picking from 3 options
    w/ probability bars; ending reflects avg likelihood (careful vs creativity-dial-up).
  - **order** (M4b): tap steps into sequence (collect→label→train→test→use).
  - **neuron** (M8a): tap edges to strengthen (weights), limited points, send signal →
    output lights if a complete path exists. Fail gives coaching.
  - Second `[INTERACTIVE]` markers added to M4/M5/M8 in type-a-kids.md (marker order must
    match preview-kids.html block order).
- **Lo-fi Study Beats** (`lessons/music.js`, `window.CTFMusic`): 100% PROCEDURAL Web Audio
  (kick/snare/hat patterns + detuned triangle chord pads + vinyl crackle + rain noise) — no
  audio files, no licensing. 🎵 dock in player: play/pause, 3 vibes (chill/space/sunny),
  3 tempos, layer toggles, **🎲 Remix** (re-seeds patterns — framed as generative AI).
  Music **ducks under TTS**. Prefs persist (never autoplays). Verified.
- **Drip pacing — Jon's anti-binge ask:** PARTS = M1-4 (+0d), M5-8 (+2d), M9-12 (+4d);
  anchor = `cohorts.starts_on` (pilot set 2026-06-10 via mgmt API; myCohorts now selects
  starts_on) else local `ctf:firstplay`. Player: forward-gate (Continue → friendly lock
  screen "Part 2 unlocks on Friday!" + replay/home suggestions), resume clamps OUT of
  locked regions (incl. cloud resume; capstone counts as Mission 12 — was a bug). Home tile
  clamps to last unlocked mission + " · Part N unlocks {Weekday}!" note. **Bypasses:**
  cohort staff role, or `?unlock=all` (sets `ctf:unlockall`) — give Jon this for demos.
  Verified: reclamp, lock screen, home note, bypass.

## Polish round (06-11-2026): audio toggle, art badges, gear rewards, living avatars

- **Audio learning toggle** replaced the top-bar 🔊: bottom-bar pill "🔈 Turn on audio
  learning" ↔ "🔊 Audio learning ON" — when ON it auto-reads EVERY beat on render
  (continuous mode), persisted `ctf:audio`. Image/art beats no-op. Verified live.
- **Generated badge art:** `scripts/gen-badges.mjs` made 12 themed gpt-image-1 badges
  (transparent PNG, kid-sticker style, per-mission themes) → `platform/assets/badges/
  badge-N.png` (sips'd to 512px, ~270KB ea). `CTFBadge.render` = <img> with hidden SVG
  fallback (onerror). Gotchas: gpt-image rate-limits per minute (single worker + 12s
  spacing + retry on 429/500); rerun script to regenerate (skips existing files).
- **Gear rewards:** every mission unlocks an avatar accessory — `CTFAvatar.REWARDS`
  (m1 cape … m12 laurel; 12 new SVG accessories, cape/jetpack render behind body).
  Unlocks derive from badge keys (`unlockedFromBadges`) — no schema change. Builder
  (profile.js) shows 🔒 swatches + "unlocks when you finish Mission N!" hint; player
  completion shows "🎁 New gear unlocked: X". Onboarding = base 6 only.
- **Living avatars:** avatar.js v2 wraps body in `.av-all` (idle bob) and eyes in
  `.av-eyes` (periodic blink); hover = excited wiggle. Pure CSS in app.css,
  reduced-motion aware. All avatars everywhere are now animated.

## Night build #2 (06-10-2026 late): DMs, badge medals, read-to-me

- **DMs (Roblox-style):** `messages.recipient_id` (null = cohort chat) — migration
  `…020000_dms.sql` applied; RLS lets author+recipient+staff read. Board: clicking any
  presence bubble or roster member opens a **profile popover** (avatar, name, online dot,
  "💬 Chat with X") → DM thread with tabs (👥 Everyone | per-kid). Own messages render
  **optimistically** (realtime callback skips author===me — realtime can lag ~seconds).
  Home presence bubbles link to `board.html?dm=<uid>#chat` (self → profile). "Live chat"
  pill removed. Verified: DM persists, threads isolated from Everyone, instant echo.
- **Badge medallions:** `platform/lib/badge.js` (`window.CTFBadge`) — original SVG medals
  (scalloped gradient ring per-mission color, night core, star, M#; M12 = 12/12 finale) +
  canonical kids badge NAMES. Player complete-beats show a medal pop animation + **confetti
  burst** (reduced-motion aware); profile shows a **badge case** grid. Edge case fixed:
  resuming directly onto a complete beat before DB init now awards on ctfdb:ready.
- **Read to me (accessibility):** `/api/tts` ElevenLabs proxy (netlify/functions/tts.js +
  dev server route; model eleven_turbo_v2_5, default voice Rachel, override via
  ELEVENLABS_VOICE_ID). Player top bar 🔊 button reads the current beat aloud (⏹ stops,
  auto-stops on advance; 🔇 + friendly tooltip if unconfigured). **Jon must add
  ELEVENLABS_API_KEY to capstone/.env (local) + Netlify env vars (prod).** Untested with a
  real key as of this writing.

- **Video breaks:** 6 Code.org "How AI Works" videos (IDs verified via YouTube oEmbed)
  embedded as `video` beats via `VIDEO_MAP` in `lessons/build.mjs` — inserted right before
  each mapped mission's widget. Missions 2 (intro), 4 (machine learning), 5 (computer
  vision), 6 (chatbots/LLMs), 8 (neural nets), 10 (training data & bias). Embeds use
  **youtube-nocookie.com** (privacy mode, kids product). To add videos: verify ID via
  oEmbed (`https://www.youtube.com/oembed?url=<encoded watch url>`), add to VIDEO_MAP,
  rebuild.
- **Interactives upgraded (Jon: "less survey-y, more depth"):** 2 new widget types —
  **trainer** (teach a mini-AI by labeling examples; it copies your teaching, mistakes
  included → training-data lesson, M4) and **match** (pair cards, M8 brain↔AI). `nextword`
  + `attention` now support `rounds:[…]` (M6 ×3, M7 ×2 incl. trophy/suitcase). M2 sort
  expanded to 8 trickier items; M3 + M10 became 3-question quizzes; M12 final quiz now 6
  questions. All verified in the player (trainer 3/3 + badge, match reject+complete,
  rounds advance). Kids total steps now **149** (home progress bar updated).

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
