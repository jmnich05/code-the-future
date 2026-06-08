# Module 1 — Lesson player

The learner experience: a **full-screen, paced lesson player**. One focused "beat" per
screen, words trickle in, tap / Space / → to continue. Built for busy brains — no long
scroll, no wall of text, one idea at a time.

## Try it

Serve the module folder (so `../interactive`, `../assets`, `../capstone` resolve), then open
the chooser:

```
python3 -m http.server 8141 --directory curriculum/module-01-what-is-ai
# open http://localhost:8141/lessons/index.html
#   kids   → player.html?track=kids
#   adults → player.html?track=adults
```

`#restart` on the URL ignores saved progress and starts at the beginning.

## Files

| File | Role |
|------|------|
| `index.html` | Track chooser (kids / adults) |
| `player.html` | The player shell (loads css/js + the widget engine) |
| `player.css` | Full-screen player styling; `track-kids` / `track-adults` themes |
| `player.js` | Engine — flattens beats into screens, reveals words, nav, progress, persistence |
| `build.mjs` | **Generator** → `content/kids.json`, `content/adults.json` |
| `content/*.json` | Generated beat data the player loads at runtime |

## Beats

Each mission/section is split into **beats**, one per screen:

`title` (chapter card) · `text` (one idea, words trickle in) · `quote` (dramatic dark
callout) · `list` · `image` (public-domain figure) · `widget` (an interactive) · `complete`
(badge/checkpoint card) · `capstone` (the "use AI" CTA).

## Generated — edit sources, not the JSON

`content/*.json` is produced by `build.mjs` from:

1. curriculum copy — `../type-a-kids.md`, `../type-b-adults.md`
2. widget configs — reused from `../interactive/preview-kids.html` & `preview-adults.html`
3. images — `../assets/img/` (see `assets/img/CREDITS.md`)

Regenerate after any copy/config change:

```
cd curriculum/module-01-what-is-ai && node lessons/build.mjs
```

Node 18+, no dependencies.

## Controls

- **Continue / tap empty space / Space / Enter / →** — next beat (or skip the trickle).
- **← / Back** — previous beat.
- Progress + current Mission/Section shown top chrome; position saved to `localStorage`.
- Respects `prefers-reduced-motion` (reveals instantly).
