import { useState, type ReactNode } from 'react';
import { useNow } from '../lib/useNow';

export const RANGES = [
  { label: '15 min', ms: 15 * 60_000 },
  { label: '1 h', ms: 3600_000 },
  { label: '6 h', ms: 6 * 3600_000 },
] as const;

export function ChartCard({
  title,
  className = '',
  children,
}: {
  title: string;
  className?: string;
  children: (rangeMs: number, now: number) => ReactNode;
}) {
  const [range, setRange] = useState<number>(RANGES[1].ms);
  const now = useNow(10_000);
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div role="radiogroup" aria-label={`${title} time range`} className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.ms}
              role="radio"
              aria-checked={range === r.ms}
              onClick={() => setRange(r.ms)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${range === r.ms ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {children(range, now)}
    </section>
  );
}
