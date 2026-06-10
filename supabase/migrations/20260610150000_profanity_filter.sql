-- ==========================================================================
-- Profanity filter for all learner-generated text (kids product).
-- Enforced at the DATABASE level via triggers on posts, post_comments, and
-- messages — so it holds even if someone bypasses the client. The client
-- (platform/lib/filter.js) mirrors this list for instant friendly feedback.
--
-- Matching strategy:
--   1) normalize: lowercase + leetspeak (0→o 1→i 3→e 4→a 5→s 7→t @→a $→s !→i)
--   2) word-boundary match against the full list (avoids "classic"/"assist")
--   3) collapsed match (strip non-letters) against unambiguous terms only,
--      to catch "f u c k" style spacing tricks
-- Idempotent.
-- ==========================================================================

create or replace function public.normalize_for_filter(t text)
returns text language sql immutable as $$
  select lower(translate(coalesce(t,''), '0134578@$!', 'oieastsasi'));
$$;

create or replace function public.contains_profanity(t text)
returns boolean language plpgsql immutable as $$
declare
  norm text := public.normalize_for_filter(t);
  collapsed text := regexp_replace(public.normalize_for_filter(t), '[^a-z]', '', 'g');
  -- word-boundary list (includes shorter words that need boundaries)
  word_list text := '(fuck|fucking|fucker|shit|shitty|bullshit|ass|asses|asshole|bitch|bitches|bastard|damn|goddamn|crap|piss|pissed|dick|dicks|cock|pussy|cunt|whore|slut|fag|faggot|nigger|nigga|retard|retarded|spic|chink|kike|wetback|tranny|douche|douchebag|jackass|dumbass|prick|wanker|twat|bollocks|tits|boobs|penis|vagina|porn|porno|sexy|nude|nudes|kill yourself|kys|stfu|gtfo|wtf|hoe|hoes)';
  -- collapsed list (unambiguous substrings only — safe without boundaries)
  collapsed_list text := '(fuck|nigger|nigga|faggot|cunt|bitch|asshole|killyourself)';
begin
  if norm ~ ('\m' || word_list || '\M') then return true; end if;
  if collapsed ~ collapsed_list then return true; end if;
  return false;
end; $$;

create or replace function public.reject_profanity()
returns trigger language plpgsql as $$
begin
  if public.contains_profanity(new.body) then
    raise exception 'PROFANITY_BLOCKED' using errcode = 'P0001',
      hint = 'Let''s keep it kind — try different words.';
  end if;
  return new;
end; $$;

drop trigger if exists trg_posts_profanity on public.posts;
create trigger trg_posts_profanity
  before insert or update on public.posts
  for each row execute function public.reject_profanity();

drop trigger if exists trg_comments_profanity on public.post_comments;
create trigger trg_comments_profanity
  before insert or update on public.post_comments
  for each row execute function public.reject_profanity();

drop trigger if exists trg_messages_profanity on public.messages;
create trigger trg_messages_profanity
  before insert or update on public.messages
  for each row execute function public.reject_profanity();

-- also keep display names + taglines clean
create or replace function public.reject_profanity_profile()
returns trigger language plpgsql as $$
begin
  if public.contains_profanity(coalesce(new.display_name,'') || ' ' || coalesce(new.tagline,'')) then
    raise exception 'PROFANITY_BLOCKED' using errcode = 'P0001',
      hint = 'Let''s keep it kind — try a different name.';
  end if;
  return new;
end; $$;

drop trigger if exists trg_profiles_profanity on public.profiles;
create trigger trg_profiles_profanity
  before insert or update on public.profiles
  for each row execute function public.reject_profanity_profile();
