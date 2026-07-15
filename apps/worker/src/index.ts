// apps/worker/src/index.ts
// Agent-runtime worker bootstrap. Source: spec/02 §3.2 (workers), §5 (enqueue/realtime paths);
// spec/16 §6 (M0 no-op; M1 carousel pipeline). Consumes the runs queue: no-op, pipeline start,
// and pipeline resume (after HITL approval). LangGraph-style orchestration lives in orchestrator/.
import { makePool } from '@cos/db';
import { JOBS, QUEUES, REALTIME_CHANNEL, type ApprovalDecision } from '@cos/shared';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { runNoopAgent } from '../agents/noop.js';
import { getModelProvider } from '../model/provider.js';
import { getCanvaAdapter } from '../tools/canva.js';
import { getPublisherAdapter } from '../tools/instagram.js';
import { runLearning } from '../analytics/learning.js';
import { composeWeeklyReport } from '../analytics/weekly.js';
import { runDailyLoop } from '../orchestrator/daily-loop.js';
import { type PipelineDeps, resumeCarousel, startCarousel } from '../orchestrator/carousel-run.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const publisher = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const db = makePool(process.env.DATABASE_SERVICE_URL ?? process.env.DATABASE_URL);
const provider = getModelProvider();
const tools = { canva: getCanvaAdapter(), instagram: getPublisherAdapter() };

// Realtime path (doc 02 §5): worker emits → Redis pub/sub → control-plane hub → SSE → browser.
const publish: PipelineDeps['publish'] = (evt) => {
  void publisher.publish(REALTIME_CHANNEL, JSON.stringify({ kind: 'run.status', ...evt, at: Date.now() }));
};
const deps: PipelineDeps = { db, provider, tools, publish };

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
      case JOBS.learn: {
        const res = await runLearning(db);
        console.log('[worker] learning result', res);
        return res;
      }
      case JOBS.dailyKickoff: {
        const res = await runDailyLoop(deps);
        console.log('[worker] daily loop result', res);
        return res;
      }
      case JOBS.weeklyReport: {
        const res = await composeWeeklyReport(db);
        console.log('[worker] weekly report', res.reportId);
        return res;
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

// Register cron (repeatable BullMQ jobs) — the daily automation schedule (doc 14 §3).
// Repeatable jobs use stable jobIds so duplicates don't stack and survive restarts (§4).
const cronQueue = new Queue(QUEUES.runs, { connection });
async function registerCron(): Promise<void> {
  const entries: Array<{ name: string; cron: string }> = [
    { name: JOBS.dailyKickoff, cron: '0 6 * * *' }, // daily kickoff (operator tz)
    { name: JOBS.learn, cron: '30 5 * * *' }, // recluster + patterns + recommendations
    { name: JOBS.weeklyReport, cron: '0 9 * * 1' }, // Monday weekly report
  ];
  for (const e of entries) {
    await cronQueue.add(e.name, {}, { repeat: { pattern: e.cron }, jobId: `cron:${e.name}`, removeOnComplete: 100, removeOnFail: 100 });
  }
  console.log(`[worker] cron registered: ${entries.map((e) => `${e.name}(${e.cron})`).join(', ')}`);
}
if (process.env.COS_REGISTER_CRON !== '0') {
  registerCron().catch((err) => console.error('[worker] cron registration failed:', err.message));
}

// Graceful shutdown (doc 02 §8.4 resilience; hardened further in M5).
async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} received, draining…`);
  await worker.close();
  await cronQueue.close();
  await connection.quit();
  await publisher.quit();
  await db.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
