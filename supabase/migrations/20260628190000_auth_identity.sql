-- ============================================================================
-- Auth redesign — real kid identity + enrolled-parent allowlist + per-kid codes
--
-- Goals:
--   * Parents register the first time with their email + the cohort number; only
--     emails on the enrolled-parents allowlist may register.
--   * Kids get a unique login code for return entry (works on any device).
--   * Kids' real names + parent email are PRIVATE — never readable by cohort-mates
--     (the board's profiles_select_cohortmates policy exposes whole profile rows,
--     so PII lives in a separate, self/staff-only table — not on profiles).
--   * Admins (Jon, Kenya) get role='admin'.
--
-- The /api/auth Netlify function uses the service-role key (bypasses RLS) to seed
-- and read these; the policies below govern the anon browser client.
-- ============================================================================

-- 1) Private identity: real names, parent email, login code. Self + staff only.
create table if not exists public.private_identity (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  first_name   text,
  last_name    text,
  parent_email text,
  login_code   text unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_private_identity_code on public.private_identity(login_code);

alter table public.private_identity enable row level security;

-- A learner can read/update only their own private row; cohort staff (admins/
-- teachers) can read it for the roster. NO cohort-mate policy → kids can't see
-- each other's real names. Inserts come from the service-role auth function.
drop policy if exists pi_select_own   on public.private_identity;
drop policy if exists pi_select_staff on public.private_identity;
drop policy if exists pi_update_own   on public.private_identity;
create policy pi_select_own   on public.private_identity for select using (user_id = auth.uid());
create policy pi_select_staff on public.private_identity for select using (public.is_cohort_staff_of(user_id));
create policy pi_update_own   on public.private_identity for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists trg_private_identity_updated on public.private_identity;
create trigger trg_private_identity_updated before update on public.private_identity
  for each row execute function public.set_updated_at();

-- 2) Enrolled-parents allowlist. Read only via the service-role auth function
--    (no client policies → the anon/auth browser client can't read it at all).
create table if not exists public.enrolled_parents (
  email       text primary key,
  cohort_code text not null default 'launchpad-july6',
  added_at    timestamptz not null default now(),
  note        text
);
alter table public.enrolled_parents enable row level security;

-- 3) Seed the founding-cohort allowlist (emails stored lowercased).
insert into public.enrolled_parents (email, note) values
  ('megrobi@gmail.com',            'founding cohort'),
  ('jon@pappyco.com',              'founding cohort / co-founder'),
  ('glassbaroness@gmail.com',      'founding cohort'),
  ('theguarnierifamily@gmail.com', 'founding cohort')
on conflict (email) do nothing;
