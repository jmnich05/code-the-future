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

## Platform Backend — Supabase (intended; build NEXT SESSION)

- **Decision:** Supabase is the intended platform backend. Confirmed by Jon 06-07-2026;
  scheduled to tackle the Supabase project **tomorrow** (next session).
- **Current state:** the repo has **no Supabase connection** of any kind (no client, keys,
  config, or package.json). The only live backend is the capstone's OpenAI proxy
  (`capstone/netlify.toml` + `.env`). Learner progress today saves **only to browser
  `localStorage`** (the widget engine's `ctf:` namespace). Nothing carried over from the
  Codex transfer was DB-connected — that bundle was markdown only.
- **Goal:** replace localStorage with Supabase-backed persistence — accounts/auth, saved
  lesson progress + badges across devices, and cohorts (e.g., "Summer 2026"). Likely also
  the home for the eventual platform proper.
- **Touch points when we build:** the widget engine's progress save/load (`ctf-widgets.js`,
  `ctf:` keys) and the capstone are the natural integration points to swap to Supabase.

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
