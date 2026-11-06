import { AlertTriangle, Hourglass, Radio } from 'lucide-react';
import { memo } from 'react';
import { classColor, ERROR_COLOR } from '../lib/colors';
import { fmtAgo, fmtDuration, humanize } from '../lib/format';
import { useNow } from '../lib/useNow';
import type { Device } from '../mqtt/store';
import { staleReason, useStore } from '../mqtt/store';
import { StateIcon } from './StateIcon';

function Ring({ filled, total }: { filled: number; total: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const k = total > 0 ? Math.min(1, filled / total) : 0;
  return (
    <svg width="136" height="136" viewBox="0 0 136 136" role="img" aria-label={`${filled} of ${total} samples collected`}>
      <circle cx="68" cy="68" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="9" />
      <circle cx="68" cy="68" r={r} fill="none" stroke="var(--text)" strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - k)} transform="rotate(-90 68 68)" style={{ transition: 'stroke-dashoffset 400ms ease' }} />
      <text x="68" y="68" textAnchor="middle" className="num" fontSize="26" fontWeight="600" fill="var(--text)">
        {filled}/{total}
      </text>
      <text x="68" y="88" textAnchor="middle" fontSize="11" fill="var(--muted)">
        samples
      </text>
    </svg>
  );
}

export const StateHero = memo(function StateHero({ device, stale }: { device: Device; stale: boolean }) {
  const now = useNow(1000);
  const timeoutMs = useStore((s) => s.settings.staleSec) * 1000;
  const last = device.last;
  if (!last) return null;

  const classes = device.info?.model.classes ?? [];
  const sampleMs = device.info?.model.sample_ms ?? 10_000;
  const reason = staleReason(device, now, timeoutMs);
  const sensorError = last.phase === 'sensor_error';
  const held = sensorError;

  // How long the current state has been active (walk back through contiguous history).
  let since: number | null = null;
  if (last.state && device.history.length) {
    const gapMax = Math.max(120_000, sampleMs * 6);
    let first = device.history[device.history.length - 1].ts;
    for (let i = device.history.length - 2; i >= 0; i--) {
      const s = device.history[i];
      if (s.state !== last.state || first - s.ts > gapMax) break;
      first = s.ts;
    }
    since = first;
  }
  const end = stale && device.history.length ? device.history[device.history.length - 1].ts : now;

  const color = classColor(last.state, Math.max(0, classes.indexOf(last.state ?? '')));
  const lastTs = last.ts;

  return (
    <section className="card relative flex h-full min-h-[22rem] flex-col p-5 sm:p-6" aria-label="Current room state">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label">Room state</span>
        {stale ? (
          <span className="pill !border-transparent !bg-surface-2 text-muted">
            <Hourglass size={13} aria-hidden="true" /> Stale
          </span>
        ) : (
          <span className="pill">
            <span className="live-dot h-2 w-2 rounded-full bg-[#10B981]" aria-hidden="true" /> Live
          </span>
        )}
      </div>

      {stale && reason && (
        <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          {reason}
          {lastTs > 0 ? ` · last seen ${fmtAgo(now - lastTs)}` : ''}
        </p>
      )}

      {sensorError && (
        <div role="alert" className="mt-3 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm" style={{ borderColor: ERROR_COLOR, background: `${ERROR_COLOR}14` }}>
          <AlertTriangle size={18} className="mt-0.5 shrink-0" style={{ color: ERROR_COLOR }} aria-hidden="true" />
          <div>
            <div className="font-semibold">DHT11 not responding — check wiring</div>
            <div className="num text-xs text-muted">{last.fail_streak} consecutive failed reads · showing last good values (stale)</div>
          </div>
        </div>
      )}

      {last.phase === 'warmup' || !last.state ? (
        <div className="fade-in flex flex-1 flex-col items-center justify-center gap-4 py-6 text-center">
          <Ring filled={last.warmup.filled} total={last.warmup.total} />
          <div>
            <p className="text-lg font-semibold">Warming up — collecting 5-minute window</p>
            <p className="num mt-1 text-sm text-muted">
              {last.warmup.filled >= last.warmup.total ? 'Almost ready…' : `~${fmtDuration(((last.warmup.total - last.warmup.filled) * sampleMs) / 1000)} remaining`}
            </p>
          </div>
        </div>
      ) : (
        <div key={last.state} className={`fade-in flex flex-1 flex-col justify-center gap-5 py-6 transition-opacity ${stale || held ? 'opacity-60' : ''}`}>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl sm:h-20 sm:w-20" style={{ background: `${color}22`, border: `1px solid ${color}55` }}>
              <StateIcon name={last.state} size={36} color={color} />
            </div>
            <div className="min-w-0">
              <div className="text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">{humanize(last.state)}</div>
              {held && <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">Stale · held value</div>}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="text-muted">Confidence</span>
              <span className="num text-lg font-semibold">{last.conf !== null ? `${Math.round(last.conf * 100)}%` : '—'}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round((last.conf ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Confidence">
              <div className="h-full rounded-full" style={{ width: `${(last.conf ?? 0) * 100}%`, background: color, transition: 'width 400ms ease' }} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
            {last.raw && last.raw !== last.state && (
              <span className="flex items-center gap-1.5">
                <Radio size={14} aria-hidden="true" /> Raw: <span className="font-medium text-text">{humanize(last.raw)}</span>
              </span>
            )}
            {since !== null && (
              <span>
                In this state for <span className="num font-medium text-text">{end - since < 60_000 ? '< 1 min' : fmtDuration((end - since) / 1000)}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
});
