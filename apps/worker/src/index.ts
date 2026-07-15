// apps/worker/src/index.ts
// Agent-runtime worker bootstrap. Source: spec/02-system-architecture.md §3.2 (workers),
// §5 (enqueue/realtime paths); spec/16 §6 (M0: worker runs a no-op agent end-to-end).
// M0 scope: consume the runs queue and execute the no-op agent. LangGraph orchestrator,
// real agent executors, and MCP clients arrive in M1+.
import { makePool } from '@cos/db';
import { JOBS, QUEUES } from '@cos/shared';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { runNoopAgent } from '../agents/noop.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const publisher = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const db = makePool(process.env.DATABASE_SERVICE_URL ?? process.env.DATABASE_URL);

const worker = new Worker(
  QUEUES.runs,
  async (job) => {
    switch (job.name) {
      case JOBS.noop: {
        const taskId = (job.data as { taskId?: string } | undefined)?.taskId;
        const { runId } = await runNoopAgent(db, publisher, taskId);
        return { runId };
      }
      default:
        throw new Error(`Unknown job on ${QUEUES.runs}: ${job.name}`);
    }
  },
  { connection, concurrency: 4 },
);

worker.on('completed', (job, result) => {
  console.log(`[worker] ${job.name} completed`, result);
});
worker.on('failed', (job, err) => {
  console.error(`[worker] ${job?.name} failed:`, err.message);
});

console.log(`[worker] listening on queue '${QUEUES.runs}' (redis: ${redisUrl})`);

// Graceful shutdown (doc 02 §8.4 resilience; hardened further in M5).
async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} received, draining…`);
  await worker.close();
  await connection.quit();
  await publisher.quit();
  await db.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
