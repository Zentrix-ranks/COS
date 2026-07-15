// apps/web/app/analytics/page.tsx
// Screen: Analytics tab. Source: spec/07-dashboard-ux-ui.md §6.2, spec/13 (analytics engine).
// Ranked recommendations (Accept/Reject → feeds ideation), top/bottom assets, cluster
// breakdown, and growth forecast with uncertainty bands.
import { Panel } from '@/ui/mission-control';
import { RecommendationActions } from '@/ui/recommendation-actions';
import { listClusters, listForecasts, listRecommendations, topBottomAssets } from '@/server/analytics';

export const dynamic = 'force-dynamic';

function pct(x: number | null): string {
  return x != null ? `${Math.round(Number(x) * 100)}%` : '—';
}

export default async function AnalyticsTab() {
  const recs = await listRecommendations();

  if (recs === null) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-lg font-semibold">Analytics</h1>
        <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          Database not connected. Set <code>DATABASE_URL</code> and run migrations/seed.
        </p>
      </main>
    );
  }

  const [{ top, bottom }, clusters, forecasts] = await Promise.all([topBottomAssets(), listClusters(), listForecasts()]);

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Analytics</h1>
        <a href="/" className="text-sm text-accent hover:underline">
          ← Mission Control
        </a>
      </header>

      <Panel title="Recommendations (prescriptive)">
        {recs.length === 0 ? (
          <p className="py-2 text-sm text-muted">No recommendations yet. Run the learning loop after metrics are collected.</p>
        ) : (
          <ul className="space-y-3">
            {recs.map((r) => (
              <li key={r.id} className="rounded-md border border-edge p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{r.title}</div>
                    <div className="mt-0.5 text-sm text-slate-300">{r.body}</div>
                    <div className="mt-1 text-xs text-muted">
                      confidence {pct(r.confidence)} · {r.status}
                    </div>
                  </div>
                  {r.status === 'proposed' ? <RecommendationActions id={r.id} /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Top assets">
          <ul className="space-y-1 text-sm">
            {top.length === 0 ? <li className="text-muted">No scores yet.</li> : null}
            {top.map((a) => (
              <li key={a.asset_id} className="flex items-center justify-between">
                <span className="truncate">{a.title ?? '(untitled)'}</span>
                <span className="text-emerald-300">{a.composite.toFixed(3)} {a.label === 'winner' ? '★' : ''}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Needs work">
          <ul className="space-y-1 text-sm">
            {bottom.length === 0 ? <li className="text-muted">No scores yet.</li> : null}
            {bottom.map((a) => (
              <li key={a.asset_id} className="flex items-center justify-between">
                <span className="truncate">{a.title ?? '(untitled)'}</span>
                <span className="text-muted">{a.composite.toFixed(3)} {a.label === 'loser' ? '↓' : ''}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Clusters (by dimension)">
        {clusters.length === 0 ? (
          <p className="py-2 text-sm text-muted">No clusters yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {clusters.map((c, i) => (
              <span key={`${c.dimension}-${c.label}-${i}`} className="rounded border border-edge px-2 py-1 text-xs">
                <span className="text-muted">{c.dimension}:</span> {c.label}{' '}
                <span className="text-accent">avg {c.avg_score?.toFixed(3) ?? '—'}</span>{' '}
                <span className="text-muted">n{c.size} · {pct(c.confidence)}</span>
              </span>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Forecast (heuristic, with bands)">
        {forecasts.length === 0 ? (
          <p className="py-2 text-sm text-muted">No forecast yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {forecasts.map((f, i) => (
              <li key={`${f.metric}-${f.horizon}-${i}`} className="flex items-center justify-between">
                <span className="text-muted">
                  {f.metric} · {f.horizon}
                </span>
                <span>
                  {Math.round(f.point ?? 0).toLocaleString()}{' '}
                  <span className="text-muted">
                    ({Math.round(f.lower ?? 0).toLocaleString()}–{Math.round(f.upper ?? 0).toLocaleString()})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </main>
  );
}
