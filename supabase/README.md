# Supabase — Code the Future

Project ref: **`zlchimvgtpxojssblhlf`** · URL: `https://zlchimvgtpxojssblhlf.supabase.co`

Auth model: **anonymous + cohort codes** (COPPA-minded — kids start with no email/PII;
camp/classes join via a code; staff can read their members' progress).

## Schema (migrations/)

| Table | What it holds |
|-------|---------------|
| `profiles` | one row per auth user (auto-created on signup); role, track, anon flag |
| `cohorts` | camp sessions / classes, each with a `join_code` |
| `cohort_members` | who's in a cohort (`learner` / `staff`) |
| `lesson_progress` | position + completion per learner × module × track |
| `widget_responses` | each interactive answer (jsonb), per learner × widget |
| `badges` | earned badges per learner |
| `events` | lightweight analytics/audit (capstone use, etc.) |

**RLS is on for every table.** Learners can only read/write their own rows; cohort **staff**
can read their members' progress/badges. Cohorts are joined via the `join_cohort(code)` RPC.
A pilot cohort `Summer 2026 — Pilot` (code **`FUTURE26`**) is seeded.

## Apply the migrations (CLI)

Run these from the repo root (the CLI is installed; secrets stay on your machine):

```bash
supabase login                                   # opens browser; token saved locally
supabase link --project-ref zlchimvgtpxojssblhlf  # will ask for the DB password
supabase db push                                  # applies migrations to the project
```

> Prefer I run the push for you? Put the project's **database password** in
> `supabase/.env` as `SUPABASE_DB_PASSWORD=...` (gitignored) and I'll run
> `supabase db push` non-interactively. (Don't paste it in chat.)

To re-check status later: `supabase migration list --linked`.

## Wire up the app

1. Get the **anon public key**: dashboard → Project Settings → API.
2. `cp platform/lib/config.example.js platform/lib/config.js` and paste the anon key
   (`config.js` is gitignored; the anon key is safe for the browser — RLS guards the data).
3. The progress/auth API lives in `platform/lib/ctf-db.js` (`window.CTFDB`). Next step is
   wiring the lesson player + widgets to call it instead of `localStorage`.
