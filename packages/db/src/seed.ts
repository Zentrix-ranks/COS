// packages/db/src/seed.ts
// Idempotent seed loader (spec/04-database-schema.md §15).
// Loads: the 36 agent contracts (seed/agents.json, canonical from Appendix A2) and
// system_settings defaults (seed/system_settings.json). Re-running upserts, never duplicates.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePool } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));
const seedDir = join(here, '..', 'seed');

interface AgentSeed {
  id: string;
  name: string;
  tier: string;
  department: string;
  reports_to: string | null;
  goal: string;
  responsibilities: unknown;
  tools: unknown;
  inputs: unknown;
  outputs: unknown;
  memory_policy: unknown;
  permissions: unknown;
  channels: unknown;
  retry_policy: unknown;
  failure_policy: unknown;
  model_policy: unknown;
  eval_policy: unknown;
}

async function main(): Promise<void> {
  const agents = JSON.parse(readFileSync(join(seedDir, 'agents.json'), 'utf8')) as AgentSeed[];
  const settings = JSON.parse(readFileSync(join(seedDir, 'system_settings.json'), 'utf8')) as Record<
    string,
    unknown
  >;

  const pool = makePool(process.env.DATABASE_SERVICE_URL ?? process.env.DATABASE_URL);
  const client = await pool.connect();
  try {
    await client.query('begin');

    // Agents are inserted in file order (A2 is parent-first: ceo → heads → specialists),
    // which satisfies the self-referential reports_to FK (doc 04 §5.1).
    for (const a of agents) {
      await client.query(
        `insert into agents (
           id, name, tier, department, reports_to, goal, responsibilities, tools, inputs,
           outputs, memory_policy, permissions, channels, retry_policy, failure_policy,
           model_policy, eval_policy
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         on conflict (id) do update set
           name=excluded.name, tier=excluded.tier, department=excluded.department,
           reports_to=excluded.reports_to, goal=excluded.goal,
           responsibilities=excluded.responsibilities, tools=excluded.tools,
           inputs=excluded.inputs, outputs=excluded.outputs,
           memory_policy=excluded.memory_policy, permissions=excluded.permissions,
           channels=excluded.channels, retry_policy=excluded.retry_policy,
           failure_policy=excluded.failure_policy, model_policy=excluded.model_policy,
           eval_policy=excluded.eval_policy, updated_at=now()`,
        [
          a.id,
          a.name,
          a.tier,
          a.department,
          a.reports_to,
          a.goal,
          JSON.stringify(a.responsibilities ?? []),
          JSON.stringify(a.tools ?? []),
          JSON.stringify(a.inputs ?? []),
          JSON.stringify(a.outputs ?? []),
          JSON.stringify(a.memory_policy ?? {}),
          JSON.stringify(a.permissions ?? {}),
          JSON.stringify(a.channels ?? {}),
          JSON.stringify(a.retry_policy ?? {}),
          JSON.stringify(a.failure_policy ?? {}),
          JSON.stringify(a.model_policy ?? {}),
          JSON.stringify(a.eval_policy ?? {}),
        ],
      );
    }

    for (const [key, value] of Object.entries(settings)) {
      await client.query(
        `insert into system_settings (key, value) values ($1, $2)
         on conflict (key) do update set value=excluded.value, updated_at=now()`,
        [key, JSON.stringify(value)],
      );
    }

    await client.query('commit');
    console.log(`seeded ${agents.length} agents and ${Object.keys(settings).length} settings`);
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
