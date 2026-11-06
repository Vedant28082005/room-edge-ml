import { AlertCircle, AlertTriangle, ArrowRightLeft, CheckCircle2, ListChecks, RotateCcw, Wifi, WifiOff, type LucideIcon } from 'lucide-react';
import { memo } from 'react';
import type { EventItem } from '../lib/history';
import { fmtClock } from '../lib/format';
import { EmptyState } from './EmptyState';

function iconFor(e: EventItem): LucideIcon {
  switch (e.kind) {
    case 'state':
      return ArrowRightLeft;
    case 'reboot':
      return RotateCcw;
    case 'gap':
      return AlertCircle;
    case 'online':
      return e.tone === 'good' ? Wifi : WifiOff;
    default:
      return e.tone === 'good' ? CheckCircle2 : e.tone === 'error' ? AlertTriangle : ListChecks;
  }
}

const TONE: Record<EventItem['tone'], string> = {
  neutral: 'text-muted',
  good: 'text-[#10B981]',
  warn: 'text-[#F59E0B]',
  error: 'text-[#EF4444]',
};

export const EventLog = memo(function EventLog({ events, className }: { events: EventItem[]; className?: string }) {
  return (
    <section className={`card flex flex-col p-4 sm:p-5 ${className ?? ''}`}>
      <h2 className="mb-3 text-sm font-semibold">Event log</h2>
      {events.length === 0 ? (
        <EmptyState icon={ListChecks} title="No events yet" compact>
          State changes, reboots and connectivity events will be listed here.
        </EmptyState>
      ) : (
        <ul className="max-h-[22rem] space-y-0.5 overflow-y-auto pr-1">
          {events.map((e) => {
            const Icon = iconFor(e);
            return (
              <li key={e.id} className="flex items-start gap-2.5 rounded-md px-1 py-1.5 text-sm">
                <Icon size={16} className={`mt-0.5 shrink-0 ${TONE[e.tone]}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">{e.text}</span>
                <time className="num shrink-0 text-xs text-muted">{fmtClock(e.ts)}</time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
});
