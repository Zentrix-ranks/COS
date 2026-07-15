// apps/worker/src/enqueue-resume.ts
// Dev helper: enqueue a pipeline resume (simulates the Approval service, doc 06 §6).
// Usage: npm run enqueue:resume -w @cos/worker -- <runId> <approved|changes_requested|rejected> [note]
import { JOBS, QUEUES, type ApprovalDecision } from '@cos/shared';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue(QUEUES.runs, { connection });

async function main(): Promise<void> {
  const runId = process.argv[2];
  const decision = (process.argv[3] ?? 'approved') as ApprovalDecision;
  const note = process.argv[4];
  if (!runId) throw new Error('usage: enqueue:resume <runId> <decision> [note]');
  const job = await queue.add(JOBS.pipelineResume, { runId, decision, note });
  console.log(`enqueued ${JOBS.pipelineResume} job ${job.id}: run ${runId} → ${decision}`);
  await queue.close();
  await connection.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
