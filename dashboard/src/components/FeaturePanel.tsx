import { Table2 } from 'lucide-react';
import { memo } from 'react';
import type { DeviceInfo, Sample } from '../mqtt/schema';
import { fmtNum } from '../lib/format';
import { EmptyState } from './EmptyState';

const LABELS: Record<string, string> = {
  t_now: 'Temperature (last 30 s)',
  h_now: 'Humidity (last 30 s)',
  dew: 'Dew point',
  t_5m: '5-min change (temperature)',
  h_5m: '5-min change (humidity)',
  t_1m: '1-min change (temperature)',
  h_1m: '1-min change (humidity)',
  t_std: 'Variability (std, temperature)',
  h_std: 'Variability (std, humidity)',
};

// Display range for the inline bar: [min, max]. A negative min draws the bar from the centre.
const RANGES: Record<string, [number, number]> = {
  t_now: [0, 50],
  h_now: [0, 100],
  dew: [-10, 40],
  t_5m: [-5, 5],
  h_5m: [-15, 15],
  t_1m: [-3, 3],
  h_1m: [-10, 10],
  t_std: [0, 3],
  h_std: [0, 10],
};

const unitOf = (name: string): string => (name.startsWith('h_') ? '%' : '°C');

function Bar({ name, v }: { name: string; v: number }) {
  const [min, max] = RANGES[name] ?? [Math.min(0, v), Math.max(1, v)];
  const clamp = (x: number) => Math.min(1, Math.max(0, (x - min) / (max - min))) * 100;
  const zero = clamp(0);
  const at = clamp(v);
  const left = min < 0 ? Math.min(zero, at) : 0;
  const width = min < 0 ? Math.abs(at - zero) : at;
  return (
    <div className="relative h-1.5 w-20 rounded-full bg-surface-2" aria-hidden="true">
      <div className="absolute top-0 h-full rounded-full bg-muted" style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%` }} />
    </div>
  );
}

export const FeaturePanel = memo(function FeaturePanel({ last, info, className }: { last: Sample | null; info: DeviceInfo | null; className?: string }) {
  const names = info?.model.features ?? [];
  const scale = info?.model.feature_scale ?? 100;
  return (
    <section className={`card p-4 sm:p-5 ${className ?? ''}`}>
      <h2 className="text-sm font-semibold">What the model sees</h2>
      <p className="mb-3 text-xs text-muted">Input vector of the latest inference (raw int16 ÷ {scale}).</p>
      {!last?.features || names.length === 0 ? (
        <EmptyState icon={Table2} title="No model input yet" compact>
          Features are available once the warm-up window is full{!info ? ' and device info has arrived' : ''}.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1.5 pr-3 font-medium">Feature</th>
                <th className="py-1.5 pr-3 text-right font-medium">Value</th>
                <th className="py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {names.map((n, i) => {
                const raw = last.features?.[i];
                if (raw === undefined) return null;
                const v = raw / scale;
                return (
                  <tr key={n} className="border-t border-border">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{LABELS[n] ?? n}</div>
                      <div className="num text-xs text-muted">{n}</div>
                    </td>
                    <td className="num whitespace-nowrap py-2 pr-3 text-right">
                      {fmtNum(v, 2)} <span className="text-muted">{unitOf(n)}</span>
                    </td>
                    <td className="py-2">
                      <Bar name={n} v={v} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
});
