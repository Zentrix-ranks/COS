// apps/web/ui/mission-control.tsx
// Mission Control primitives. Source: spec/07-dashboard-ux-ui.md §5 (screen + §5.1 components).
// M0 renders placeholder data (doc 16 M0: "live-ish placeholder status"); wire to the DB views
// v_today_progress / v_running_agents / v_pending_approvals and realtime SSE in later slices.
import type { Department } from '@cos/shared';

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-edge bg-panel p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
      {children}
    </section>
  );
}

/** KPI tile (doc 07 §5.1: 4× StatTile). */
export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-edge bg-panel p-4">
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

export function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded bg-edge">
      <div className="h-full rounded bg-accent" style={{ width: `${clamped}%` }} />
    </div>
  );
}

/** Health pill (doc 07 §5.1). health_snapshots.overall/ig_health. */
export function StatusPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-edge bg-panel px-3 py-1 text-sm">
      <span className="h-2 w-2 rounded-full bg-emerald-400" />
      health: {label}
    </span>
  );
}

export function DepartmentTile({ name }: { name: Department | 'research' }) {
  const pretty = name.charAt(0).toUpperCase() + name.slice(1);
  return (
    <button className="rounded-md border border-edge bg-panel px-3 py-2 text-sm transition-colors hover:border-accent">
      <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />
      {pretty}
    </button>
  );
}

export function AgentStatusRow({ agent, verb }: { agent: string; verb: string }) {
  return (
    <li className="flex items-center justify-between py-1.5 text-sm">
      <span className="flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
        {agent}
      </span>
      <span className="text-muted">{verb}</span>
    </li>
  );
}

export function TaskQueueItem({ title, done }: { title: string; done: boolean }) {
  return (
    <li className="flex items-center gap-2 py-1.5 text-sm">
      <span className={done ? 'text-emerald-400' : 'text-muted'}>{done ? '✓' : '○'}</span>
      <span className={done ? 'text-slate-300' : ''}>{title}</span>
    </li>
  );
}

export function NotificationItem({ text }: { text: string }) {
  return <span className="whitespace-nowrap rounded-full border border-edge px-3 py-1 text-xs text-muted">{text}</span>;
}
