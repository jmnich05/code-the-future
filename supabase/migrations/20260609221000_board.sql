-- ==========================================================================
-- Cohort communication board: posts, comments, reactions.
-- Channels are an enum-ish text on posts (announcements/general/show_tell/help).
-- RLS: cohort members read; members post (announcements = staff only);
-- authors edit/delete their own; staff moderate. Idempotent.
-- ==========================================================================

-- helper: am I staff of this cohort?
create or replace function public.is_staff_of_cohort(p_cohort uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.cohort_members
                 where cohort_id = p_cohort and user_id = auth.uid() and role = 'staff');
$$;

-- helper: do I share a cohort with this user? (lets cohort-mates see profiles)
create or replace function public.shares_cohort_with(p_target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.cohort_members me
    join public.cohort_members them on them.cohort_id = me.cohort_id
    where me.user_id = auth.uid() and them.user_id = p_target
  );
$$;

create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  cohort_id  uuid not null references public.cohorts(id) on delete cascade,
  author_id  uuid not null references auth.users(id) on delete cascade,
  channel    text not null default 'general'
             check (channel in ('announcements','general','show_tell','help')),
  body       text not null check (char_length(body) between 1 and 2000),
  pinned     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_posts_cohort on public.posts(cohort_id, channel, created_at desc);

create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  author_id  uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists idx_comments_post on public.post_comments(post_id, created_at);

create table if not exists public.post_reactions (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  emoji      text not null check (char_length(emoji) <= 8),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

alter table public.posts          enable row level security;
alter table public.post_comments  enable row level security;
alter table public.post_reactions enable row level security;

-- posts
drop policy if exists posts_select_members on public.posts;
create policy posts_select_members on public.posts for select
  using (public.is_cohort_member(cohort_id));
drop policy if exists posts_insert_members on public.posts;
create policy posts_insert_members on public.posts for insert
  with check (
    author_id = auth.uid()
    and public.is_cohort_member(cohort_id)
    and (channel <> 'announcements' or public.is_staff_of_cohort(cohort_id))
    and (pinned = false or public.is_staff_of_cohort(cohort_id))
  );
drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists posts_update_staff on public.posts;
create policy posts_update_staff on public.posts for update
  using (public.is_staff_of_cohort(cohort_id));
drop policy if exists posts_delete_own_or_staff on public.posts;
create policy posts_delete_own_or_staff on public.posts for delete
  using (author_id = auth.uid() or public.is_staff_of_cohort(cohort_id));

-- comments (must be a member of the post's cohort)
drop policy if exists comments_select_members on public.post_comments;
create policy comments_select_members on public.post_comments for select
  using (exists (select 1 from public.posts p
                 where p.id = post_id and public.is_cohort_member(p.cohort_id)));
drop policy if exists comments_insert_members on public.post_comments;
create policy comments_insert_members on public.post_comments for insert
  with check (author_id = auth.uid()
    and exists (select 1 from public.posts p
                where p.id = post_id and public.is_cohort_member(p.cohort_id)));
drop policy if exists comments_delete_own_or_staff on public.post_comments;
create policy comments_delete_own_or_staff on public.post_comments for delete
  using (author_id = auth.uid()
    or exists (select 1 from public.posts p
               where p.id = post_id and public.is_staff_of_cohort(p.cohort_id)));

-- reactions
drop policy if exists reactions_select_members on public.post_reactions;
create policy reactions_select_members on public.post_reactions for select
  using (exists (select 1 from public.posts p
                 where p.id = post_id and public.is_cohort_member(p.cohort_id)));
drop policy if exists reactions_rw_own on public.post_reactions;
create policy reactions_rw_own on public.post_reactions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid()
    and exists (select 1 from public.posts p
                where p.id = post_id and public.is_cohort_member(p.cohort_id)));

-- let cohort-mates see each other's display name/avatar + the roster
drop policy if exists profiles_select_cohortmates on public.profiles;
create policy profiles_select_cohortmates on public.profiles for select
  using (public.shares_cohort_with(id));
drop policy if exists members_select_mates on public.cohort_members;
create policy members_select_mates on public.cohort_members for select
  using (public.is_cohort_member(cohort_id));

grant select, insert, update, delete on
  public.posts, public.post_comments, public.post_reactions to authenticated;
