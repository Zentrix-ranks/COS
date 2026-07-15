// apps/web/app/operations/page.tsx
// Operations tab. Source: spec/07 §6.4 (tool status matrix, health, cost dashboard, logs),
// spec/02 §8, spec/14 §9.
import { Panel } from '@/ui/mission-control';
import { getOperations } from '@/server/operations';

export const dynamic = 'force-dynamic';

const OVERALL: Record<string, string> = { green: 'text-emerald-300', amber: 'text-amber-300', red: 'text-rose-300' };

export default async function OperationsTab() {
  const data = await getOperations();
  if (data === null) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-lg font-semibold">Operations</h1>
        <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">Database not connected.</p>
      </main>
    );
  }
  const { tools, health, costToday, costTotalToday, dlq, paused } = data;

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Operations</h1>
        <div className="flex items-center gap-3 text-sm">
          <a href="/settings" className="text-accent hover:underline">Settings</a>
          <a href="/" className="text-accent hover:underline">← Mission Control</a>
        </div>
      </header>

      {paused ? (
        <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          ⏸ Operation is <strong>paused</strong> (kill-switch). Generation jobs short-circuit; in-flight runs hold. Resume in Settings.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="System health">
          {health ? (
            <div className="space-y-1 text-sm">
              <div>Overall: <span className={OVERALL[health.overall] ?? ''}>{health.overall.toUpperCase()}</span></div>
              <div className="text-muted">IG health: {health.ig_health ?? '—'}</div>
              <div className="text-muted">Run success: {health.run_success_rate ?? '—'}% · queue depth {health.queue_depth ?? 0}</div>
              <div className="text-muted">Tool outages: {health.tool_outages ?? 0} · budget burn ${health.budget_burn_usd ?? 0}</div>
            </div>
          ) : (
            <p className="py-2 text-sm text-muted">No health snapshot yet. Run ops.healthcheck.</p>
          )}
        </Panel>
        <Panel title={`Cost today · $${costTotalToday.toFixed(4)}`}>
          {costToday.length === 0 ? (
            <p className="py-2 text-sm text-muted">No spend recorded today.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {costToday.map((c, i) => (
                <li key={`${c.agent_id}-${i}`} className="flex items-center justify-between">
                  <span>{c.agent_id ?? '(system)'}</span>
                  <span className="text-muted">${Number(c.usd).toFixed(4)} · {c.calls} calls</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Tool status">
        {tools.length === 0 ? (
          <p className="py-2 text-sm text-muted">No tool activity yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tools.map((t) => (
              <span
                key={t.tool}
                className={`rounded px-2 py-1 text-xs ${t.breaker_open ? 'bg-rose-500/15 text-rose-300' : t.healthy ? 'bg-emerald-500/15 text-emerald-300' : 'bg-edge text-muted'}`}
              >
                {t.breaker_open ? '⛔ ' : t.healthy ? '● ' : '○ '}
                {t.tool}
                {t.breaker_open ? ' (breaker open)' : ''}
              </span>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Dead-letter queue (recent)">
        {dlq.length === 0 ? (
          <p className="py-2 text-sm text-muted">No dead-lettered jobs. 🎉</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {dlq.map((d, i) => (
              <li key={i} className="flex items-center justify-between">
                <span className="text-rose-300">{d.target ?? 'job'}</span>
                <span className="text-xs text-muted">{new Date(d.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </main>
  );
}
