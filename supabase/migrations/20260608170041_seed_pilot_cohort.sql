-- Seed a pilot cohort so learners can join immediately with a code.
-- Idempotent: safe to re-run. Staff/owner can be assigned later from the dashboard.
insert into public.cohorts (name, join_code, track)
values ('Summer 2026 — Pilot', 'FUTURE26', null)
on conflict (join_code) do nothing;
