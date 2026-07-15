-- packages/db/local-dev-grants.sql
-- Local-development ONLY: create an RLS-subject application role so per-request RLS actually
-- restricts (superusers/owners bypass RLS). Run AFTER migrations. Source: spec/04 §12.
--
--   npm run db:migrate
--   psql "$DATABASE_URL" -f packages/db/local-dev-grants.sql
--   # then connect the control plane as cos_app (or `set role cos_app`) so RLS applies.
--
-- On Supabase this is unnecessary — the built-in `authenticated`/`anon` roles are already
-- RLS-subject and the control plane connects through them.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'cos_app') then
    create role cos_app nologin; -- used via SET ROLE / as the app connection role
  end if;
end $$;

grant usage on schema public to cos_app;
grant select, insert, update, delete on all tables in schema public to cos_app;
grant usage, select on all sequences in schema public to cos_app;
grant usage on schema auth to cos_app;
grant execute on function auth.role() to cos_app;
