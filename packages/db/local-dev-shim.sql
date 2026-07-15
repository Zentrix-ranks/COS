-- packages/db/local-dev-shim.sql
-- Local-development ONLY shim for Supabase-provided objects that the schema references
-- (spec/04-database-schema.md §4.1 profiles FK, §12 RLS policies).
--
-- Supabase environments already provide `auth.users` and `auth.role()` — DO NOT run this
-- there. Apply it only against a plain-Postgres dev database BEFORE `npm run migrate`:
--
--   psql "$DATABASE_URL" -f packages/db/local-dev-shim.sql
--   npm run db:migrate
--   npm run db:seed
--
-- Requires the pgvector extension to be installed on the server (see README).

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key
);

-- Mimics Supabase's auth.role(): reads the JWT role claim; defaults to service_role locally.
create or replace function auth.role() returns text
  language sql stable
as $$
  select coalesce(current_setting('request.jwt.role', true), 'service_role')
$$;
