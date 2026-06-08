# Module 1 — Interactive Widgets (Pass 2)

Embeddable, brand-faithful lesson widgets for the Code the Future HTML site. Built with the
design-system tokens (copied into `ctf-widgets.css` so a widget works dropped into **any**
page — no dependency on the design-system folder path).

## Files

- `ctf-widgets.css` — styles + brand token subset (Space Grotesk / Plus Jakarta / JetBrains
  Mono, electric-blue/teal/coral palette, rounded cards, soft shadows). Scoped under `.ctf`.
- `ctf-widgets.js` — the engine. Hydrates any `[data-ctf-widget]` element from a JSON config.
- `preview.html` — open this in a browser to play the six kids' widgets below.

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

## Coverage status — Module 1

Six built (in `preview.html`); the rest are config-only additions using the same six types.

### Type A — Kids (Missions)
| Mission | Marker | Type | Status |
|--------:|--------|------|--------|
| 1 | warm-up | `poll` | ✅ built |
| 2 | follows-rules-vs-learns | `sort` | ✅ built |
| 3 | spot the pattern | `choice` | ✅ built |
| 4 | train your mini-AI | `sort`/`choice` | ▱ config-only |
| 5 | pixel reveal | `reveal` | ✅ built |
| 6 | guess the next word | `nextword` | ✅ built |
| 7 | what does "it" mean | `attention` | ✅ built |
| 8 | brain vs neural network | `choice` | ▱ config-only |
| 9 | tap-through timeline | `timeline` | ✅ built |
| 10 | is the AI right? | `choice` | ▱ config-only |
| 11 | imagine your future | `poll` | ▱ config-only |
| 12 | end-of-module quiz | `quiz` | ✅ built |

> "config-only" = the widget *type* exists and is proven; that mission just needs its JSON
> config written (no new code).

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
