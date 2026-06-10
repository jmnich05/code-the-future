-- ==========================================================================
-- Live cohort chat: persistent messages (so staff can review — kids product)
-- + Supabase Realtime so new messages stream to everyone in the cohort.
-- Idempotent.
-- ==========================================================================
create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  cohort_id  uuid not null references public.cohorts(id) on delete cascade,
  author_id  uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_cohort on public.messages(cohort_id, created_at desc);

alter table public.messages enable row level security;

drop policy if exists messages_select_members on public.messages;
create policy messages_select_members on public.messages for select
  using (public.is_cohort_member(cohort_id));

drop policy if exists messages_insert_members on public.messages;
create policy messages_insert_members on public.messages for insert
  with check (author_id = auth.uid() and public.is_cohort_member(cohort_id));

drop policy if exists messages_delete_staff on public.messages;
create policy messages_delete_staff on public.messages for delete
  using (author_id = auth.uid() or public.is_staff_of_cohort(cohort_id));

grant select, insert, delete on public.messages to authenticated;

-- realtime: stream INSERTs to subscribed cohort members (RLS enforced)
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;
