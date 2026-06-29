-- ============================================================================
-- Admin accounts map: lets the /api/auth function find an admin's Supabase user
-- by email on repeat logins (so it can keep their password in sync with
-- ADMIN_PASSWORD). Written/read only via the service role — no client policies.
-- ============================================================================
create table if not exists public.staff_accounts (
  email      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.staff_accounts enable row level security;
-- (no policies on purpose → the anon/auth browser client can't read this table)
