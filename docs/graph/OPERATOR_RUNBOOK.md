# Code the Future Growth Graph — Operator Runbook

Updated: 08-09-2026

`graph:ops` is the supported local cockpit for `growth_portfolio_shadow_v1`.
It reconciles canonical ledger/checkpoint state and dispatches the existing
capture-driven graph. It is not a scheduler, source collector, approval store,
publisher, sender, deployer, or second state authority.

## Mental model

- Codex is the operator console.
- A scheduler or Jon supplies intent and, for a new cycle, a prepared immutable
  capture bundle.
- SQLite ledger transactions and verified readback are canonical completed
  state. LangGraph checkpoints are canonical interrupted state.
- Immutable run artifacts support the ledger. `PROJECT_STATE.md` and the HTML
  canvas are read-only projections.
- Every invocation returns one redacted `graph-operator.result.v1` JSON object.
  The default is indented for human inspection; `--json` emits compact JSON.
- `operatorCanExecute` is always `false`. A review is not approval, and approval
  is not execution.
- Because this is a strict shadow runtime, any hash-verified external,
  delivery, message, application, ATS, publish, send, merge, or deploy event—or
  any outbox/action status beyond the exact local draft states—sets
  `externalActionStatus` to `unknown`. That older run outranks newer terminal
  runs and all selectors until a human reconciles it outside the cockpit.

## Commands

Run from `ops/growth-graph/`.

```bash
npm run graph:ops -- status
npm run graph:ops -- reviews
npm run graph:ops -- explain-failure
npm run graph:ops -- doctor
```

These commands are read-only. They do not load an API key, create state, touch
the canvas, or call a model. `doctor` checks only for key presence and never
loads or prints the value.

Drill into one historical run without changing state:

```bash
npm run graph:ops -- status --run-id EXACT_RUN_ID
npm run graph:ops -- explain-failure --run-id EXACT_RUN_ID
```

Start one manual cycle only with an explicit, current capture:

```bash
npm run graph:ops -- run-now \
  --capture /absolute/path/capture-bundle.json \
  --evidence-root /absolute/path/to/smallest-approved-root
```

The operator performs the runtime's full bounded read-only preflight first:
bundle and artifact schemas, confinement, hashes, byte limits, secret policy,
source identities, child/parent privacy, consent, media bytes, group rules,
timeline, objective window, and metric-definition compatibility. It does not
create a lock, ledger, checkpoint, or artifact when that preflight fails.
Missing lanes remain honest baseline gaps inside the graph; stale evidence
already declared for a lane cannot be promoted by the cockpit.

## Powered-off Mac catch-up

Catch up only the latest eligible missed slot. The slot must be an
offset-qualified instant no more than 26 hours old, not in the future, and
inside the project action window. Evidence is evaluated at actual execution
time; the slot never backdates freshness or approval authority.

```bash
npm run graph:ops -- catch-up \
  --slot 2026-08-09T06:00:00-04:00 \
  --capture /absolute/path/capture-bundle.json \
  --evidence-root /absolute/path/to/smallest-approved-root
```

The normalized slot owns this exact identity:

```text
scheduled:code-the-future:growth_portfolio_shadow_v1:<New York slot>
```

- Same slot and same capture, finalized: no-op or show its review state.
- Same slot and same capture, interrupted with one checkpoint: resume that run.
- Same slot and different capture: invariant conflict; never invent a key.
- Different slot: one new cycle is allowed after preflight even when older
  reviews remain pending.
- Multiple incomplete runs or an orphan checkpoint: stop for manual state
  inspection.
- Any consequential external-action marker on any historical run: stop with
  `uncertain_external_action`; do not resume, catch up, or infer success.
- A committed ledger transaction without its checkpoint is corrupt/manual
  repair only. The narrow uncommitted `beginRun`-before-first-checkpoint crash
  window may re-enter only with its deterministic run ID, exact semantic key,
  exact capture hash, and matching policy/runtime manifest; it never invents a
  replacement owner.

Do not replay every missed interval. A later observation window supersedes old
collection work; delayed social, contact, or SEO actions are never batched.

## Exact resume

```bash
npm run graph:ops -- resume \
  --run-id EXACT_RUN_ID \
  --evidence-root /same/approved/root
```

Resume uses no new capture and cannot select an arbitrary incomplete run. Use
the same evidence root, model/prompt/policy/code, and—only for a synthetic test
checkpoint—the same `--allow-synthetic-evidence --run-at ...` flags. Manifest
drift exits without bypass. A committed-before-projection checkpoint may resume
only the idempotent readback/finalize path; it does not duplicate model calls,
proposals, reviews, or outbox drafts.

`run-now` never implicitly resumes an unrelated run. `catch-up` can resume only
the run owned by that exact scheduled slot. Otherwise use the explicit resume
command shown by `status`.

## Reviews

`reviews` emits redacted summaries: run/review IDs, projected review kind,
scope hash, package schema, exact draft hash, request time, expiry, and runtime
authority. It never emits raw private captures, contact destinations, media,
model traces, secrets, or draft content by default.

To inspect one exact local package, including its explicitly labeled immutable
audit package and runtime-downgraded projection, select its ID:

```bash
npm run graph:ops -- reviews --review-id EXACT_REVIEW_ID
```

This read is not an approval decision. `operatorCanExecute` remains `false`.

Current v1.1 external-action packages remain subject to exact action-time
expiry, objective-window checks, exact scope/draft hash, consent, contact
verification, and group-rule bindings. Expired packages and legacy v1 packages
are projected as `proposal_review` with `not_approval_ready`. Their immutable
historical package remains in the ledger for audit only.

There is intentionally no `approve`, `reject`, `publish`, `send`, `merge`, or
`deploy` cockpit command in v1.

## Exit codes

| Code | Meaning |
|---:|---|
| 0 | Handled read, successful execution, or verified no-op |
| 2 | Invalid command, option, or argument schema |
| 10 | Another raw graph child owns the OS-released SQLite execution lock |
| 20 | Capture, current evidence, key configuration, permission, or human input required |
| 21 | Unsupported ledger or runtime/policy manifest drift |
| 22 | Corrupt state, idempotency conflict, missing checkpoint, or readback invariant failure |
| 30 | Retryable graph failure with an exact checkpoint |
| 31 | Permanent graph failure |
| 70 | Unclassified operator implementation failure |

Read-only `status`, `reviews`, and `explain-failure` exit 0 even when they report
a blocked state. `doctor` exits 0 only when its inspected prerequisites are
healthy.

## Scheduling boundary

No launchd job is installed by this cockpit. The existing Agent Workforce
schedules remain unchanged during shadow mode. A future opt-in macOS template
must use a calendar trigger plus `RunAtLoad` reconciliation, process only the
latest eligible slot, contain no key or private path in arguments, and remain
uninstalled until cadence and real-input cutover are approved.
