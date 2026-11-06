import { LineChart as LineIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Sample } from '../mqtt/schema';
import { fmtClock, fmtClockShort } from '../lib/format';
import { ChartCard } from './ChartCard';
import { EmptyState } from './EmptyState';

const tick = { fill: 'var(--muted)', fontSize: 11 };
export const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--text)',
};

function Inner({ history, rangeMs, now }: { history: Sample[]; rangeMs: number; now: number }) {
  const from = now - rangeMs;
  const data = useMemo(
    () =>
      history
        .filter((s) => s.ts >= from)
        .map((s) => {
          const bad = s.phase === 'sensor_error'; // held values are not real readings
          return { ts: s.ts, t: bad ? null : s.t, h: bad ? null : s.h };
        }),
    [history, from],
  );
  if (data.length === 0) {
    return (
      <EmptyState icon={LineIcon} title="No telemetry yet" compact>
        Charts fill as live readings arrive.
      </EmptyState>
    );
  }
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="ts" type="number" scale="time" domain={[from, now]} tickFormatter={fmtClockShort} tick={tick} stroke="var(--border)" tickLine={false} minTickGap={40} />
          <YAxis yAxisId="t" tick={tick} stroke="var(--border)" tickLine={false} domain={['dataMin - 1', 'dataMax + 1']} allowDecimals={false} unit="°" width={40} />
          <YAxis yAxisId="h" orientation="right" tick={tick} stroke="var(--border)" tickLine={false} domain={['dataMin - 3', 'dataMax + 3']} allowDecimals={false} unit="%" width={44} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => fmtClock(Number(v))} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: 'var(--muted)' }} />
          <Line yAxisId="t" name="Temperature (°C)" dataKey="t" type="stepAfter" stroke="var(--text)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
          <Line yAxisId="h" name="Humidity (%)" dataKey="h" type="stepAfter" stroke="var(--muted)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export const TempHumidityChart = memo(function TempHumidityChart({ history, className }: { history: Sample[]; className?: string }) {
  return (
    <ChartCard title="Temperature & humidity" className={className}>
      {(rangeMs, now) => <Inner history={history} rangeMs={rangeMs} now={now} />}
    </ChartCard>
  );
});
