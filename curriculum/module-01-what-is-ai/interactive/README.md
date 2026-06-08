# Module 1 — Interactive Widgets (Pass 2)

Embeddable, brand-faithful lesson widgets for the Code the Future HTML site. Built with the
design-system tokens (copied into `ctf-widgets.css` so a widget works dropped into **any**
page — no dependency on the design-system folder path).

## Files

- `ctf-widgets.css` — styles + brand token subset (Space Grotesk / Plus Jakarta / JetBrains
  Mono, electric-blue/teal/coral palette, rounded cards, soft shadows). Scoped under `.ctf`.
- `ctf-widgets.js` — the engine. Hydrates any `[data-ctf-widget]` element from a JSON config.
- `preview.html` — index linking the two complete previews below.
- `preview-kids.html` — all 12 kids Missions, configured & playable.
- `preview-adults.html` — all 12 adult Sections, configured & playable.

## How to embed

```html
<link rel="stylesheet" href="ctf-widgets.css">

<div class="ctf">
  <div data-ctf-widget="choice" data-ctf-id="kids-m3-pattern">
    <script type="application/json">{ "title": "…", "options": ["…"], "answer": 1 }</script>
  </div>
</div>

<script src="ctf-widgets.js"></script>
```

- `data-ctf-widget` = widget type. `data-ctf-id` = unique id (used to save progress/answers
  in `localStorage` under the `ctf:` namespace).
- The engine auto-hydrates on load. Call `CTFWidgets.init()` after injecting widgets
  dynamically, or `CTFWidgets.reset()` to clear saved progress.

## Widget types

| Type | What it does | Used for |
|------|--------------|----------|
| `poll` | Pick an option and/or type an answer; saves it; can be revisited later | warm-ups, self-assessment |
| `sort` | Tap each item into the correct bucket; completes when all correct | classification ("rules vs learns") |
| `choice` | One multiple-choice question with feedback + explanation | spot-the-pattern, trust/verify, compare |
| `nextword` | Learner predicts the next word, then reveals common answers | "how AI reads" |
| `attention` | Click which earlier word a highlighted word refers to | the attention trick |
| `quiz` | Several scored MC questions; can `revisit` a saved `poll` answer | end-of-module checks |

> **Interaction note:** `sort` uses tap-to-classify (each item offers the bucket buttons)
> rather than HTML5 drag — far more reliable on tablets/touch, which is the kids' context.
> Drag can be layered on later without changing the config format.

## Coverage status — Module 1 · ALL 24 CONFIGURED ✅

Both tracks are fully authored & playable (`preview-kids.html`, `preview-adults.html`).
Every `data-ctf-id` below is the exact embeddable block — copy it into the lesson page.

### Type A — Kids (Missions) — 12/12 ✅
| # | Marker | Type | Widget id |
|--:|--------|------|-----------|
| 1 | warm-up | `poll` | `kids-m1-warmup` |
| 2 | rules vs. learns | `sort` | `kids-m2-sort` |
| 3 | spot the pattern | `choice` | `kids-m3-pattern` |
| 4 | good examples in | `choice` | `kids-m4-training` |
| 5 | pixel reveal | `reveal` | `kids-m5-reveal` |
| 6 | guess the next word | `nextword` | `kids-m6-nextword` |
| 7 | what does "it" mean | `attention` | `kids-m7-attention` |
| 8 | brain or machine? | `choice` | `kids-m8-brain` |
| 9 | the story of AI | `timeline` | `kids-m9-timeline` |
| 10 | should you trust it? | `choice` | `kids-m10-trust` |
| 11 | what will you build? | `poll` | `kids-m11-future` |
| 12 | end-of-module quiz | `quiz` | `kids-m12-quiz` |

### Type B — Adults (Sections) — 12/12 ✅
| # | Marker | Type | Widget id |
|--:|--------|------|-----------|
| 1 | self-check | `poll` | `adults-s1-selfcheck` |
| 2 | rules vs. examples | `choice` | `adults-s2-rules` |
| 3 | generalization | `choice` | `adults-s3-generalize` |
| 4 | history part 1 | `timeline` | `adults-s4-history1` |
| 5 | history part 2 | `timeline` | `adults-s5-history2` |
| 6 | better analogy | `choice` | `adults-s6-different` |
| 7 | nudge a weight | `slider` | `adults-s7-weights` |
| 8 | predict the next token | `nextword` | `adults-s8-predict` |
| 9 | confidence meter | `slider` | `adults-s9-confidence` |
| 10 | where would you point it? | `poll` | `adults-s10-point` |
| 11 | spot the limitation | `choice` | `adults-s11-limitation` |
| 12 | consolidation quiz | `quiz` | `adults-s12-quiz` |

### Type B — Adults (Sections)
Same engine; copy/tone swapped. All nine widget types are now built, so every adult Section
is config-only: `poll` (S1 self-assessment), `choice` (S2/S3 rules-vs-examples, S6 compare,
S11 spot-the-limitation), `timeline` (S4/S5 history), `slider` (S7 weight-tuning, S9
confidence — demoed in `preview.html`), `nextword` (S8 predict), `quiz` (S12).

## Widget types — all 9 built ✅

`poll · sort · choice · nextword · attention · quiz · timeline · reveal · slider`

Every Module 1 marker (both tracks) maps to one of these. Remaining work is **config only**
— writing each marker's JSON — plus the **capstone** (separate; see `../capstone/`). No new
widget code is required.
