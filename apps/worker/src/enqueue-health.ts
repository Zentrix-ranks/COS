// apps/worker/src/enqueue-health.ts
// Dev/manual trigger: run an ops health snapshot now (doc 14 §3 ops.healthcheck).
// Usage: npm run enqueue:health -w @cos/worker
import { JOBS, QUEUES } from '@cos/shared';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue(QUEUES.runs, { connection });

async function main(): Promise<void> {
  const job = await queue.add(JOBS.healthcheck, {});
  console.log(`enqueued ${JOBS.healthcheck} job ${job.id}`);
  await queue.close();
  await connection.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
