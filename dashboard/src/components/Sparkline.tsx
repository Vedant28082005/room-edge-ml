import { memo } from 'react';

export interface SparkPoint {
  ts: number;
  v: number | null;
}

function SparklineImpl({ points, from, to }: { points: SparkPoint[]; from: number; to: number }) {
  const W = 100;
  const H = 28;
  const vals = points.filter((p) => p.v !== null) as { ts: number; v: number }[];
  if (vals.length < 2) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-7 w-full" aria-hidden="true">
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="var(--border)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }
  let min = Math.min(...vals.map((p) => p.v));
  let max = Math.max(...vals.map((p) => p.v));
  if (max - min < 1e-9) {
    min -= 1;
    max += 1;
  }
  const span = Math.max(1, to - from);
  const x = (ts: number) => ((ts - from) / span) * W;
  const y = (v: number) => H - 2 - ((v - min) / (max - min)) * (H - 4);
  let d = '';
  let pen = false;
  for (const p of points) {
    if (p.v === null) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${x(p.ts).toFixed(2)} ${y(p.v).toFixed(2)} `;
    pen = true;
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-7 w-full text-muted" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export const Sparkline = memo(SparklineImpl);
