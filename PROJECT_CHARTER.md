# Code the Future Growth Graph — Project Charter

Version: 1.0.0
Effective: 08-08-2026
Initial operating window: 08-08-2026 through 10-07-2026

## Mission

Grow Code the Future for the next 60 days through three measurable, evidence-backed loops:

1. grow the organic Instagram and Facebook following;
2. discover qualified Louisville-area parent, group, school, library, homeschool, STEM, and community channels on the public internet; and
3. improve qualified, non-branded Google Search traffic to public enrollment pages.

The system optimizes for trusted reach and enrollment relevance, not vanity volume. It may recommend and prepare work autonomously, but it may not publish, contact people, spend money, change accounts, or deploy production changes without exact human approval.

## Canonical boundaries

- Canonical repository: the local checkout of `jmnich05/code-the-future`.
- Graph development branch: `codex/code-the-future-growth-graph-v1` in an
  isolated worktree.
- GitHub repository: `jmnich05/code-the-future`.
- The current canonical checkout contains user-owned uncommitted site, SEO, ads-ops, and social-media work. The graph worktree must not reset, clean, stage, commit, or overwrite it.
- Local SQLite checkpoints and the graph domain ledger are authoritative for graph progress.
- `PROJECT_STATE.md` and the observer canvas are generated projections, never canonical runtime state.
- Supabase, Meta, Instagram, Google Analytics, and Google Search Console are external evidence sources or optional mirrors. None independently proves that a graph run completed.
- Learner-platform data, child profiles, cohort membership, classroom messages, and student work are outside the growth graph.

## The three growth outcomes

### Organic social

Primary KPI: organic net-new followers over the operating window, reported separately for Instagram and Facebook.

The graph may compare content hypotheses, formats, hooks, calls to action, and publishing windows. It must label paid or boosted distribution separately and may never combine platform totals into an opaque aggregate.

### Permission-safe contact discovery

Primary KPI: approved qualified discovery records created during the operating window.

A record counts only when it is unique, Louisville-relevant, verified within seven days, linked to public provenance, and accepted under one of these permission bases:

- `public_org_channel`;
- `public_group_admin_channel`;
- `direct_parent_opt_in`; or
- `introduced_referral_with_permission`.

The graph searches for organizations, public administrators, and permissioned introductions—not children and not private group members.

### Search Console growth

Primary KPI: rolling 28-day non-branded, parent-intent Google Search clicks to public enrollment pages.

The graph must preserve query and page grain, keep branded traffic separate, and use mature Search Console data. It may not claim improvement from average position alone or from stale, partial, or brand-only traffic.

## Authority

The graph may autonomously:

- read approved local files and approved read-only exports;
- validate, hash, normalize, classify, deduplicate, analyze, and evaluate evidence;
- run deterministic site checks, tests, and bounded model/eval loops;
- write isolated local checkpoints, ledger records, redacted traces, draft artifacts, and generated projections;
- prepare social captions, creative briefs, public-channel research records, outreach drafts, and SEO change proposals;
- recommend a single-variable experiment with measurement and stop/scale rules.

The graph must pause for Jon before:

- publishing, scheduling, pinning, commenting, replying, sending a direct message, joining a group, or submitting a group post;
- sending any email, form, message, or outreach;
- boosting content, creating or enabling a campaign, changing budget, audience, geography, bidding, or account settings;
- using an image, video, quote, name, likeness, testimonial, or student artifact without channel-specific consent evidence;
- changing a Google Search Console property, submitting or deleting a sitemap, requesting indexing, or changing access;
- merging or deploying a website or SEO change to production;
- changing source, privacy, consent, authority, or retention policy.

Approval is bound to the exact platform or destination, content or change hash, assets, audience, timing, budget if any, and intended action. Any material change invalidates approval.

## Child, parent, and community privacy

- Never ingest learner records, child identities, private classroom data, private group member lists, or direct messages into graph state or model prompts.
- Never scrape or enumerate members of a private Facebook group or mine personal parent profiles.
- Never retain a referred parent's identity unless that parent opted in or the introducer has explicit permission to connect them.
- A filename such as `Sanitized for Posting` is not consent evidence.
- Website testimonial consent does not imply organic social, paid social, press, photography, video, or name/likeness consent.
- Consent must identify the asset, subject or guardian basis, allowed channels,
  evidence reference, grant time, revocation state, and a source-backed recent
  revocation-check timestamp.
- Revocation blocks future use and produces a review task for already-published material; the graph does not remove live content autonomously.
- Store only the minimum public business or administrator contact information needed for the approved workflow.

## Evidence and completion

- A local creative file is evidence of a draft, not evidence of publication.
- A composer, upload, save, or scheduling screen is not proof that a post is live.
- Instagram and Facebook publication are separate completion claims and require platform-specific evidence.
- Performance claims require a mature insight window and the exact post or experiment identifier.
- Contact discovery requires a recent public source URL, captured time, permission basis, dedupe key, and qualification result.
- Search Console analysis requires property identity, query/page grain, capture time, `fresh_through`, date window, and raw artifact hash.
- Search Console can return top rows rather than every row; coverage must be disclosed rather than inferred.
- A graph run is complete only after the canonical local transaction commits and reads back successfully.
- Partial source coverage produces a partial run, never a fabricated zero or winner.
- External action is complete only after an independently verified live result or destination receipt.

## Hill-climbing policy

- Establish day-zero baselines before setting numeric 60-day outcome targets.
- Change one material variable per experiment unless the experiment explicitly tests a package.
- Social results mature after at least 72 hours; Search Console results use a three-day lag and 14/28-day windows.
- Do not declare a winner until there are at least three comparable executions per arm and enough reach or impressions to support the claim.
- Separate directional, low-confidence findings from promoted learnings.
- Each promoted learning records the hypothesis, evidence, metric definition, comparison, guardrails, and human decision.
- The running graph never rewrites its own prompts, code, policies, or authority. Improvement becomes a regression fixture and a reviewed versioned change.

## Reliability policy

- Duplicate triggers are idempotent no-ops.
- Canonical state, policy, checkpoint, or evidence failures fail closed.
- Transient provider failures receive no more than two graph-owned retries.
- Provider and SDK retry layers are disabled so the graph owns the attempt budget.
- Missing provenance, consent, freshness, or measurement maturity receives one targeted recapture request, then quarantine.
- The same evaluator defect twice quarantines the proposal or blocks the affected lane.
- Unknown external-action results stop for inspection and are never repeated blindly.
- Every error records a stable fingerprint, node, category, attempt, retryability, evidence references, and resolution.

## Observer boundary

The visual canvas is inspection-only. It may show topology, active path, lane status, source coverage, evidence counts, KPI windows, experiments, eval results, retries, errors, and pending human reviews.

It must not contain invoke, retry, resume, approve, reject, publish, send, deploy, edit-state, or other mutation controls.

## Initial rollout boundary

`growth_portfolio_shadow_v1` accepts verified local capture bundles and produces durable analysis, one approval-ready experiment proposal per eligible lane, eval results, a human-review queue, generated project state, and a redacted observer canvas.

It contains no Meta/Instagram publisher, group joiner, contact sender, ad mutator, Google Search Console mutation, Supabase mutation, GitHub merge, Netlify deploy, or production website editor.
