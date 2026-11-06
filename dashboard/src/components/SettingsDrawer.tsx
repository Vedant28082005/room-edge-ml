import { Download, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { buildCsv, downloadCsv } from '../lib/csv';
import { clearHistory, saveSettings, useStore, type Settings } from '../mqtt/store';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1 block">{label}</span>
      {children}
    </label>
  );
}
const input =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm num focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]';

export function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const device = useStore((s) => (s.selected ? s.devices[s.selected] : null));
  const [form, setForm] = useState<Settings>(settings);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm(settings);
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, settings, onClose]);

  if (!open) return null;
  const upd = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-modal="true" aria-label="Settings" className="fade-in absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-card">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">Settings</h2>
          <button ref={closeRef} className="btn !p-1.5" onClick={onClose} aria-label="Close settings">
            <X size={16} />
          </button>
        </header>
        <form
          className="flex-1 space-y-4 overflow-y-auto p-5"
          onSubmit={(e) => {
            e.preventDefault();
            saveSettings({ ...form, staleSec: Math.max(5, Number(form.staleSec) || 30) });
            onClose();
          }}
        >
          <Field label="Broker WebSocket URL">
            <input className={input} value={form.url} onChange={(e) => upd('url', e.target.value)} placeholder="ws://localhost:9001" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Username (optional)">
              <input className={input} value={form.username} autoComplete="off" onChange={(e) => upd('username', e.target.value)} />
            </Field>
            <Field label="Password (optional)">
              <input className={input} type="password" value={form.password} autoComplete="off" onChange={(e) => upd('password', e.target.value)} />
            </Field>
          </div>
          <Field label="Topic root">
            <input className={input} value={form.root} onChange={(e) => upd('root', e.target.value)} placeholder="edgeml/room/" required />
          </Field>
          <Field label="Stale timeout (seconds)">
            <input className={input} type="number" min={5} value={form.staleSec} onChange={(e) => upd('staleSec', Number(e.target.value))} />
          </Field>
          <p className="text-xs text-muted">Settings are stored in this browser's localStorage (including the password, if set). Saving reconnects to the broker.</p>
          <button type="submit" className="btn w-full !bg-text !text-bg hover:!opacity-90">
            Save & reconnect
          </button>
          <hr className="border-border" />
          <div className="flex gap-3">
            <button
              type="button"
              className="btn flex-1"
              disabled={!device || device.history.length === 0}
              onClick={() => {
                if (!device) return;
                const classes = device.info?.model.classes ?? [...new Set(device.history.flatMap((s) => Object.keys(s.proba ?? {})))];
                downloadCsv(`${device.id}-telemetry.csv`, buildCsv(device.history, classes));
              }}
            >
              <Download size={15} /> Export CSV
            </button>
            <button
              type="button"
              className="btn flex-1 !text-danger"
              onClick={() => {
                if (window.confirm('Delete all stored telemetry history and events in this browser?')) void clearHistory();
              }}
            >
              <Trash2 size={15} /> Clear history
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
