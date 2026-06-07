# Curriculum

Teaching material for Code the Future. Source concepts come from the origin thread in
`../docs/source/codex-handoff/`; this folder turns them into lessons.

## Design rules

- Lead with the concept, then one concrete example.
- Every concept maps to a real loop (orders, files, emails, inventory, transcripts).
- Copy-paste clean code, commentary kept separate.
- Build order: loops → conditionals → functions → APIs → JSON → CSVs → the AI layer
  (agent loops, memory, tool use, stopping conditions, confidence thresholds, human
  exceptions, evals).

## Two tracks

Every module ships in two parallel versions, same spine, different voice:

- **Type A — Kids (ages 8–11):** first-time learners. Wonder, short sentences, vivid
  analogies.
- **Type B — Adults (new to AI):** know ChatGPT exists; want to actually understand it.
  Respectful, real depth, industry-relevant, never condescending.

## Per-module three-pass build

Each module is built in passes so we don't block copy on widgets:

1. **Pass 1 — Copy:** full lesson text for both tracks. Inline `[INTERACTIVE: …]` and
   `[CAPSTONE]` markers reserve space for later passes.
2. **Pass 2 — Interactive elements:** embeddable widgets for the HTML site, dropped into the
   `[INTERACTIVE]` markers.
3. **Pass 3 — Capstone:** an end-of-module big project — a live Claude/OpenAI API embed
   where learners manipulate what they've learned.

## Modules

| # | Module | Type A copy | Type B copy | Interactives | Capstone |
|---|--------|-------------|-------------|--------------|----------|
| 00 | Concept reference (teacher-facing) | — | — | — | — |
| 01 | [What Is AI?](module-01-what-is-ai/) | ✅ drafted | ✅ drafted | planned | planned |

> `00-concept-reference.md` is teacher-facing source material, not a learner module.
> Module topics beyond 01 are open until we lock the camp/platform arc (see `../MEMORY.md`).
