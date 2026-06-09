-- Roblox-style profile customization.
-- avatar: composable parts config (bg, body color, face, accessory) rendered as SVG.
-- accent: the learner's chosen brand-accent color. tagline: a short "about me".
alter table public.profiles
  add column if not exists avatar  jsonb not null default '{}'::jsonb,
  add column if not exists accent  text,
  add column if not exists tagline text,
  add column if not exists onboarded boolean not null default false;
