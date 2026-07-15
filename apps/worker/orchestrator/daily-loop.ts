// apps/worker/orchestrator/daily-loop.ts
// The daily automation loop (the `ceo` graph kickoff). Source: spec/06 §5.1 (ceo graph),
// spec/14 §2 (daily loop), spec/13 §9 (weekly report). Runs unattended: strategy → ideation →
// fan-out to pipeline runs → approve-by-exception (auto-approve eligible, else HITL) → publish
// + measure for auto-approved → learn → weekly report → CEO daily summary. Bounded fan-out
// concurrency (doc 06 §9).
import { randomUUID } from 'node:crypto';
import type { Pool } from '@cos/db';
import type { AssetType } from '@cos/shared';
import { runLearning } from '../analytics/learning.js';
import { composeWeeklyReport } from '../analytics/weekly.js';
import { delegate } from '../comms/bus.js';
import { notify } from '../notify/notify.js';
import { type PipelineDeps, startPipeline } from './carousel-run.js';

const FANOUT = 6; // bounded concurrent pipeline runs (doc 06 §9, doc 14 §6)

interface Idea {
  id: string;
  format: AssetType;
  title: string;
  angle: string;
}

export interface DailyLoopResult {
  ideas: number;
  published: number;
  pendingApproval: number;
  recommendations: number;
  weeklyReportId: string;
  correlationId: string;
}

export async function runDailyLoop(deps: PipelineDeps): Promise<DailyLoopResult> {
  const db = deps.db;
  const corr = randomUUID();

  // 1. Strategy (CEO → CSO). Trend detection produces a few scored trends (doc 12 §4.1).
  await delegate(db, { from: 'ceo', to: 'cso', subject: 'Daily strategy brief', correlationId: corr });
  await db.query(
    `insert into trends (title, source, relevance, momentum, keywords) values
       ('Prop-firm rule changes this week','web',0.82,0.7,array['prop','rules']),
       ('SMC liquidity sweeps trending','reddit',0.78,0.75,array['smc','liquidity'])`,
  );

  // 2. Ideation (CEO → Creative Director). Generate a prioritized mix across formats (doc 12 §4.3).
  await delegate(db, { from: 'ceo', to: 'creative_director', subject: "Generate today's content ideas", correlationId: corr });
  const ideas = await generateIdeas(db);

  // 3. Fan-out: run each idea through the pipeline (bounded concurrency).
  let published = 0;
  let pendingApproval = 0;
  for (let i = 0; i < ideas.length; i += FANOUT) {
    const batch = ideas.slice(i, i + FANOUT);
    const outs = await Promise.all(
      batch.map((idea) => startPipeline(deps, { format: idea.format, title: idea.title, angle: idea.angle, ideaId: idea.id, correlationId: corr })),
    );
    for (const o of outs) {
      if (o.status === 'paused') pendingApproval++;
      else if (o.status === 'completed' && o.decision === 'approved') published++;
    }
  }

  // 4. Approvals digest — notify the operator of what needs a human (approve-by-exception).
  if (pendingApproval > 0) {
    await notify(db, {
      severity: 'warning',
      title: `${pendingApproval} asset(s) awaiting your approval`,
      body: 'Review in the Approvals queue. High-confidence eligible formats were auto-published.',
      channels: ['in_app', 'slack'],
      data: { correlation_id: corr },
    });
  }

  // 5. Learn from what published (doc 13).
  const learn = await runLearning(db);

  // 6. Weekly report (composed + delivered, doc 13 §9).
  const report = await composeWeeklyReport(db);

  // 7. CEO daily summary (doc 06 §5.1).
  await notify(db, {
    severity: 'success',
    title: 'Daily loop complete',
    body: `${ideas.length} ideas · ${published} auto-published · ${pendingApproval} awaiting approval · ${learn.recommendations} new recommendation(s).`,
    channels: ['in_app'],
    data: { correlation_id: corr, weekly_report_id: report.reportId },
  });

  return { ideas: ideas.length, published, pendingApproval, recommendations: learn.recommendations, weeklyReportId: report.reportId, correlationId: corr };
}

/** Prioritized idea mix across all formats (doc 12 §6). Story/image are auto-approve-eligible. */
async function generateIdeas(db: Pool): Promise<Idea[]> {
  const seeds: Array<{ format: AssetType; title: string; angle: string; priority: number }> = [
    { format: 'carousel', title: 'Why most funded traders fail in week one', angle: 'contrarian, risk-first', priority: 10 },
    { format: 'reel', title: 'Stop trading breakouts — do this instead', angle: 'contrarian', priority: 20 },
    { format: 'story', title: 'Quick tip: set your risk before the session', angle: 'actionable', priority: 30 },
    { format: 'image', title: 'Risk-first mindset', angle: 'principle', priority: 40 },
  ];
  const out: Idea[] = [];
  for (const s of seeds) {
    const { rows } = await db.query<{ id: string }>(
      `insert into content_ideas (title, angle, format, status, priority_score, created_by)
       values ($1,$2,$3,'prioritized',$4,'creative_director') returning id`,
      [s.title, s.angle, s.format, 100 - s.priority],
    );
    out.push({ id: rows[0]!.id, format: s.format, title: s.title, angle: s.angle });
  }
  return out;
}
