# CLAUDE.md — Code the Future

Project context for Claude Code working in this repo. Read `AGENTS.md` for who I am
and how I like to work; read `MEMORY.md` for durable decisions; read
`docs/source/codex-handoff/` for the original material this project grew out of.

## What This Is

**Code the Future** is two things that share one mission:

1. **A platform** — a web product for learning AI and modern coding, aimed at kids and
   beginners, with an operator/builder bent (real tools, real workflows, not toy CS).
2. **An in-person summer camp** — a hands-on summer program (2026) where kids learn what
   AI is, how to use it well, and how it is reshaping coding and software development.

The throughline: teach AI literacy and coding *together*, the way the work actually
happens now — AI as a reasoning engine inside a workflow, with humans handling judgment
and exceptions.

## Why It Exists

This grew out of a learning thread (preserved in `docs/source/codex-handoff/`) that walked
from "what are programming languages" → loops → transformers → what comes after
transformers. The teaching style that worked there is the style this project should keep:

- Lead with the answer / the concept, then the example.
- Tie every concept to a real loop: emails, products, orders, inventory, transcripts,
  files, tickets, dashboards.
- Applied technical learning, not generic computer-science tutoring.

## Pedagogical Stance

- **Core stack to teach:** Python + TypeScript + SQL. This trio covers AI agents, web,
  APIs, automation, analytics, and internal tools — the operator surface area.
- **Core concepts, in order:** loops, conditionals, functions, APIs, JSON, CSVs — then
  the AI layer: agent loops, memory, tool use, stopping conditions, confidence
  thresholds, human exception handling, evals.
- **Mental model the camp sells:** *Code handles the loop. AI handles the judgment inside
  the loop. Rules handle the guardrails. Humans handle exceptions.*

## Repo Layout

```
CLAUDE.md                     # this file — project orientation
AGENTS.md                     # who Jon is, tech stack, comms + formatting prefs
MEMORY.md                     # durable decisions and learning thread
README.md                     # human-facing project overview
curriculum/                   # teaching material (lessons, exercises, mental models)
docs/
  source/codex-handoff/       # original Codex bundle this project started from (do not rewrite)
```

## How To Work Here

- This is an early-stage project folder. When adding code, decide and record the stack in
  `MEMORY.md` before scaffolding so it stays consistent.
- Keep curriculum content copy-paste clean and separated from commentary (see formatting
  prefs in `AGENTS.md`).
- Preserve `docs/source/` as-is — it's the origin record, not a working doc.
