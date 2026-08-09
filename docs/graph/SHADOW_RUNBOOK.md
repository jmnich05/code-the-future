# Code the Future Growth Graph — Shadow Runbook

Updated: 08-08-2026

This runbook operates `growth_portfolio_shadow_v1` locally. The command can read
an approved capture bundle and write graph-owned local state, but it has no
publisher, sender, campaign mutator, Search Console mutator, merge, or deploy
adapter.

## Local boundaries

- Run from `ops/growth-graph/` in the Code the Future repository or graph worktree.
- Keep `OPENAI_API_KEY` in the repository-root `.env.local`; never commit or print it.
- Runtime state belongs under the ignored repository-root `.state/` directory.
- The generated repository-root `PROJECT_STATE.md` is ignored and is a projection,
  not canonical state.
- The canonical ledger and checkpoints are SQLite files under the selected state
  root.
- A generated `awaiting_review` record is not approval and does not execute an
  external action.
- Synthetic fixtures are accepted only when the explicit
  `--allow-synthetic-evidence` flag is present.

The graph branch can run in an isolated worktree whose repository-root
`.env.local` is intentionally absent, while the credential remains in the
ignored canonical checkout. For a one-time branch smoke test, point the
task-specific variable below at that checkout and load its ignored file into
the current shell without copying it:

```bash
cd ops/growth-graph
CTF_CANONICAL_REPO='/absolute/path/to/Code the Future'
set -a
source "$CTF_CANONICAL_REPO/.env.local"
set +a
```

After merge, `npm run graph:shadow` automatically loads the ignored
repository-root `.env.local` when run from `ops/growth-graph/`.

## Install and verify

```bash
cd ops/growth-graph
npm ci
npm run typecheck
npm test
npm audit --omit=dev --audit-level=high
```

Do not proceed with a shadow capture if typecheck, tests, or the audit fails.

## Read-only real-capture validation

Validate a prepared real-input bundle before starting a graph run. Use an
explicit `--run-at` instant so time-bound consent and revocation checks are
repeatable:

```bash
npm run graph:validate-capture -- \
  --capture /absolute/path/capture-bundle.json \
  --evidence-root /absolute/path/to/smallest-approved-root \
  --run-at 2026-08-08T16:00:00-04:00 \
  --sha LOWERCASE_CAPTURE_BUNDLE_SHA256
```

The capture and every declared evidence, media, and group-rules path must
resolve inside `--evidence-root`. The validator checks schemas, declaration and
byte hashes, secret policy, consent scope/freshness, contact privacy, and file
confinement. Intake also fails closed above 10,000 referenced files or 256 MiB
of aggregate capture bytes; the per-file limit remains 16 MiB. It always rejects
synthetic evidence and has no `--allow-synthetic-evidence` option.

This command does not load `.env.local`, require `OPENAI_API_KEY`, call a model,
create or modify `.state`, write a ledger/checkpoint, copy evidence, or execute
an external action. Its JSON output always reports
`validationScope: "capture_preflight_only"` and
`countsTowardThreeRunGate: false`; a successful validation is not one of the
three required committed and verified real-input shadow cycles.

## Safe synthetic smoke run

The fixture contains fabricated records and is not a Code the Future baseline.
Use a fresh run ID and idempotency key for a new smoke run:

```bash
npm run graph:shadow -- \
  --capture test/fixtures/capture-bundle.json \
  --evidence-root test/fixtures \
  --state-root ../../.state/growth-graph-synthetic \
  --project-state ../../PROJECT_STATE.md \
  --run-id synthetic-smoke-2026-08-08-01 \
  --idempotency-key synthetic-smoke-2026-08-08-01 \
  --allow-synthetic-evidence
```

Successful command output must report:

- a run ID and terminal status;
- a transaction ID;
- `localPersistenceVerified: true`;
- `externalActionStatus: "not_executed"`;
- the generated state and observer paths; and
- the next safe action.

The output intentionally excludes prompts, model output, contact identities,
credentials, and raw evidence.

## Resume an interrupted run

Use the exact run ID emitted by the original command and the same state root.
The runtime manifest must also match; a model, prompt, policy, dependency, or
source-code change fails closed instead of silently resuming under different
rules.

```bash
npm run graph:shadow -- \
  --resume synthetic-smoke-2026-08-08-01 \
  --state-root ../../.state/growth-graph-synthetic \
  --project-state ../../PROJECT_STATE.md \
  --evidence-root test/fixtures \
  --allow-synthetic-evidence
```

Repeating the original trigger with the same idempotency key is a verified
duplicate no-op tied to the original run. It must not create a second proposal,
review request, or outbox draft.

## Inspect the result

Open these local artifacts after a verified run:

- `../../PROJECT_STATE.md` — concise generated portfolio state;
- `../../.state/growth-graph-synthetic/observer/index.html` — inspection-only
  graph canvas;
- `../../.state/growth-graph-synthetic/observer/latest.json` — redacted canvas
  projection; and
- `../../.state/growth-graph-synthetic/ledger.sqlite` — canonical append-only
  domain ledger.

The HTML canvas should contain graph and lane status only. It must have no form,
button, script, approval, retry, resume, publish, send, deploy, or mutation
surface.

## Real-input shadow gate

Do not add `--allow-synthetic-evidence` for real data. Real captures must satisfy
the typed capture contract and point `--evidence-root` at the smallest approved
directory containing the bundle and its declared artifacts. Intake resolves real
paths, confines every read to that root, checks declared hashes, copies bounded
bytes into content-addressed storage, and rejects secret-like material.

Before the first real-input cycle:

1. reconcile the dirty canonical social, site, SEO, analytics, and ads-ops work;
2. build the consent-linked social asset manifest without committing raw media;
3. import platform-specific post IDs, live proof, paid status, follower baselines,
   and mature insights;
4. import permission-safe contact history and do-not-contact fingerprints;
5. capture one verified Search Console property at query/page/date grain with
   `fresh_through`; and
6. review the KPI definitions and authority policy in `PROJECT_CHARTER.md`.

Then run `graph:validate-capture` with the final bundle SHA-256 and preserve its
redacted JSON result alongside the human review record. Validation success does
not waive any incomplete-data, consent, history, or human-approval gate.

No autonomous live hill-climbing claim is valid until three consecutive
real-input shadow cycles commit and read back cleanly. Read adapters should be
introduced one source at a time after that. Write adapters remain a separate,
explicitly approved phase.

The contact primary KPI remains deliberately incomplete in shadow v1: a
deterministically qualified candidate is not an approved record. Reviewed
decision ingestion and cross-run aggregation are a cutover requirement before
`approved_qualified_discovery_records_60d` can advance.

## Failure handling

- A `failed_pending_resume` response means inspect the redacted error and resume
  the same run after repairing the identified local problem.
- Do not delete state or invent a new idempotency key to bypass a conflict.
- Authentication, MFA, CAPTCHA, consent, privacy, evidence-hash, policy-manifest,
  and canonical-readback failures stop for human inspection.
- Unknown external state is never retried blindly. Shadow v1 has no external
  writer, so any external mutation observed during a run is outside this graph.
- A quarantined lane does not authorize work in another system; inspect its
  evidence and evaluator defects first.

## Cutover status

The existing Code the Future Agent Workforce schedules remain unchanged during
shadow v1. Disable or replace them only in an explicit later cutover after the
real-input gates pass. Google Chat is not part of this graph architecture.
