# AGENTS.md

## Who I Am

Louisville, KY. Operator, not delegator. I implement what we discuss.

Day job: Pappy & Company, premium bourbon-inspired lifestyle and gifting brand on Shopify
Plus. I run e-commerce, ops, warehouse, marketing tech, analytics, wholesale, and product
strategy.

Side venture: Animo, agentic AI consulting for values-driven teams. Operator-built systems
on the Anthropic stack. Tagline: Agentic AI for values-driven teams. Domain:
animoplatform.net. Sage green identity with a leaf/sprout mark.

New project (this repo): **Code the Future** — a platform and in-person summer camp (2026)
teaching kids AI literacy and modern coding, with special attention to how AI is changing
software development.

Personal: Partner Michelle Bornstein. Daughter Charlotte. Son Liam. Charlotte's mom is Sarah.

## Tech Stack

Pappy & Co:

- Shopify Plus, Klaviyo, Attentive, Cin7 Core, Gorgias, GA4, Shopify Flow, Liquid
- Google Workspace, Recharge / Skio subscription work, Bundles app, ShipStation
- Inventory Planner, Xero, Authorize.net, Avalara tobacco tax
- Adobe Creative Suite and Firefly, Claude Teams

Animo:

- Claude Sonnet / Opus, Claude Code, Cowork, Claude Agent SDK, MCP
- Supabase, Google Workspace, Python / TypeScript glue, Netlify

Code the Future (proposed — confirm before scaffolding):

- Teaching stack: Python + TypeScript + SQL
- Likely platform stack: TypeScript web app, Supabase, Netlify (matches Animo muscle memory)

Personal agents in build:

- Frankie Fresh: scheduling agent merging Jon and Michelle's calendar via Bee, iMessage,
  and Google Calendar.
- Jonny Money: Capital One CSV to daily finance briefing toward Sweden trip and $5K
  savings goals.

## Current Context

- Pappy 2026 targets: 30% revenue growth, $1M wholesale, cigar subscription launch, one
  storefront for wholesale, custom tax engine, and new credit card processor for Amex and
  Discover.
- Drew Estate cigar partnership negotiations.
- Louise's purchase of 1217 W Main warehouse.
- Avalara tobacco-tax phased rollout, Indiana and Ohio first.
- Claude Teams rollout to Pappy leadership.
- Animo Charta engagement: weekly sessions, pivot to Workspace agents.
- Code the Future: standing up platform + summer camp curriculum for summer 2026.
- Frankie Fresh and Jonny Money personal agent builds.
- Sweden trip with Michelle in late August 2026.

## Communication Preferences

- Direct. Skip preamble. Lead with the answer.
- Medium length default.
- Give concrete drafts to react to.
- Technical depth assumed. Do not dumb things down.
- Recommendations over matrices.
- Targeted edits stay targeted.

## Formatting Preferences

- Bullets for lists. Prose for flow. Do not over-format short answers.
- For deliverables, provide clean copy-paste drafts separated from commentary.
- For code/config, provide exact diffs or exact files.
- Fahrenheit, imperial, US context by default.
- Dates in writing: MM-DD-YYYY. File names: ISO dates.

## Growth Graph Operator Interaction

Codex is the operator console for the local growth graph. Translate Jon's
project-level intent into the supported cockpit command before reaching for raw
graph commands:

- "What happened?" or "Is Code the Future current?" -> run
  `npm run graph:ops -- status` from `ops/growth-graph/`.
- "Show me run X" -> run
  `npm run graph:ops -- status --run-id EXACT_RUN_ID`.
- "Run it now" -> require a current immutable capture, then run
  `npm run graph:ops -- run-now --capture ... --evidence-root ...`.
- "Catch up the cycle my powered-off Mac missed" -> identify only the latest
  eligible scheduled slot, require a current immutable capture, then run
  `npm run graph:ops -- catch-up --slot ... --capture ... --evidence-root ...`.
- "Resume/recover" -> inspect status and run
  `npm run graph:ops -- resume --run-id EXACT_RUN_ID --evidence-root ...` with
  the original manifest flags. Never substitute a new run ID or capture.
- "What needs my review?" -> run `npm run graph:ops -- reviews`.
- "Show me review X" -> run
  `npm run graph:ops -- reviews --review-id EXACT_REVIEW_ID`; inspection never
  records approval or authorizes execution.
- "Why did it fail?" -> run `npm run graph:ops -- explain-failure`, optionally
  with `--run-id EXACT_RUN_ID` for one historical run.
- "Is the local system healthy?" -> run `npm run graph:ops -- doctor`.

Routine operations use this vocabulary. Changes to goals, KPI definitions,
freshness, privacy, sources, prompts, nodes, models, repair budgets, approval
authority, or external adapters are versioned code/policy changes with tests and
human-reviewed Git work; they are never cockpit overrides.

The cockpit is a reconciler and dispatcher, not a new source of truth. Preserve
this precedence: verified ledger transaction/readback, exact checkpoint,
immutable artifacts, then generated `PROJECT_STATE.md` and the read-only canvas.
An older pending review does not freeze a later fresh capture, but it never
implies approval. This shadow graph and cockpit cannot publish, send, spend,
merge, deploy, or execute an approval package. Keep every existing human gate.
Any hash-verified external, delivery, message, application, ATS, publish, send,
merge, deploy, or non-draft action marker anywhere in the ledger is global
`uncertain_external_action`: surface that exact run and stop all mutation until
human reconciliation. A run selector must never hide that boundary.
