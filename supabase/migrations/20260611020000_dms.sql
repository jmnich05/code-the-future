-- ==========================================================================
-- Direct messages: messages.recipient_id (null = whole-cohort chat).
-- Kids can DM cohort-mates; staff can read everything (kid safety).
-- Realtime postgres_changes respects RLS, so DMs stream only to the people
-- allowed to see them. Idempotent.
-- ==========================================================================
alter table public.messages
  add column if not exists recipient_id uuid references auth.users(id) on delete cascade;
create index if not exists idx_messages_dm on public.messages(cohort_id, recipient_id, created_at desc);

drop policy if exists messages_select_members on public.messages;
create policy messages_select_members on public.messages for select
  using (
    public.is_cohort_member(cohort_id)
    and (
      recipient_id is null                       -- cohort-wide chat
      or recipient_id = auth.uid()               -- DM to me
      or author_id = auth.uid()                  -- DM I sent
      or public.is_staff_of_cohort(cohort_id)    -- staff oversight
    )
  );

drop policy if exists messages_insert_members on public.messages;
create policy messages_insert_members on public.messages for insert
  with check (
    author_id = auth.uid()
    and public.is_cohort_member(cohort_id)
    and (
      recipient_id is null
      or (recipient_id <> auth.uid()
          and exists (select 1 from public.cohort_members cm
                      where cm.cohort_id = messages.cohort_id and cm.user_id = recipient_id))
    )
  );
