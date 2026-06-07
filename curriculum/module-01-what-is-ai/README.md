# Module 1 — What Is AI?

The opening module for both Code the Future tracks. Goal: take someone who has never
really thought about AI and leave them understanding what it is, how we got here, why it's
genuinely new, how it loosely echoes the human mind, how it learns patterns (including from
images) — and excited about the future they're about to live in.

## Tracks

- **Type A — Kids (ages 8–11):** [`type-a-kids.md`](type-a-kids.md). First-ever exposure.
  Wonder, short sentences, vivid analogies, "you're the first generation."
- **Type B — Adults (new to AI):** [`type-b-adults.md`](type-b-adults.md). Knows ChatGPT
  exists, understands text/image generation at a surface level. Real history, industry +
  medicine transformation, respectful and exciting — not a textbook.

## Format: a 2-hour module in 12 ten-minute sprints

Each module is a **2-hour experience split into 12 ten-minute units**, one focused idea per
unit, each ending in a satisfying completion beat that makes the learner feel *"done — on to
the next."*

- **Type A (kids):** units are **Missions**. Each ends with a **Mission Complete!** card — a
  collectible **badge**, a one-line win, and a progress bar (Mission N of 12). All 12 badges
  = module complete, then the "Big Mission" capstone.
- **Type B (adults):** units are **Sections**. Each ends with a **Section Complete**
  checkpoint — key takeaways, a short reflection prompt, and what's next. Professional, no
  gamification.

## Shared 12-unit spine

Both tracks follow the same arc so the site, navigation, and pacing stay parallel:

| # | Kids (Mission) | Adults (Section) |
|---|----------------|------------------|
| 1 | Welcome, Future Builder | You've Already Met AI |
| 2 | Meet AI: What Even Is It? | What AI Actually Is |
| 3 | How You Learned What a Dog Is | From Rules to Learning: Why It Matters |
| 4 | AI Learns the Same Way You Do | The 70-Year Story, Part 1 |
| 5 | Teaching a Computer to SEE | The 70-Year Story, Part 2 |
| 6 | How AI Reads Words | Why This Is Different From Anything Before |
| 7 | The Attention Trick | How It Works, Pt 1: Brain Inspiration |
| 8 | Is AI Like a Brain? | How It Works, Pt 2: Attention & Prediction |
| 9 | The Story of AI | Learning to See |
| 10 | What AI Is Great At (and Not) | The Transformation Ahead |
| 11 | The Future Is Yours | Your Place in It |
| 12 | You Did It! (recap + celebrate) | Consolidation (recap) |

The two tracks intentionally diverge in *ordering* (kids learn the concepts first, history
late and light; adults get history early as context) but cover the same core ideas and end
the same way: recap → capstone.

## Three-pass build plan

1. **Pass 1 — Copy (done in this pass):** the full lesson words for both tracks.
2. **Pass 2 — Interactive elements:** slot into the inline `[INTERACTIVE: …]` markers. These
   are the embeddable widgets for the HTML site (quizzes, sliders, pattern-matching demos,
   reveal cards, etc.).
3. **Pass 3 — Capstone:** the end-of-module big project marked `[CAPSTONE]` — a live **OpenAI
   API embedded directly in the HTML page** where learners *create and use* AI themselves
   (write prompts, adjust settings like temperature, watch next-token prediction happen).

Placeholders are intentionally lightweight in the copy so Pass 2/3 know where to land
without rewriting prose.

## Format notes

- **2 hours total = 12 × ~10-minute units**, plus the capstone (timing flexible; can run as a
  closing session).
- Each unit's completion block is plain markdown in Pass 1 (badge/progress for kids,
  checkpoint for adults); Pass 2 styles these into real UI on the HTML site.
- Copy is written to be read aloud (camp) or read on-screen (platform).
