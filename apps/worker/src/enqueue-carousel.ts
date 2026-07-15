// apps/worker/src/enqueue-carousel.ts
// Dev helper: kick a carousel pipeline run (doc 16 §6 M1).
// Usage: npm run enqueue:carousel -w @cos/worker -- "Your idea title" "optional angle"
import { JOBS, QUEUES } from '@cos/shared';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue(QUEUES.runs, { connection });

async function main(): Promise<void> {
  const title = process.argv[2] ?? 'Why most funded traders fail in week one';
  const angle = process.argv[3] ?? 'contrarian, risk-first';
  const job = await queue.add(JOBS.pipelineCarousel, { title, angle });
  console.log(`enqueued ${JOBS.pipelineCarousel} job ${job.id}: "${title}"`);
  await queue.close();
  await connection.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
