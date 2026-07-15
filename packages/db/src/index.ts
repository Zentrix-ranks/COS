// packages/db/src/index.ts
// Public surface of @cos/db: connection pool factory. Migrations and seed are run via the
// `migrate` / `seed` scripts (package.json). Typed query helpers land in M0+ as needed.
export { makePool } from './client.js';
export type { Pool } from './client.js';
