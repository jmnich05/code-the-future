# Module 1 — Assembled lesson pages

Full, branded HTML lessons that interleave the curriculum copy, the interactive widgets, and
public-domain images. These are the "real" learner-facing pages.

- `kids.html` — Type A (ages 8–11), all 12 Missions.
- `adults.html` — Type B (adults), all 12 Sections.
- `lesson.css` — reading layout + brand + completion cards + capstone CTA (`track-kids` /
  `track-adults` themes).
- `build.mjs` — **generator** (see below).

## These are generated — edit the sources, not the HTML

`kids.html` / `adults.html` are produced by `build.mjs` from:

1. the curriculum copy — `../type-a-kids.md`, `../type-b-adults.md`
2. the widget configs — reused from `../interactive/preview-kids.html` & `preview-adults.html`
   (injected at each `[INTERACTIVE]` marker, in order)
3. public-domain images — `../assets/img/` (placed by section; see `assets/img/CREDITS.md`)

Regenerate any time the copy or configs change:

```
cd curriculum/module-01-what-is-ai
node lessons/build.mjs
```

Requires Node 18+. No dependencies.

## Preview locally

Serve the module folder so the relative paths (`../interactive`, `../assets`, `../capstone`)
resolve, e.g.:

```
python3 -m http.server 8141 --directory curriculum/module-01-what-is-ai
# then open http://localhost:8141/lessons/kids.html
```

## Images

All images are public domain (Turing, ENIAC, a Ramón y Cajal neuron drawing, a NASA galaxy),
sourced from Wikimedia Commons. See `../assets/img/CREDITS.md` and the sourcing policy there
before adding more — default to public-domain / CC0 / original generated art.
