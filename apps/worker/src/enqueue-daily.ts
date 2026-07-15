// apps/worker/src/enqueue-daily.ts
// Dev/manual trigger: run the daily automation loop now (doc 14 §5 manual triggers).
// Usage: npm run enqueue:daily -w @cos/worker
import { JOBS, QUEUES } from '@cos/shared';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue(QUEUES.runs, { connection });

async function main(): Promise<void> {
  const job = await queue.add(JOBS.dailyKickoff, {});
  console.log(`enqueued ${JOBS.dailyKickoff} job ${job.id}`);
  await queue.close();
  await connection.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
