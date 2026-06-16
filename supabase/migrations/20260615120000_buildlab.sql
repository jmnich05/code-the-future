-- ==========================================================================
-- Build Lab — durable session state (so the big screen survives a reload).
-- One row per 4-letter session code holds the whole assembled AI as a blob:
-- { stage, name, topic, personality, facts:[], rules:[] }.
--
-- This is a live classroom tool: the ephemeral, in-room session code is the
-- access control, so RLS is intentionally permissive for the anon role. No
-- personal data is stored (entries are about the class's chosen topic).
-- ==========================================================================
create table if not exists public.buildlab_sessions (
  code        text primary key,
  state       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.buildlab_sessions enable row level security;

drop policy if exists "buildlab read"   on public.buildlab_sessions;
drop policy if exists "buildlab insert" on public.buildlab_sessions;
drop policy if exists "buildlab update" on public.buildlab_sessions;

create policy "buildlab read"   on public.buildlab_sessions for select using (true);
create policy "buildlab insert" on public.buildlab_sessions for insert with check (true);
create policy "buildlab update" on public.buildlab_sessions for update using (true) with check (true);

grant select, insert, update on public.buildlab_sessions to anon, authenticated;
