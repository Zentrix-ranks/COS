// apps/web/app/runs/page.tsx
// Runs list. Source: spec/07 §8 (recent/active runs with graph, status, cost, duration).
import { Panel } from '@/ui/mission-control';
import { listRuns } from '@/server/runs';

export const dynamic = 'force-dynamic';

function duration(a: string, b: string | null): string {
  const end = b ? new Date(b).getTime() : Date.now();
  const s = Math.max(0, Math.round((end - new Date(a).getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
const STATUS_COLOR: Record<string, string> = {
  completed: 'text-emerald-300',
  running: 'text-accent',
  paused: 'text-amber-300',
  failed: 'text-rose-300',
};

export default async function RunsList() {
  const runs = await listRuns();
  if (runs === null) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-lg font-semibold">Runs</h1>
        <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">Database not connected.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Runs</h1>
        <a href="/" className="text-sm text-accent hover:underline">← Mission Control</a>
      </header>
      <Panel title={`${runs.length} recent runs`}>
        {runs.length === 0 ? (
          <p className="py-2 text-sm text-muted">No runs yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted">
                <th className="py-1">Graph</th>
                <th>Status</th>
                <th>Node</th>
                <th className="text-right">Cost</th>
                <th className="text-right">Dur</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-edge">
                  <td className="py-1.5">{r.graph}</td>
                  <td className={STATUS_COLOR[r.status] ?? ''}>{r.status}</td>
                  <td className="text-muted">{r.current_node ?? '—'}</td>
                  <td className="text-right">${r.cost_usd.toFixed(4)}</td>
                  <td className="text-right text-muted">{duration(r.started_at, r.finished_at)}</td>
                  <td className="text-right">
                    <a href={`/runs/${r.id}`} className="text-accent hover:underline">
                      inspect →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </main>
  );
}
