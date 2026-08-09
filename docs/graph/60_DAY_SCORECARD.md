# Code the Future — 60-Day Growth Scorecard

Operating window: 08-08-2026 through 10-07-2026
Status: baseline required before numeric outcome targets are promoted

## Decision rule

Use exactly one primary outcome per goal. Drivers explain movement. Guardrails prevent the system from manufacturing growth by sacrificing privacy, trust, conversion quality, or measurement integrity.

## 1. Organic social following

Primary KPI: `organic_net_new_followers_60d`, reported separately for Instagram and Facebook.

Formula:

```text
organic followers at window close - organic followers at window open
```

Paid or boosted activity must be excluded or separately labeled. Never sum Facebook and Instagram into one opaque number.

Drivers:

- `profile_to_follow_rate = new follows / profile visits`;
- `high_intent_engagement_rate = (shares + saves + substantive comments) / reach`;
- mature non-follower reach by content archetype.

Guardrails:

- unfollows, hides, reports, or other negative feedback;
- 100% approval and privacy/consent pass;
- exact separation of organic and paid distribution;
- no child asset or name without channel-specific permission.

Baseline needed:

- opening follower counts for each platform;
- trailing 90-day post-level insights export;
- post IDs, published times, format, reach, profile visits, follows, shares, saves, comments, negative feedback, and paid status;
- platform/account identity, `captured_at`, `fresh_through`, and raw artifact hash.

Initial experiment families:

- brand promise/welcome;
- classroom proof and responsible-AI carousel;
- 15-second recap or enrollment Reel.

Test one variable at a time: hook, format, call to action, or publishing window. Evaluate Instagram and Facebook independently.

## 2. Permission-safe contact discovery

Primary KPI: `approved_qualified_discovery_records_60d`.

A unique record counts only when it is:

- accepted by the evaluator or human reviewer;
- relevant to Louisville-area parents or community access;
- verified within seven days of the exact approved send time;
- tied to a public provenance URL;
- deduplicated; and
- supported by an allowed permission basis.

Drivers:

- public source pages reviewed;
- qualification yield by source lane;
- coverage across libraries, PTAs/PTOs, schools, homeschool groups, STEM organizations, camps, youth-serving nonprofits, neighborhood organizations, and public group administrators.

Guardrails:

- zero minors collected;
- zero private-group member extraction;
- zero unconsented parent contact data;
- zero outreach without exact approval;
- 100% provenance and deduplication.

Baseline needed:

- current organization/contact inventory;
- prior outreach, referral, and do-not-contact history;
- known duplicates and source categories;
- approved geography and qualification rubric.

Initial experiment families:

- public group-administrator and community-organization channels;
- PTA/PTO, library, homeschool, and STEM directories;
- permissioned parent introductions.

## 3. Google Search Console growth

Primary KPI: `nonbrand_parent_intent_gsc_clicks_28d` to public enrollment pages.

The rolling 28-day calculation must use query and page grain, exclude Code the Future brand terms, and apply the graph's mature-data cutoff.

Metric definition `ctf-growth-metrics-v1.1` normalizes each query with Unicode
NFKC, lowercase, and separator/hyphen folding. It first excludes normalized
Code the Future brand variants. A remaining query counts as parent intent only
when it matches at least two of three token families: audience
(`parent`/`kid`/`child`/`youth`/`teen`/`family`), subject
(`coding`/`AI`/`STEM`/`computer`/`technology`/`robotics`), and program
(`camp`/`class`/`club`/`program`/`course`/`workshop`/`lesson`). This rule is
versioned; changing it requires a new metric-definition version and replay
review.

Drivers:

- parent-intent impressions;
- query/page opportunities with average position 4–20;
- CTR for comparable query/page sets;
- count of relevant queries entering the top 20.

Guardrails:

- GA4 organic `generate_lead` and verified purchase quality;
- zero learner, admin, curriculum, docs, API, or checkout-success URLs indexed;
- branded traffic reported separately;
- no recommendation from stale or incomplete Search Console data;
- no winner when position improves but impressions or clicks collapse.

Baseline needed:

- 16 months of Search Console data at date/query/page/country/device grain when available;
- sitemap and indexing snapshots;
- public landing-page inventory;
- GA4 source/medium plus `generate_lead` and verified purchase events;
- property identity, `captured_at`, `fresh_through`, data state, and raw artifact hash.

Initial experiment order:

1. technical indexing and canonical integrity;
2. title/meta alignment for parent-intent query clusters;
3. internal links, local proof, and enrollment-page clarity;
4. content expansion only when query evidence supports it.

Do not optimize for FAQ rich-result appearance. [Google's 2023 Search Central
update](https://developers.google.com/search/blog/2023/08/howto-faq-changes)
limited FAQ rich results to well-known, authoritative government and health
sites, so that appearance is not a sound Code the Future growth target.

## Operating cadence

### Days 0–7: baseline and trust layer

- Capture the three required baselines.
- Verify identifiers, windows, hashes, freshness, consent, and source coverage.
- Reconcile existing social assets and prior contacts without treating filenames as proof.
- Confirm public pages and analytics events without indexing learner paths.

### Days 8–21: first controlled experiments

- Publish only after exact human approval.
- Run two or three approved social posts per week.
- Review 20–25 public discovery-source pages per week.
- Run one SEO hypothesis on one page/query cluster per week.

### Days 22–42: repeat and compare

- Repeat promising social arms until each has at least three comparable executions.
- Compare discovery qualification yield by lane.
- Read 14-day SEO signals without prematurely calling winners.

### Days 43–60: promote learnings

- Promote only mature, guardrail-safe findings.
- Scale the strongest approved social archetype.
- Focus discovery on the highest-yield permission-safe sources.
- Evaluate 28-day Search Console movement and conversion quality.

The last approved action must still occur by 10-07-2026. Its fixed measurement
window may mature after that date; reporting the tail does not extend action
authority or the 60-day objective window.

## Weekly decision rhythm

- Daily: read-only evidence ingestion and exception logging.
- Monday: freeze mature measurement windows.
- Tuesday: data analysis, proposal generation, and eval.
- Wednesday: human approve, reject, or request revision.
- After approval: publish, outreach, or deploy outside the shadow graph.
- Following cycles: collect outcome evidence and decide stop, repeat, repair, or scale.

## Target-setting gate

Do not invent hard 60-day outcome targets before day-zero evidence exists. Once baselines are verified, record for each KPI:

- opening value and source;
- target value or range;
- bottom-up capacity assumption;
- historical or benchmark anchor if available;
- confidence level;
- review date; and
- the decision that metric movement will change.
