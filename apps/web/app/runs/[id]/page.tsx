// apps/web/app/runs/[id]/page.tsx
// Run Inspector. Source: spec/07 §8 (timeline of run_steps — each node with agent, input,
// reasoning summary, tool calls, output, and where an HITL interrupt occurred; memories used),
// spec/05 §9 (memories used shown). The transparency backbone.
import { Panel } from '@/ui/mission-control';
import { getRunDetail } from '@/server/runs';

export const dynamic = 'force-dynamic';

const STEP_COLOR: Record<string, string> = {
  passed: 'border-emerald-500/40',
  failed: 'border-rose-500/40',
  running: 'border-accent/40',
  skipped: 'border-edge',
};

export default async function RunInspector({ params }: { params: { id: string } }) {
  const detail = await getRunDetail(params.id);
  if (!detail) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-lg font-semibold">Run not found</h1>
        <a href="/runs" className="mt-4 inline-block text-sm text-accent hover:underline">← Runs</a>
      </main>
    );
  }
  const { run, steps, toolCalls, interruptedAt } = detail;

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">
          Run <span className="text-muted">· {run.graph}</span>
        </h1>
        <a href="/runs" className="text-sm text-accent hover:underline">← Runs</a>
      </header>

      <div className="flex flex-wrap gap-2 text-xs text-muted">
        <span className="rounded border border-edge px-2 py-1">status: {run.status}</span>
        <span className="rounded border border-edge px-2 py-1">steps: {run.steps_used}</span>
        <span className="rounded border border-edge px-2 py-1">cost: ${run.cost_usd.toFixed(4)}</span>
        <span className="rounded border border-edge px-2 py-1">tool calls: {toolCalls.length}</span>
        {interruptedAt ? (
          <span className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-amber-200">⏸ interrupted at: {interruptedAt} (HITL)</span>
        ) : null}
      </div>

      <Panel title="Timeline">
        {steps.length === 0 ? (
          <p className="py-2 text-sm text-muted">No steps recorded.</p>
        ) : (
          <ol className="space-y-3">
            {steps.map((s) => (
              <li key={s.seq} className={`rounded-md border-l-2 ${STEP_COLOR[s.status] ?? 'border-edge'} bg-panel/60 py-2 pl-3`}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    <span className="text-muted">{s.seq}.</span> {s.node}
                    {s.agent_id ? <span className="ml-2 text-xs text-muted">· {s.agent_id}</span> : null}
                  </div>
                  <span className="text-xs text-muted">
                    {s.status} · ${s.cost_usd.toFixed(4)} · {s.tokens_in}/{s.tokens_out} tok
                  </span>
                </div>
                {s.input?.recalled && s.input.recalled.length ? (
                  <div className="mt-1 text-xs text-muted">
                    <span className="text-accent">memories used:</span> {s.input.recalled.slice(0, 4).join(' · ')}
                    {s.input.recalled.length > 4 ? ` +${s.input.recalled.length - 4}` : ''}
                  </div>
                ) : null}
                {s.reasoning_summary ? <div className="mt-1 text-sm text-slate-300">{s.reasoning_summary}</div> : null}
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {toolCalls.length ? (
        <Panel title="Tool calls">
          <ul className="space-y-1 text-sm">
            {toolCalls.map((t, i) => (
              <li key={`${t.tool}-${i}`} className="flex items-center justify-between">
                <span>{t.tool}</span>
                <span className="text-xs text-muted">
                  {t.ok === false ? '✗' : '✓'} · {t.latency_ms ?? 0}ms · ${t.cost_usd.toFixed(4)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </main>
  );
}
