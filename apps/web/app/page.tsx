// apps/web/app/page.tsx
// Screen: Mission Control (home). Source: spec/07-dashboard-ux-ui.md §5 (layout + §5.1 data map).
// Reads live data from the DB views (v_today_progress, v_running_agents), tasks, and
// notifications (doc 04 §13). When the DB isn't configured/reachable it falls back to the
// founding-sketch placeholders and shows an offline hint (doc 07 §5.3). Live updates are
// driven by worker events over SSE via <RealtimeRefresher/> (doc 02 §3.1, doc 07 §5.2).
import {
  AgentStatusRow,
  DepartmentTile,
  NotificationItem,
  Panel,
  ProgressBar,
  StatTile,
  StatusPill,
  TaskQueueItem,
} from '@/ui/mission-control';
import { RealtimeRefresher } from '@/ui/realtime-refresher';
import {
  getHealth,
  getNotifications,
  getRunningAgents,
  getTaskQueue,
  getTodayProgress,
} from '@/server/db';
import type { Department } from '@cos/shared';

export const dynamic = 'force-dynamic'; // live reads; never statically prerendered.

const departments: Array<Department | 'research'> = [
  'strategy',
  'research',
  'creative',
  'design',
  'publishing',
  'analytics',
  'operations',
];

// Founding-sketch fallbacks (doc 07 §5) used only when the DB is unavailable.
const FALLBACK_AGENTS = [
  { agent: 'CEO Agent', verb: 'Thinking…' },
  { agent: 'Creative Director', verb: 'Reel #52' },
  { agent: 'Trend Researcher', verb: 'Reddit' },
];
const FALLBACK_TASKS = [
  { title: 'Weekly Market Report', done: true },
  { title: 'Hook Optimisation', done: false },
];
const FALLBACK_NOTES = ['⚑ New Trend Detected', '↑ IG Reach +27%'];

export default async function MissionControl() {
  const [progress, agents, tasks, notes, health] = await Promise.all([
    getTodayProgress(),
    getRunningAgents(),
    getTaskQueue(),
    getNotifications(),
    getHealth(),
  ]);

  const offline = progress === null && agents === null && tasks === null;

  const completed = progress?.completed ?? 0;
  const total = progress?.total ?? 0;
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const pendingReviews = progress?.pending_reviews ?? 0;
  const scheduled = progress?.scheduled ?? 0;

  const runningAgents =
    agents && agents.length > 0
      ? agents.map((a) => ({
          agent: a.agent_name ?? a.agent_id ?? a.graph,
          verb: a.current_node ?? a.graph,
        }))
      : offline
        ? FALLBACK_AGENTS
        : [];

  const taskQueue =
    tasks && tasks.length > 0
      ? tasks.map((t) => ({ title: t.title, done: t.status === 'done' }))
      : offline
        ? FALLBACK_TASKS
        : [];

  const notifications =
    notes && notes.length > 0 ? notes.map((n) => n.title) : offline ? FALLBACK_NOTES : [];

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight">
          ZENTRIX OS <span className="text-muted">· Content Operating System</span>
        </h1>
        <div className="flex items-center gap-3">
          <a href="/approvals" className="text-sm text-accent hover:underline">
            Approvals{pendingReviews > 0 ? ` (${pendingReviews})` : ''}
          </a>
          <RealtimeRefresher />
          <StatusPill label={health?.ig_health ?? health?.overall ?? (offline ? 'Unknown' : 'Excellent')} />
        </div>
      </header>

      {offline ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          Database not connected — showing placeholder data. Set <code>DATABASE_URL</code>, run{' '}
          <code>npm run db:migrate &amp;&amp; npm run db:seed</code>, and reload. (doc 07 §5.3)
        </div>
      ) : null}

      {/* KPI row (doc 07 §5.1) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-edge bg-panel p-4">
          <div className="text-xs uppercase tracking-wider text-muted">Today&apos;s Progress</div>
          <div className="mt-1 text-2xl font-semibold">{progressPct}%</div>
          <ProgressBar percent={progressPct} />
        </div>
        <StatTile label="Content" value={`${completed} / ${total}`} />
        <StatTile label="Pending Reviews" value={String(pendingReviews)} />
        <StatTile label="Scheduled Posts" value={String(scheduled)} />
      </div>

      {/* Departments (doc 07 §5.1) */}
      <Panel title="Departments">
        <div className="flex flex-wrap gap-2">
          {departments.map((d) => (
            <DepartmentTile key={d} name={d} />
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Running Agents (live)">
          {runningAgents.length > 0 ? (
            <ul className="divide-y divide-edge">
              {runningAgents.map((a, i) => (
                <AgentStatusRow key={`${a.agent}-${i}`} agent={a.agent} verb={a.verb} />
              ))}
            </ul>
          ) : (
            <p className="py-2 text-sm text-muted">No agents running.</p>
          )}
        </Panel>
        <Panel title="Task Queue">
          {taskQueue.length > 0 ? (
            <ul className="divide-y divide-edge">
              {taskQueue.map((t, i) => (
                <TaskQueueItem key={`${t.title}-${i}`} title={t.title} done={t.done} />
              ))}
            </ul>
          ) : (
            <p className="py-2 text-sm text-muted">Queue empty.</p>
          )}
        </Panel>
      </div>

      <Panel title="Notifications">
        {notifications.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {notifications.map((n, i) => (
              <NotificationItem key={`${n}-${i}`} text={n} />
            ))}
          </div>
        ) : (
          <p className="py-2 text-sm text-muted">No new notifications.</p>
        )}
      </Panel>

      <p className="pt-2 text-center text-xs text-muted">
        M0 · live reads from v_today_progress / v_running_agents / tasks / notifications · realtime via SSE
      </p>
    </main>
  );
}
