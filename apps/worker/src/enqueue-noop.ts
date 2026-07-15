// apps/worker/src/enqueue-noop.ts
// Dev helper: enqueue a single no-op job to prove the M0 loop (doc 16 §6 M0 DoD).
// Usage: npm run enqueue:noop -w @cos/worker
import { JOBS, QUEUES } from '@cos/shared';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue(QUEUES.runs, { connection });

async function main(): Promise<void> {
  const job = await queue.add(JOBS.noop, {});
  console.log(`enqueued ${JOBS.noop} job ${job.id} on '${QUEUES.runs}'`);
  await queue.close();
  await connection.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
