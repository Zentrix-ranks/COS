-- 0001_extensions.sql
-- Source: spec/04-database-schema.md §1.2 (required extensions) + §1.1 (updated_at trigger).
-- Forward-only migration. Migration order: extensions first (§15).

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "vector";        -- pgvector
create extension if not exists "pg_trgm";       -- fuzzy text search
create extension if not exists "btree_gin";     -- composite gin indexes

-- Shared trigger to maintain updated_at on tables that carry it (§1.1).
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
