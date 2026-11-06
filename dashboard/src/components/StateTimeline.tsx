import { GanttChart } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import type { DeviceInfo, Sample } from '../mqtt/schema';
import { classColor } from '../lib/colors';
import { fmtClock, fmtDuration, humanize } from '../lib/format';
import { ChartCard } from './ChartCard';
import { EmptyState } from './EmptyState';
import { StateIcon } from './StateIcon';

interface Seg {
  state: string;
  held: boolean;
  start: number;
  end: number;
}

function Inner({ history, info, rangeMs, now }: { history: Sample[]; info: DeviceInfo | null; rangeMs: number; now: number }) {
  const [hover, setHover] = useState<Seg | null>(null);
  const from = now - rangeMs;
  const sampleMs = info?.model.sample_ms ?? 10_000;
  const classes = info?.model.classes ?? [];

  const segs = useMemo(() => {
    const gapMax = Math.max(60_000, sampleMs * 6);
    const out: Seg[] = [];
    const rows = history.filter((s) => s.ts >= from - gapMax);
    rows.forEach((s, i) => {
      if (!s.state) return;
      const next = rows[i + 1];
      const end = next && next.ts - s.ts <= gapMax ? next.ts : s.ts + sampleMs;
      const held = s.phase === 'sensor_error';
      const prev = out[out.length - 1];
      if (prev && prev.state === s.state && prev.held === held && prev.end === s.ts) prev.end = end;
      else out.push({ state: s.state, held, start: s.ts, end });
    });
    return out.filter((g) => g.end > from);
  }, [history, from, sampleMs]);

  const legend = classes.length ? classes : [...new Set(segs.map((g) => g.state))];

  if (segs.length === 0) {
    return (
      <EmptyState icon={GanttChart} title="No state history yet" compact>
        The timeline fills once the model starts predicting.
      </EmptyState>
    );
  }
  const pct = (t: number) => ((Math.max(t, from) - from) / rangeMs) * 100;
  return (
    <div>
      <div className="relative h-11 overflow-hidden rounded-lg bg-surface-2" onMouseLeave={() => setHover(null)}>
        {segs.map((g, i) => {
          const c = classColor(g.state, Math.max(0, classes.indexOf(g.state)));
          const left = pct(g.start);
          const width = Math.max(0.3, pct(Math.min(g.end, now)) - left);
          return (
            <div
              key={`${g.start}-${i}`}
              tabIndex={0}
              role="img"
              aria-label={`${humanize(g.state)}${g.held ? ' (stale)' : ''}, ${fmtClock(g.start)} to ${fmtClock(g.end)}, ${fmtDuration((g.end - g.start) / 1000)}`}
              onMouseEnter={() => setHover(g)}
              onFocus={() => setHover(g)}
              onBlur={() => setHover(null)}
              className="absolute top-0 h-full border-r border-surface transition-opacity hover:opacity-80"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                background: g.held ? `repeating-linear-gradient(45deg, ${c}, ${c} 4px, transparent 4px, transparent 8px)` : c,
              }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted num">
        <span>{fmtClock(from)}</span>
        <span>{fmtClock(now)}</span>
      </div>
      <div className="mt-3 flex min-h-[2.5rem] flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {legend.map((c, i) => (
            <span key={c} className="flex items-center gap-1.5 text-xs text-muted">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: classColor(c, i) }} />
              <StateIcon name={c} size={13} />
              {humanize(c)}
            </span>
          ))}
        </div>
        <div className="num text-xs text-muted" aria-live="polite">
          {hover
            ? `${humanize(hover.state)}${hover.held ? ' (stale)' : ''} · ${fmtClock(hover.start)} → ${fmtClock(hover.end)} · ${fmtDuration((hover.end - hover.start) / 1000)}`
            : 'Hover a segment for details · hatched = held during sensor error'}
        </div>
      </div>
    </div>
  );
}

export const StateTimeline = memo(function StateTimeline({ history, info, className }: { history: Sample[]; info: DeviceInfo | null; className?: string }) {
  return (
    <ChartCard title="State timeline" className={className}>
      {(rangeMs, now) => <Inner history={history} info={info} rangeMs={rangeMs} now={now} />}
    </ChartCard>
  );
});
