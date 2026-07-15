// apps/web/server/queue.ts
// Control-plane → runtime enqueue. Source: spec/02 §3.1 (Approval service enqueues a resume),
// spec/06 §6 (on decision, enqueue a resume job that re-enters the graph at approval).
import 'server-only';
import { JOBS, QUEUES, type ApprovalDecision } from '@cos/shared';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

let queue: Queue | null = null;

function getQueue(): Queue | null {
  if (queue) return queue;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  queue = new Queue(QUEUES.runs, { connection });
  return queue;
}

export async function enqueuePipelineResume(args: {
  runId: string;
  decision: ApprovalDecision;
  note?: string | undefined;
}): Promise<boolean> {
  const q = getQueue();
  if (!q) return false;
  await q.add(JOBS.pipelineResume, args);
  return true;
}
