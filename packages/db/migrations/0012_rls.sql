-- 0012_rls.sql
-- Source: spec/04-database-schema.md §12 (Row-Level Security).
-- v1 is single-tenant (Zentrix): policies enforce role-based access; structure is
-- tenant-ready for later. Workers connect with the service role (bypasses RLS, §12).
-- Note: auth.role() is provided by Supabase. On a plain-Postgres local DB, apply
-- packages/db/local-dev-shim.sql first (it stubs auth.users + auth.role()).

alter table assets enable row level security;
create policy assets_read  on assets for select
  using (auth.role() in ('owner','admin','editor','viewer'));
create policy assets_write on assets for all
  using (auth.role() in ('owner','admin','editor'))
  with check (auth.role() in ('owner','admin','editor'));

-- approvals: only owner/admin may decide
alter table approvals enable row level security;
create policy approvals_decide on approvals for update
  using (auth.role() in ('owner','admin'));
