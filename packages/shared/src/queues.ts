// packages/shared/src/queues.ts
// Canonical BullMQ queue + Redis pub/sub channel names shared by control plane and workers.
// Source: spec/02-system-architecture.md §5 (enqueue/realtime paths), §6.1 (daily loop).

export const QUEUES = {
  /** Agent-runtime jobs: run a graph / agent (enqueue → worker consumes). */
  runs: 'cos.runs',
  /** Idempotent outward publishing jobs (doc 12 §publishing, doc 08 §4). */
  publish: 'cos.publish',
  /** Analytics collection + learning jobs (doc 13). */
  analytics: 'cos.analytics',
  /** Scheduled/cron-produced jobs, e.g. daily_kickoff (doc 14). */
  scheduler: 'cos.scheduler',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Redis pub/sub channel carrying realtime run/step events to the control-plane hub. */
export const REALTIME_CHANNEL = 'cos.realtime';

/** Well-known job names. M0 ships the no-op to prove the enqueue→run→dashboard loop. */
export const JOBS = {
  noop: 'noop',
  dailyKickoff: 'daily_kickoff',
  /** M1: start a carousel pipeline run for an asset (doc 12, doc 16 §6 M1). */
  pipelineCarousel: 'pipeline.carousel',
  /** M1: resume a pipeline run paused at the HITL approval interrupt (doc 06 §6). */
  pipelineResume: 'pipeline.resume',
  /** M3: run the learning loop — score → cluster → recommend → forecast → promote (doc 13). */
  learn: 'analytics.learn',
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];
