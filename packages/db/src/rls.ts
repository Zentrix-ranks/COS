// packages/db/src/rls.ts
// Per-request RLS scoping over the direct pg pool. Source: spec/04 §12 (RLS enforces role-based
// access; policies use auth.role()), spec/02 §8.1 (RLS-backed data access).
//
// Supabase's PostgREST sets the JWT role on every request so RLS applies automatically; when the
// control plane talks to Postgres directly it must do the same. We run each query in a
// transaction that sets `request.jwt.role` transaction-locally, so `auth.role()` returns the
// caller's app role and the policies enforce. NOTE: this only restricts when the *connecting*
// DB role is subject to RLS (a non-owner, non-superuser role — e.g. Supabase `authenticated`, or
// the local `cos_app` role from local-dev-grants.sql). Superusers/owners bypass RLS.
import type pg from 'pg';

async function setRole(client: pg.PoolClient, role: string): Promise<void> {
  // Transaction-local (third arg true) so it never leaks to another pooled checkout.
  await client.query(`select set_config('request.jwt.role', $1, true)`, [role]);
}

/** Run a single query under `role` (RLS applies). */
export async function queryWithRole<T extends pg.QueryResultRow>(
  pool: pg.Pool,
  role: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await setRole(client, role);
    const res = await client.query<T>(sql, params);
    await client.query('commit');
    return res.rows;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Run a multi-statement unit of work under `role` in one transaction (RLS applies). */
export async function withRoleClient<T>(
  pool: pg.Pool,
  role: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await setRole(client, role);
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
