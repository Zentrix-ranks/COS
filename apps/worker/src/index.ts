// apps/worker/src/index.ts
// Agent-runtime worker bootstrap. Source: spec/02 §3.2 (workers), §5 (enqueue/realtime paths);
// spec/16 §6 (M0 no-op; M1 carousel pipeline). Consumes the runs queue: no-op, pipeline start,
// and pipeline resume (after HITL approval). LangGraph-style orchestration lives in orchestrator/.
import { makePool } from '@cos/db';
import { JOBS, QUEUES, REALTIME_CHANNEL, type ApprovalDecision } from '@cos/shared';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { runNoopAgent } from '../agents/noop.js';
import { getModelProvider } from '../model/provider.js';
import { type PipelineDeps, resumeCarousel, startCarousel } from '../orchestrator/carousel-run.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const publisher = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const db = makePool(process.env.DATABASE_SERVICE_URL ?? process.env.DATABASE_URL);
const provider = getModelProvider();

// Realtime path (doc 02 §5): worker emits → Redis pub/sub → control-plane hub → SSE → browser.
const publish: PipelineDeps['publish'] = (evt) => {
  void publisher.publish(REALTIME_CHANNEL, JSON.stringify({ kind: 'run.status', ...evt, at: Date.now() }));
};
const deps: PipelineDeps = { db, provider, publish };

const worker = new Worker(
  QUEUES.runs,
  async (job) => {
    switch (job.name) {
      case JOBS.noop: {
        const taskId = (job.data as { taskId?: string } | undefined)?.taskId;
        const { runId } = await runNoopAgent(db, publisher, taskId);
        return { runId };
      }
      case JOBS.pipelineCarousel: {
        const data = job.data as { title: string; angle?: string; ideaId?: string };
        const out = await startCarousel(deps, { title: data.title, angle: data.angle ?? null, ideaId: data.ideaId ?? null });
        return out;
      }
      case JOBS.pipelineResume: {
        const data = job.data as { runId: string; decision: ApprovalDecision; note?: string };
        return resumeCarousel(deps, { runId: data.runId, decision: data.decision, note: data.note });
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

console.log(`[worker] listening on queue '${QUEUES.runs}' (redis: ${redisUrl}, model: ${provider.name})`);

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
