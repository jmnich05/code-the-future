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

## Curriculum Direction

- Teach Python + TypeScript + SQL together.
- First core concepts: loops, conditionals, functions, APIs, JSON, CSVs.
- Then the AI layer: agent loops, memory, tool use, stopping conditions, confidence
  thresholds, human exception handling, evals.

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
