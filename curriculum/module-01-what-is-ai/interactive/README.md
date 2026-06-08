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
| 4 | train your mini-AI | `sort`/`choice` | ▱ planned |
| 5 | pixel reveal | (custom image) | ▱ planned |
| 6 | guess the next word | `nextword` | ✅ built |
| 7 | what does "it" mean | `attention` | ✅ built |
| 8 | brain vs neural network | `choice` | ▱ planned |
| 9 | tap-through timeline | (timeline) | ▱ planned |
| 10 | is the AI right? | `choice` | ▱ planned |
| 11 | imagine your future | `poll` | ▱ planned |
| 12 | end-of-module quiz | `quiz` | ✅ built |

### Type B — Adults (Sections)
Same engine; copy/tone swapped. `poll` (S1 self-assessment), `choice` (S2/S3 rules-vs-
examples, S6 compare, S11 spot-the-limitation), `nextword` (S8 predict), `quiz` (S12).
Timeline (S4/S5), weight-tuning (S7), and confidence-meter (S9) need two small custom
widget types — planned next.

## Still to build (new widget types)

- `timeline` — scrollable/tap-through milestones (kids M9, adults S4/S5).
- `reveal` — progressive un-blur of an image (kids M5 pixel reveal).
- `slider` — drag a value and watch output change (adults S7 weight-tuning; S9 confidence).

These are additive — existing widgets and configs don't change.
