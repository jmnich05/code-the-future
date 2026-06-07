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
