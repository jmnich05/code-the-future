-- ==========================================================================
-- Staff inbox notifications: when a kid DMs a staff member or posts in the
-- Help channel, fire a webhook to the Netlify function /api/notify, which
-- relays to Slack and/or email (SLACK_WEBHOOK_URL / RESEND_API_KEY env vars).
--
-- The x-ctf-secret header must match NOTIFY_SECRET in Netlify env vars.
-- Notification failures NEVER block the kid's message (exception swallowed).
-- Idempotent: safe to re-run.
-- ==========================================================================

create extension if not exists pg_net;

create or replace function public.notify_staff_inbox()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_kind   text;
  v_from   text;
  v_to     text;
  v_cohort text;
begin
  if tg_table_name = 'messages' then
    -- only DMs aimed at a staff member of that cohort
    if new.recipient_id is null then return new; end if;
    if not exists (
      select 1 from cohort_members cm
      where cm.user_id = new.recipient_id
        and cm.cohort_id = new.cohort_id
        and cm.role = 'staff'
    ) then return new; end if;
    v_kind := 'dm';
    select coalesce(display_name, 'staff') into v_to from profiles where id = new.recipient_id;
  elsif tg_table_name = 'posts' then
    -- only the Help & Questions channel
    if new.channel <> 'help' then return new; end if;
    v_kind := 'help';
    v_to := null;
  else
    return new;
  end if;

  select coalesce(display_name, 'Explorer') into v_from from profiles where id = new.author_id;
  select name into v_cohort from cohorts where id = new.cohort_id;

  perform net.http_post(
    url     := 'https://codethefuture.net/api/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ctf-secret', '16ccfcfd9b0f520c47d72c56be05347cad6a99b8864b68df'
    ),
    body    := jsonb_build_object(
      'kind',   v_kind,
      'from',   v_from,
      'to',     v_to,
      'cohort', v_cohort,
      'body',   left(coalesce(new.body, ''), 300)
    )
  );
  return new;
exception when others then
  return new;  -- a broken webhook must never block a kid's message
end $$;

drop trigger if exists trg_notify_staff_dm on public.messages;
create trigger trg_notify_staff_dm
  after insert on public.messages
  for each row execute function public.notify_staff_inbox();

drop trigger if exists trg_notify_help_post on public.posts;
create trigger trg_notify_help_post
  after insert on public.posts
  for each row execute function public.notify_staff_inbox();
