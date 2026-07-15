-- 0003_auth_and_settings.sql
-- Source: spec/04-database-schema.md §4 (auth & settings).
-- Note: `profiles.id` references Supabase-managed `auth.users(id)`. On Supabase this schema
-- exists. For a plain-Postgres local dev DB, create a minimal shim before running:
--   create schema if not exists auth;
--   create table if not exists auth.users (id uuid primary key);
-- (Supabase environments already provide auth.users — do not shim there.)

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text,
  role         text not null default 'viewer' check (role in ('owner','admin','editor','viewer')),
  prefs        jsonb not null default '{}',   -- quiet hours, channels, timezone
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();

create table system_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
-- seed examples: 'budget.daily_usd', 'autoapprove.policy', 'confidence.thresholds',
-- 'timezone', 'niche.keywords', 'sources.config'
create trigger system_settings_set_updated_at before update on system_settings
  for each row execute function set_updated_at();
