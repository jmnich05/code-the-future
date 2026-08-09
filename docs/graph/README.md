# Code the Future Growth Graph

This directory is the operator-facing specification for `growth_portfolio_shadow_v1`.

Read in this order:

1. [`../../PROJECT_CHARTER.md`](../../PROJECT_CHARTER.md) — authority, privacy, completion, and reliability policy.
2. [`60_DAY_SCORECARD.md`](60_DAY_SCORECARD.md) — the three primary outcomes, drivers, guardrails, baseline requirements, and operating cadence.
3. [`BUILD_BRIEF.md`](BUILD_BRIEF.md) — graph topology, node contracts, state, persistence, failure routes, and cutover gates.
4. [`EVAL_BANK.md`](EVAL_BANK.md) — executable and trajectory-level regression cases.
5. [`SOCIAL_IMPORT_PLAN.md`](SOCIAL_IMPORT_PLAN.md) — reconciliation of the current Meta/Instagram work without committing raw media or inventing publication proof.
6. [`SHADOW_RUNBOOK.md`](SHADOW_RUNBOOK.md) — local setup, validation, synthetic run, resume, and inspection commands.
7. [`OPERATOR_RUNBOOK.md`](OPERATOR_RUNBOOK.md) — the stable status, run,
   catch-up, resume, review, failure, and doctor vocabulary used from Codex.

The TypeScript runtime lives under [`../../ops/growth-graph/`](../../ops/growth-graph/). Runtime state is local and ignored under `.state/`; `PROJECT_STATE.md` and the HTML canvas are generated read-only projections.

Shadow v1 has no external write adapters. A human-review record means “ready for Jon to inspect,” not approved, published, sent, spent, merged, deployed, or completed in an external system.
