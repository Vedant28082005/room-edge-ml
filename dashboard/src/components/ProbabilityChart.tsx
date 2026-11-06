import { ChartArea } from 'lucide-react';
import { memo, useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DeviceInfo, Sample } from '../mqtt/schema';
import { classColor } from '../lib/colors';
import { fmtClock, fmtClockShort, humanize } from '../lib/format';
import { ChartCard } from './ChartCard';
import { EmptyState } from './EmptyState';
import { tooltipStyle } from './TempHumidityChart';

const tick = { fill: 'var(--muted)', fontSize: 11 };

function Inner({ history, classes, rangeMs, now }: { history: Sample[]; classes: string[]; rangeMs: number; now: number }) {
  const from = now - rangeMs;
  const data = useMemo(
    () =>
      history
        .filter((s) => s.ts >= from && s.proba)
        .map((s) => ({ ts: s.ts, ...Object.fromEntries(classes.map((c) => [c, s.proba?.[c] ?? 0])) })),
    [history, from, classes],
  );
  if (data.length === 0) {
    return (
      <EmptyState icon={ChartArea} title="No predictions yet" compact>
        Probabilities appear once the 5-minute warm-up is complete.
      </EmptyState>
    );
  }
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="ts" type="number" scale="time" domain={[from, now]} tickFormatter={fmtClockShort} tick={tick} stroke="var(--border)" tickLine={false} minTickGap={40} />
          <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(v: number) => `${v * 100}%`} tick={tick} stroke="var(--border)" tickLine={false} width={44} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => fmtClock(Number(v))} formatter={(v: number, n: string) => [`${Math.round(v * 100)}%`, humanize(n)]} />
          <Legend formatter={(v: string) => humanize(v)} wrapperStyle={{ fontSize: 12, color: 'var(--muted)' }} />
          {classes.map((c, i) => (
            <Area key={c} dataKey={c} stackId="p" type="stepAfter" stroke={classColor(c, i)} fill={classColor(c, i)} fillOpacity={0.55} strokeWidth={1.5} isAnimationActive={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export const ProbabilityChart = memo(function ProbabilityChart({ history, info, className }: { history: Sample[]; info: DeviceInfo | null; className?: string }) {
  const classes = useMemo(() => {
    if (info) return info.model.classes;
    const set = new Set<string>();
    for (const s of history) if (s.proba) Object.keys(s.proba).forEach((k) => set.add(k));
    return [...set];
  }, [info, history]);
  return (
    <ChartCard title="Class probabilities" className={className}>
      {(rangeMs, now) => <Inner history={history} classes={classes} rangeMs={rangeMs} now={now} />}
    </ChartCard>
  );
});
