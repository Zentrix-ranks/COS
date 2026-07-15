// apps/web/app/approvals/page.tsx
// Screen: Approvals queue + Asset Detail drawer. Source: spec/07-dashboard-ux-ui.md §7/§7.1.
// The operator's human-by-exception surface: assets waiting on a decision, each with full
// content, all pipeline stage results, confidence, and one-click Approve/Request/Reject.
import { ApprovalActions } from '@/ui/approval-actions';
import { RealtimeRefresher } from '@/ui/realtime-refresher';
import { getAssetBody, getAssetStageRuns, listPendingApprovals } from '@/server/approvals';

export const dynamic = 'force-dynamic';

export default async function ApprovalsQueue() {
  const pending = await listPendingApprovals();

  if (pending === null) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-lg font-semibold">Approvals</h1>
        <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          Database not connected. Set <code>DATABASE_URL</code> and run migrations/seed.
        </p>
      </main>
    );
  }

  const details = await Promise.all(
    pending.map(async (a) => ({
      approval: a,
      stages: await getAssetStageRuns(a.asset_id),
      body: await getAssetBody(a.asset_id),
    })),
  );

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">
          Approvals <span className="text-muted">· {pending.length} waiting</span>
        </h1>
        <RealtimeRefresher />
      </header>

      {details.length === 0 ? (
        <p className="rounded-lg border border-edge bg-panel px-4 py-8 text-center text-sm text-muted">
          Nothing awaiting approval. The pipeline runs human-by-exception.
        </p>
      ) : null}

      {details.map(({ approval: a, stages, body }) => (
        <article key={a.approval_id} className="rounded-lg border border-edge bg-panel p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">{a.title ?? '(untitled)'}</h2>
            <span className="text-xs uppercase tracking-wider text-muted">
              {a.type} · confidence {a.confidence != null ? Math.round(Number(a.confidence) * 100) + '%' : '—'}
            </span>
          </div>
          {a.hook ? <p className="mt-1 text-sm text-slate-300">Hook: “{a.hook}”</p> : null}

          {/* Content preview (doc 07 §7.1) */}
          {body?.slides?.length ? (
            <ol className="mt-3 space-y-1 text-sm">
              {body.slides.map((s) => (
                <li key={s.n} className="flex gap-2">
                  <span className="text-muted">{s.n}.</span>
                  <span>{s.text}</span>
                </li>
              ))}
            </ol>
          ) : null}
          {a.caption ? <p className="mt-2 text-xs text-muted">Caption: {a.caption}</p> : null}
          {a.hashtags?.length ? <p className="mt-1 text-xs text-accent">{a.hashtags.join(' ')}</p> : null}

          {/* Pipeline stage results (doc 07 §7.1) */}
          <div className="mt-3">
            <div className="mb-1 text-xs uppercase tracking-wider text-muted">Pipeline stages</div>
            <div className="flex flex-wrap gap-1.5">
              {stages.map((s, i) => (
                <span
                  key={`${s.stage}-${i}`}
                  title={s.notes ?? undefined}
                  className={`rounded px-2 py-0.5 text-xs ${
                    s.status === 'passed'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : s.status === 'failed'
                        ? 'bg-rose-500/15 text-rose-300'
                        : 'bg-edge text-muted'
                  }`}
                >
                  {s.stage}
                  {s.status === 'skipped' ? ' (stub)' : ''}
                </span>
              ))}
            </div>
          </div>

          <ApprovalActions approvalId={a.approval_id} />
        </article>
      ))}
    </main>
  );
}
