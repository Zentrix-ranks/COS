// apps/worker/src/enqueue-learn.ts
// Dev helper: run the learning loop (doc 13 §11 jobs; here on demand).
// Usage: npm run enqueue:learn -w @cos/worker
import { JOBS, QUEUES } from '@cos/shared';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue(QUEUES.runs, { connection });

async function main(): Promise<void> {
  const job = await queue.add(JOBS.learn, {});
  console.log(`enqueued ${JOBS.learn} job ${job.id}`);
  await queue.close();
  await connection.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
