// packages/db/src/migrate.ts
// Forward-only migration runner (spec/04-database-schema.md §1.1, §15).
// Applies every packages/db/migrations/*.sql in filename order exactly once, inside a
// transaction, tracking applied files in a schema_migrations table.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePool } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

async function main(): Promise<void> {
  const pool = makePool(process.env.DATABASE_SERVICE_URL ?? process.env.DATABASE_URL);
  const client = await pool.connect();
  try {
    await client.query(`
      create table if not exists schema_migrations (
        filename   text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const applied = new Set(
      (await client.query<{ filename: string }>('select filename from schema_migrations')).rows.map(
        (r) => r.filename,
      ),
    );

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip  ${file} (already applied)`);
        continue;
      }
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      console.log(`apply ${file}`);
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (filename) values ($1)', [file]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
    console.log('migrations up to date');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
