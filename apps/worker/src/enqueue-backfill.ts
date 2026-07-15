// apps/worker/src/enqueue-backfill.ts
// Dev/manual trigger: backfill missing embeddings (doc 05 §10).
// Usage: npm run enqueue:backfill -w @cos/worker
import { JOBS, QUEUES } from '@cos/shared';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue(QUEUES.runs, { connection });

async function main(): Promise<void> {
  const job = await queue.add(JOBS.embedBackfill, {});
  console.log(`enqueued ${JOBS.embedBackfill} job ${job.id}`);
  await queue.close();
  await connection.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
