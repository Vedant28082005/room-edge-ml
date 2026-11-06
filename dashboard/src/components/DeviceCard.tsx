import { Cpu } from 'lucide-react';
import { memo } from 'react';
import type { DeviceInfo } from '../mqtt/schema';
import { classColor } from '../lib/colors';
import { humanize } from '../lib/format';
import { EmptyState } from './EmptyState';

export const DeviceCard = memo(function DeviceCard({ info, className }: { info: DeviceInfo | null; className?: string }) {
  const m = info?.model;
  const rows: [string, React.ReactNode][] = info && m
    ? [
        ['Device ID', info.device_id],
        ['Firmware', info.fw],
        ['IP address', info.ip],
        ['Chip', info.chip],
        ['Model', m.type.replace(/_/g, ' ')],
        [
          'Classes',
          <span key="c" className="flex flex-wrap gap-1.5">
            {m.classes.map((c, i) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ background: classColor(c, i) }} />
                {humanize(c)}
              </span>
            ))}
          </span>,
        ],
        ['Window', `${m.window_len} samples (${Math.round((m.window_len * m.sample_ms) / 60000)} min)`],
        ['Sample interval', `${m.sample_ms / 1000} s`],
        ['Smoothing', `majority of last ${m.smooth_n}`],
      ]
    : [];
  return (
    <section className={`card p-4 sm:p-5 ${className ?? ''}`}>
      <h2 className="mb-3 text-sm font-semibold">Device & model</h2>
      {info ? (
        <dl className="space-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-3">
              <dt className="text-muted">{k}</dt>
              <dd className="num text-right">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <EmptyState icon={Cpu} title="Waiting for device info…" compact>
          Sent by the device on every (re)connect.
        </EmptyState>
      )}
      <p className="mt-4 rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-muted">
        <span className="font-semibold text-text">Offline training result (not a live metric): </span>
        Model trained on physics-based synthetic data; 87.5% accuracy on held-out synthetic days (F1: ac_on 0.92, normal 0.88, window_open 0.68).
      </p>
    </section>
  );
});
