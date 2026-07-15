// apps/worker/src/enqueue-tick.ts
// Dev/manual trigger: fire any schedules due now (doc 14 §4.1 publish.tick).
// Usage: npm run enqueue:tick -w @cos/worker
import { JOBS, QUEUES } from '@cos/shared';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue(QUEUES.runs, { connection });

async function main(): Promise<void> {
  const job = await queue.add(JOBS.publishTick, {});
  console.log(`enqueued ${JOBS.publishTick} job ${job.id}`);
  await queue.close();
  await connection.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
