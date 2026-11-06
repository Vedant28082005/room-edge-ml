import type { Sample } from '../mqtt/schema';

export function buildCsv(samples: Sample[], classes: string[]): string {
  const cols = ['time', 'seq', 'phase', 't', 'h', 'dp', 'state', 'raw', 'conf', ...classes.map((c) => `proba_${c}`), 'infer_us', 'rssi'];
  const cell = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
  const rows = samples.map((s) =>
    [
      new Date(s.ts).toISOString(),
      s.seq,
      s.phase,
      s.t,
      s.h,
      s.dp,
      s.state,
      s.raw,
      s.conf,
      ...classes.map((c) => s.proba?.[c]),
      s.infer_us,
      s.rssi,
    ]
      .map(cell)
      .join(','),
  );
  return [cols.join(','), ...rows].join('\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
