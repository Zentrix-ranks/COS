// apps/web/app/page.tsx
// Screen: Mission Control (home). Source: spec/07-dashboard-ux-ui.md §5 (layout + §5.1 data map).
// M0 skeleton: static placeholder data mirrors the founding sketch. Data sources to wire next:
//   KPI row        -> v_today_progress            (packages/db migrations/0013)
//   Health pill    -> health_snapshots            (§11)
//   Running Agents -> v_running_agents + SSE       (doc 02 §3.1 realtime hub)
//   Task Queue     -> tasks                        (§5.2)
//   Notifications  -> notifications                (§11)
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
import type { Department } from '@cos/shared';

// --- Placeholder data (M0). Replace with DB view reads in the next slice. ---
const progress = { completed: 18, total: 22 };
const progressPct = Math.round((progress.completed / progress.total) * 100);

const departments: Array<Department | 'research'> = [
  'strategy',
  'research',
  'creative',
  'design',
  'publishing',
  'analytics',
  'operations',
];

const runningAgents = [
  { agent: 'CEO Agent', verb: 'Thinking…' },
  { agent: 'Creative Director', verb: 'Reel #52' },
  { agent: 'Trend Researcher', verb: 'Reddit' },
  { agent: 'Instagram Analyst', verb: 'Metrics' },
  { agent: 'Canva Designer', verb: 'Carousel' },
];

const taskQueue = [
  { title: 'Weekly Market Report', done: true },
  { title: 'Reel #18', done: true },
  { title: 'Carousel #44', done: true },
  { title: 'Hook Optimisation', done: false },
  { title: 'Competitor Analysis', done: false },
];

const notifications = ['⚑ New Trend Detected', '↑ IG Reach +27%', '⏱ Best time updated'];

export default function MissionControl() {
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">
          ZENTRIX OS <span className="text-muted">· Content Operating System</span>
        </h1>
        <StatusPill label="Excellent" />
      </header>

      {/* KPI row (doc 07 §5.1) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-edge bg-panel p-4">
          <div className="text-xs uppercase tracking-wider text-muted">Today&apos;s Progress</div>
          <div className="mt-1 text-2xl font-semibold">{progressPct}%</div>
          <ProgressBar percent={progressPct} />
        </div>
        <StatTile label="Content" value={`${progress.completed} / ${progress.total}`} />
        <StatTile label="Pending Reviews" value="4" />
        <StatTile label="Scheduled Posts" value="9" />
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
          <ul className="divide-y divide-edge">
            {runningAgents.map((a) => (
              <AgentStatusRow key={a.agent} agent={a.agent} verb={a.verb} />
            ))}
          </ul>
        </Panel>
        <Panel title="Task Queue">
          <ul className="divide-y divide-edge">
            {taskQueue.map((t) => (
              <TaskQueueItem key={t.title} title={t.title} done={t.done} />
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Notifications">
        <div className="flex flex-wrap gap-2">
          {notifications.map((n) => (
            <NotificationItem key={n} text={n} />
          ))}
        </div>
      </Panel>

      <p className="pt-2 text-center text-xs text-muted">
        M0 skeleton · placeholder data · see spec/07 §5 and spec/16 §6 (M0)
      </p>
    </main>
  );
}
