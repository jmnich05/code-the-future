-- ==========================================================================
-- Code the Future — initial schema
-- Auth model: anonymous + cohort codes (COPPA-minded — no kid PII required).
-- Learners own their rows (RLS via auth.uid()); cohort staff can read their
-- members' progress. Profiles are auto-created on signup.
-- Order matters: tables first, then SQL helper functions that reference them.
-- ==========================================================================
create extension if not exists pgcrypto;

-- Clean slate so this init migration is deterministically re-runnable during
-- setup (safe: runs before any real data exists).
drop table if exists
  public.events, public.badges, public.widget_responses, public.lesson_progress,
  public.cohort_members, public.cohorts, public.profiles cascade;
drop function if exists public.is_cohort_member(uuid);
drop function if exists public.is_cohort_staff_of(uuid);
drop function if exists public.has_role(text[]);
drop function if exists public.join_cohort(text);
drop function if exists public.handle_new_user() cascade;
drop function if exists public.handle_new_cohort() cascade;
drop function if exists public.set_updated_at() cascade;

-- updated_at helper (no table dependencies)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ==========================================================================
-- Tables
-- ==========================================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  role          text not null default 'learner' check (role in ('learner','parent','teacher','admin')),
  track         text check (track in ('kids','adults')),
  birth_year    smallint check (birth_year between 1900 and 2100),
  is_anonymous  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.cohorts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  join_code   text not null unique,
  track       text check (track in ('kids','adults')),
  owner_id    uuid references auth.users(id) on delete set null,
  starts_on   date,
  ends_on     date,
  created_at  timestamptz not null default now()
);

create table public.cohort_members (
  cohort_id  uuid not null references public.cohorts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'learner' check (role in ('learner','staff')),
  joined_at  timestamptz not null default now(),
  primary key (cohort_id, user_id)
);
create index idx_cohort_members_user on public.cohort_members(user_id);

create table public.lesson_progress (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  module       text not null,
  track        text not null check (track in ('kids','adults')),
  position     integer not null default 0,
  completed    boolean not null default false,
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  unique (user_id, module, track)
);
create index idx_progress_user on public.lesson_progress(user_id);

create table public.widget_responses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  widget_id   text not null,
  module      text,
  track       text check (track in ('kids','adults')),
  response    jsonb not null default '{}'::jsonb,
  is_complete boolean not null default false,
  updated_at  timestamptz not null default now(),
  unique (user_id, widget_id)
);
create index idx_responses_user on public.widget_responses(user_id);

create table public.badges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  badge_key  text not null,
  module     text,
  track      text check (track in ('kids','adults')),
  earned_at  timestamptz not null default now(),
  unique (user_id, badge_key)
);
create index idx_badges_user on public.badges(user_id);

create table public.events (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  kind       text not null,
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_events_user on public.events(user_id);

-- ==========================================================================
-- Helper functions (SECURITY DEFINER — avoid recursive RLS). Defined AFTER the
-- tables they read so SQL-language bodies validate.
-- ==========================================================================
create or replace function public.is_cohort_member(p_cohort uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.cohort_members
                 where cohort_id = p_cohort and user_id = auth.uid());
$$;

create or replace function public.is_cohort_staff_of(p_target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.cohort_members me
    join public.cohort_members them on them.cohort_id = me.cohort_id
    where me.user_id = auth.uid() and me.role = 'staff' and them.user_id = p_target
  );
$$;

create or replace function public.has_role(p_roles text[])
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = any(p_roles));
$$;

-- auto-create a profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, is_anonymous)
  values (new.id, coalesce(new.is_anonymous, false))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- owner is auto-added as cohort staff
create or replace function public.handle_new_cohort()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is not null then
    insert into public.cohort_members (cohort_id, user_id, role)
    values (new.id, new.owner_id, 'staff') on conflict do nothing;
  end if;
  return new;
end; $$;
create trigger on_cohort_created
  after insert on public.cohorts for each row execute function public.handle_new_cohort();

-- join a cohort by code (callable by any signed-in learner, incl. anonymous)
create or replace function public.join_cohort(p_code text)
returns public.cohorts language plpgsql security definer set search_path = public as $$
declare c public.cohorts;
begin
  select * into c from public.cohorts where join_code = upper(btrim(p_code));
  if not found then raise exception 'Invalid cohort code'; end if;
  insert into public.cohort_members (cohort_id, user_id, role)
  values (c.id, auth.uid(), 'learner') on conflict do nothing;
  return c;
end; $$;

-- updated_at triggers
create trigger trg_profiles_updated  before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_progress_updated  before update on public.lesson_progress
  for each row execute function public.set_updated_at();
create trigger trg_responses_updated before update on public.widget_responses
  for each row execute function public.set_updated_at();

-- ==========================================================================
-- Row-Level Security
-- ==========================================================================
alter table public.profiles         enable row level security;
alter table public.cohorts          enable row level security;
alter table public.cohort_members   enable row level security;
alter table public.lesson_progress  enable row level security;
alter table public.widget_responses enable row level security;
alter table public.badges           enable row level security;
alter table public.events           enable row level security;

create policy profiles_select_own  on public.profiles for select using (id = auth.uid());
create policy profiles_select_staff on public.profiles for select using (public.is_cohort_staff_of(id));
create policy profiles_update_own  on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy cohorts_select on public.cohorts for select
  using (owner_id = auth.uid() or public.is_cohort_member(id));
create policy cohorts_insert on public.cohorts for insert
  with check (owner_id = auth.uid() and public.has_role(array['teacher','admin']));
create policy cohorts_update_own on public.cohorts for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy cohorts_delete_own on public.cohorts for delete using (owner_id = auth.uid());

create policy members_select_own   on public.cohort_members for select using (user_id = auth.uid());
create policy members_select_staff on public.cohort_members for select using (public.is_cohort_staff_of(user_id));

create policy progress_rw_own on public.lesson_progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy progress_select_staff on public.lesson_progress for select using (public.is_cohort_staff_of(user_id));

create policy responses_rw_own on public.widget_responses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy responses_select_staff on public.widget_responses for select using (public.is_cohort_staff_of(user_id));

create policy badges_rw_own on public.badges for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy badges_select_staff on public.badges for select using (public.is_cohort_staff_of(user_id));

create policy events_insert_own on public.events for insert
  with check (user_id = auth.uid() or user_id is null);
create policy events_select_own on public.events for select using (user_id = auth.uid());

-- ==========================================================================
-- Grants (RLS still governs row access; anonymous sign-ins use 'authenticated')
-- ==========================================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles, public.cohorts, public.cohort_members,
  public.lesson_progress, public.widget_responses, public.badges, public.events
  to authenticated;
grant execute on function public.join_cohort(text) to authenticated;
