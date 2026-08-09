# Current Meta and Instagram Work — Graph Import Plan

The active local `Social Media/` tree is valuable source material, but it is untracked and may contain raw or child-related media. Shadow v1 must not copy that tree into Git, infer consent from folder names, or treat a composer/upload state as proof of publication.

## Existing experiment families to preserve

- Code the Future welcome/brand-promise post.
- Responsible-AI and classroom-proof carousel.
- Fifteen-second recap/enrollment video variants for Instagram Reels, Instagram feed, and Facebook.

These are experiment families, not verified performance records. Each platform execution needs its own post ID, live-publication evidence, paid/organic status, and mature insight window.

Evidence v1.1 may retain a post-detail observation when Meta exposes only part
of that contract. The partial record must distinguish an observed zero from an
unavailable field, keep native lookalikes separate (`viewers` from `reach`,
`follows` from `new_follows`, and raw `comments` from reviewed substantive
comments), and contain no learner media, caption, identity, or asset path. It is
valid evidence but is excluded from follower baselines, post scoring,
experiment-arm counts, and proposal generation until a later complete,
consent-attested capture supersedes it.

## Reconciliation sequence

1. Inventory files locally without committing media bytes. Assign each asset a stable content hash, media type, dimensions, duration where relevant, and current source path.
2. Visually inspect every proposed asset. A folder named `Sanitized for Posting` is not privacy evidence.
3. Bind each asset to a consent record that states subject basis, allowed
   channels, allowed media uses, grant evidence, grant time, expiration if any,
   revocation state, and a source-backed revocation-check timestamp no more than
   24 hours old at the exact scheduled publication time. Shadow v1 schedules a
   social approval 12 hours after drafting, so a check already more than 12
   hours old at draft time remains proposal-only until it is refreshed.
4. Quarantine any asset with a child or unknown subject until guardian evidence covers the exact platform and use.
5. Create a platform-separated content registry containing the actual Instagram or Facebook post ID, publication time, format, hook, CTA, publishing window, UTM, asset hashes, approval reference, and paid status.
6. Import a trailing 90-day post-level insight export plus opening follower counts. Preserve account ID, capture time, `fresh_through`, data state, and raw artifact hash.
7. Normalize the existing welcome, carousel, and video work into versioned experiment IDs and arms. Change one material variable at a time.
8. Repair media inconsistencies before approval. In the current local carousel, the final slide does not share the same dimensions as the earlier slides.
9. Require separate live verification for Instagram and Facebook. Pinning, scheduling, saving, or uploading on one platform does not prove the other platform is live.
10. Only after a 72-hour window and at least one observed account reach may the graph compare post performance. A zero-reach row remains evidence but cannot count as a mature execution, satisfy an experiment arm, or enter scoring. A promoted learning still requires at least three comparable executions per arm.

## Minimum import manifest

Each asset record needs:

- `asset_id` derived from content hash;
- source path retained locally, never exposed in the observer;
- SHA-256 and byte length;
- media kind and technical dimensions;
- subject classification: `no_person`, `adult_only`, or `child_or_unknown`;
- consent references;
- allowed Instagram/Facebook use;
- expiration, revocation state, and the source-backed revocation-check time; and
- an explicit privacy-review result.

Each post record needs:

- platform and account ID;
- platform post ID and independently verified live URL/evidence;
- experiment ID, arm, and one controlled variable;
- caption/copy hash, asset hashes, CTA, UTM, and publishing window;
- exact human approval reference;
- organic/boosted/paid status; and
- mature metrics with capture and freshness metadata.

## Activation gate

The social lane remains shadow-only until the local inventory, consent ledger, post registry, follower baseline, and insight export reconcile without missing or duplicate records. No publisher or scheduler is part of this import.
