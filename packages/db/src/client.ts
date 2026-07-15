// packages/db/src/client.ts
// Postgres connection pool. Source: spec/02-system-architecture.md §3.3, spec/04 §12.
// The control plane uses DATABASE_URL (RLS-enforced role); workers use
// DATABASE_SERVICE_URL (service role, bypasses RLS, confined to worker network).
import pg from 'pg';

export type Pool = pg.Pool;

export function makePool(connectionString: string | undefined): pg.Pool {
  if (!connectionString) {
    throw new Error(
      'No Postgres connection string provided. Set DATABASE_URL (control plane) ' +
        'or DATABASE_SERVICE_URL (worker). See .env.example.',
    );
  }
  return new pg.Pool({ connectionString, max: 10 });
}
