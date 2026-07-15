# @cos/db

The COS data layer: PostgreSQL + pgvector schema, migrations, and seed.
Source of truth: [`spec/04-database-schema.md`](../../spec/04-database-schema.md).

## Layout

```
migrations/        forward-only, numbered SQL (0001…0013), applied in filename order
seed/
  agents.json      the 36 agent contracts (canonical, from spec Appendix A2)
  system_settings.json  global defaults (budgets, thresholds, sources)
src/
  client.ts        pg Pool factory
  migrate.ts       migration runner (tracks applied files in schema_migrations)
  seed.ts          idempotent seed loader (upserts agents + settings)
local-dev-shim.sql Supabase auth.users/auth.role() stubs for plain-Postgres dev only
```

## Prerequisites

- PostgreSQL 14+ with the **pgvector** extension available on the server.
- Node 20+.

## Usage

```bash
# 1. (local plain-Postgres only) create the Supabase object shims:
psql "$DATABASE_URL" -f packages/db/local-dev-shim.sql

# 2. run migrations (forward-only, idempotent — skips already-applied files):
npm run db:migrate           # uses DATABASE_SERVICE_URL, falling back to DATABASE_URL

# 3. seed agents + settings (idempotent — safe to re-run):
npm run db:seed
```

On **Supabase**, skip step 1 (auth.users / auth.role() already exist) and point
`DATABASE_URL` / `DATABASE_SERVICE_URL` at the project.

## Conventions

- Migrations are **forward-only**; never edit an applied migration — add a new one
  (doc 04 §1.1, §15).
- `updated_at` is maintained by the shared `set_updated_at()` trigger (0001).
- The `agents` seed is parent-first (ceo → heads → specialists) to satisfy the
  self-referential `reports_to` FK.
