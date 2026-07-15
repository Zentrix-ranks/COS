// apps/web/app/publishing/page.tsx
// Publishing tab. Source: spec/07 §6.3 (per-platform scheduled/published + permalinks),
// spec/12 §4.14–§4.16.
import { Panel } from '@/ui/mission-control';
import { getPublishing } from '@/server/publishing';

export const dynamic = 'force-dynamic';

export default async function PublishingTab() {
  const data = await getPublishing();
  if (data === null) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-lg font-semibold">Publishing</h1>
        <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">Database not connected.</p>
      </main>
    );
  }
  const { scheduled, published } = data;
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Publishing</h1>
        <a href="/" className="text-sm text-accent hover:underline">← Mission Control</a>
      </header>

      <Panel title={`Scheduled (${scheduled.length})`}>
        {scheduled.length === 0 ? (
          <p className="py-2 text-sm text-muted">Nothing scheduled.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {scheduled.map((s, i) => (
              <li key={i} className="flex items-center justify-between">
                <span className="truncate">{s.title ?? '(untitled)'} <span className="text-muted">· {s.platform}</span></span>
                <span className="text-xs text-muted">{new Date(s.scheduled_at).toLocaleString()} · {s.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={`Published (${published.length})`}>
        {published.length === 0 ? (
          <p className="py-2 text-sm text-muted">Nothing published yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {published.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="truncate">
                  {p.permalink ? (
                    <a href={p.permalink} className="text-accent hover:underline" target="_blank" rel="noreferrer">
                      {p.title ?? '(untitled)'}
                    </a>
                  ) : (
                    (p.title ?? '(untitled)')
                  )}
                  <span className="text-muted"> · {p.platform}</span>
                </span>
                <span className="whitespace-nowrap text-xs text-muted">
                  {p.status}
                  {p.reach != null ? ` · reach ${Number(p.reach).toLocaleString()}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </main>
  );
}
