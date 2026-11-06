export const fmtNum = (v: number | null | undefined, d = 0): string =>
  v == null || !Number.isFinite(v) ? '—' : v.toFixed(d);

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

export function fmtAgo(ms: number): string {
  if (ms < 5000) return 'just now';
  return `${fmtDuration(ms / 1000)} ago`;
}

export function fmtUptime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${r}s`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

export const fmtClock = (ts: number): string =>
  new Date(ts).toLocaleTimeString([], { hour12: false });

export const fmtClockShort = (ts: number): string =>
  new Date(ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });

export function humanize(name: string | null | undefined): string {
  if (!name) return '—';
  const s = name.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function rssiQuality(rssi: number): { bars: 1 | 2 | 3 | 4; label: string } {
  if (rssi >= -60) return { bars: 4, label: 'Excellent' };
  if (rssi >= -70) return { bars: 3, label: 'Good' };
  if (rssi >= -80) return { bars: 2, label: 'Fair' };
  return { bars: 1, label: 'Weak' };
}
