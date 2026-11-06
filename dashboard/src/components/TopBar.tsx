import { Activity, CircleHelp, Settings as Cog, Wifi, WifiOff } from 'lucide-react';
import { memo } from 'react';
import { fmtAgo } from '../lib/format';
import { useNow } from '../lib/useNow';
import { selectDevice, useStore } from '../mqtt/store';
import { ThemeToggle } from './ThemeToggle';

const CONN_LABEL = { connecting: 'Connecting', connected: 'Connected', reconnecting: 'Reconnecting', disconnected: 'Disconnected' } as const;
const CONN_DOT = { connecting: '#F59E0B', connected: '#10B981', reconnecting: '#F59E0B', disconnected: '#EF4444' } as const;

export const TopBar = memo(function TopBar({ onSettings }: { onSettings: () => void }) {
  const conn = useStore((s) => s.conn);
  const url = useStore((s) => s.settings.url);
  const order = useStore((s) => s.order);
  const selected = useStore((s) => s.selected);
  const device = useStore((s) => (s.selected ? s.devices[s.selected] : null));
  const now = useNow(1000);

  const status = device?.status ?? null;
  const lastTs = device?.last?.ts ?? 0;
  const seen = device ? (lastTs > 0 ? `last seen ${fmtAgo(now - lastTs)}` : device.last ? 'last known' : null) : null;
  const StatusIcon = status === 'online' ? Wifi : status === 'offline' ? WifiOff : CircleHelp;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 pr-2">
          <Activity size={20} aria-hidden="true" />
          <h1 className="text-base font-semibold tracking-tight">Room State · Edge ML</h1>
        </div>

        {order.length > 1 && (
          <select aria-label="Device" value={selected ?? ''} onChange={(e) => selectDevice(e.target.value)} className="btn num !py-1 pr-7 text-xs">
            {order.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        )}
        {order.length === 1 && <span className="num text-xs text-muted">{order[0]}</span>}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {device && (
            <span className="pill" title="Device status (MQTT Last Will)">
              <StatusIcon size={13} aria-hidden="true" style={{ color: status === 'online' ? '#10B981' : status === 'offline' ? '#EF4444' : undefined }} />
              {status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Unknown'}
              {seen && <span className="font-normal text-muted">· {seen}</span>}
            </span>
          )}
          <span className="pill" title="MQTT broker connection">
            <span className={`h-2 w-2 rounded-full ${conn === 'connected' ? 'live-dot' : ''}`} style={{ background: CONN_DOT[conn] }} aria-hidden="true" />
            {CONN_LABEL[conn]}
            <span className="num hidden max-w-[16rem] truncate font-normal text-muted md:inline">· {url}</span>
          </span>
          <ThemeToggle />
          <button className="btn !p-2" onClick={onSettings} aria-label="Open settings">
            <Cog size={16} />
          </button>
        </div>
      </div>
    </header>
  );
});
