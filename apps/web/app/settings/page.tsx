// apps/web/app/settings/page.tsx
// Settings → Automation. Source: spec/07 §9, spec/14 §11.
import { SettingsForm } from '@/ui/settings-form';
import { getAutomationSettings } from '@/server/settings';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const settings = await getAutomationSettings();
  if (settings === null) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">Database not connected.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Settings · Automation</h1>
        <a href="/operations" className="text-sm text-accent hover:underline">Operations →</a>
      </header>
      <SettingsForm initial={settings} />
    </main>
  );
}
