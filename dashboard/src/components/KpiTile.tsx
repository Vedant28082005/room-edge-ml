import { Cpu, Droplets, MemoryStick, Thermometer, Timer, Wifi, Wind, type LucideIcon } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Device } from '../mqtt/store';
import { fmtNum, fmtUptime, rssiQuality } from '../lib/format';
import { Sparkline, type SparkPoint } from './Sparkline';

function AnimatedNumber({ value, decimals = 0 }: { value: number | null; decimals?: number }) {
  const [shown, setShown] = useState<number | null>(value);
  const from = useRef<number | null>(value);
  useEffect(() => {
    if (value === null || from.current === null || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 350);
      const e = 1 - Math.pow(1 - k, 3);
      const v = start + (value - start) * e;
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{fmtNum(shown, decimals)}</>;
}

function SignalBars({ bars }: { bars: number }) {
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={i * 6} y={14 - i * 4.5} width="4" height={4 + i * 4.5} rx="1" fill="currentColor" opacity={i < bars ? 1 : 0.2} />
      ))}
    </svg>
  );
}

interface TileProps {
  label: string;
  icon: LucideIcon;
  value: number | null;
  decimals?: number;
  unit?: string;
  text?: string;
  points?: SparkPoint[];
  from: number;
  to: number;
  stale: boolean;
  held?: boolean;
  extra?: ReactNode;
}

const KpiTile = memo(function KpiTile(p: TileProps) {
  const dim = p.stale || p.held;
  return (
    <div className="card flex flex-col p-4">
      <div className="flex items-center justify-between">
        <span className="label flex items-center gap-1.5">
          <p.icon size={14} aria-hidden="true" />
          {p.label}
        </span>
        {p.held && !p.stale && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted">Stale</span>}
      </div>
      <div className={`mt-2 flex items-baseline gap-1.5 transition-opacity ${dim ? 'opacity-50' : ''}`}>
        <span className="num text-2xl font-semibold leading-none">
          {p.text !== undefined ? p.text : <AnimatedNumber value={p.value} decimals={p.decimals} />}
        </span>
        {p.unit && <span className="num text-sm text-muted">{p.unit}</span>}
        {p.extra && <span className="ml-auto flex items-center gap-1.5 text-sm text-muted">{p.extra}</span>}
      </div>
      <div className={`mt-3 ${dim ? 'opacity-40' : ''}`}>
        {p.points ? <Sparkline points={p.points} from={p.from} to={p.to} /> : <div className="h-7" />}
      </div>
    </div>
  );
});

export const KpiGrid = memo(function KpiGrid({ device, stale }: { device: Device; stale: boolean }) {
  const last = device.last;
  const lastTs = device.history.length ? device.history[device.history.length - 1].ts : 0;
  const from = lastTs - 30 * 60_000;
  const recent = useMemo(() => device.history.filter((s) => s.ts >= from), [device.history, from]);
  const series = (f: (s: (typeof recent)[number]) => number | null): SparkPoint[] => recent.map((s) => ({ ts: s.ts, v: f(s) }));
  const sensorBad = last?.phase === 'sensor_error';
  const held = sensorBad;
  const rssi = last ? rssiQuality(last.rssi) : null;

  const common = { from, to: lastTs, stale };
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      <KpiTile {...common} label="Temperature" icon={Thermometer} value={last?.t ?? null} unit="°C" held={held} points={series((s) => (s.phase === 'sensor_error' ? null : s.t))} />
      <KpiTile {...common} label="Humidity" icon={Droplets} value={last?.h ?? null} unit="%" held={held} points={series((s) => (s.phase === 'sensor_error' ? null : s.h))} />
      <KpiTile {...common} label="Dew point" icon={Wind} value={last?.dp ?? null} decimals={1} unit="°C" held={held} points={series((s) => (s.phase === 'sensor_error' ? null : s.dp))} />
      <KpiTile {...common} label="Inference" icon={Cpu} value={last?.infer_us ?? null} unit="µs" points={series((s) => s.infer_us)} />
      <KpiTile
        {...common}
        label="Wi-Fi RSSI"
        icon={Wifi}
        value={last?.rssi ?? null}
        unit="dBm"
        extra={rssi && (
          <>
            <SignalBars bars={rssi.bars} />
            <span className="text-xs">{rssi.label}</span>
          </>
        )}
        points={series((s) => s.rssi)}
      />
      <KpiTile {...common} label="Uptime" icon={Timer} value={null} text={last ? fmtUptime(last.uptime_s) : '—'} />
      <KpiTile {...common} label="Free heap" icon={MemoryStick} value={last ? last.heap / 1024 : null} decimals={1} unit="KB" points={series((s) => s.heap / 1024)} />
    </div>
  );
});
