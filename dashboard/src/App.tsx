import { Radar, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { DeviceCard } from './components/DeviceCard';
import { EmptyState } from './components/EmptyState';
import { EventLog } from './components/EventLog';
import { FeaturePanel } from './components/FeaturePanel';
import { KpiGrid } from './components/KpiTile';
import { ProbabilityChart } from './components/ProbabilityChart';
import { SettingsDrawer } from './components/SettingsDrawer';
import { StateHero } from './components/StateHero';
import { StateTimeline } from './components/StateTimeline';
import { TempHumidityChart } from './components/TempHumidityChart';
import { TopBar } from './components/TopBar';
import { start, stop, useStore } from './mqtt/store';

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);

  useEffect(() => {
    void start();
    return () => stop();
  }, []);

  const conn = useStore((s) => s.conn);
  const connError = useStore((s) => s.connError);
  const url = useStore((s) => s.settings.url);
  const root = useStore((s) => s.settings.root);
  const device = useStore((s) => (s.selected ? s.devices[s.selected] : null));
  const stale = useStore((s) => (s.selected ? (s.stale[s.selected] ?? true) : true));

  return (
    <div className="min-h-screen">
      <TopBar onSettings={openSettings} />
      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-5 sm:px-6">
        {(conn === 'reconnecting' || conn === 'disconnected' || (conn === 'connecting' && connError)) && (
          <div role="status" className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <WifiOff size={16} className="text-[#EF4444]" aria-hidden="true" />
            <span>
              Cannot reach broker at <span className="num">{url}</span> — retrying every 2 s.
              {connError && <span className="text-muted"> ({connError})</span>}
            </span>
          </div>
        )}

        {!device || !device.last ? (
          <section className="card">
            <EmptyState icon={Radar} title={conn === 'connected' ? 'Waiting for device…' : 'Connecting to broker…'}>
              {conn === 'connected'
                ? `Subscribed to ${root}+/#. No telemetry yet — power on the ESP32 and make sure it can reach the broker.`
                : `Trying ${url}. Start Mosquitto with a WebSockets listener on port 9001.`}
            </EmptyState>
          </section>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
            <div className="md:col-span-2 lg:col-span-5">
              <StateHero device={device} stale={stale} />
            </div>
            <div className="md:col-span-2 lg:col-span-7">
              <KpiGrid device={device} stale={stale} />
            </div>
            <TempHumidityChart history={device.history} className="md:col-span-1 lg:col-span-6" />
            <ProbabilityChart history={device.history} info={device.info} className="md:col-span-1 lg:col-span-6" />
            <StateTimeline history={device.history} info={device.info} className="md:col-span-2 lg:col-span-12" />
            <FeaturePanel last={device.last} info={device.info} className="md:col-span-1 lg:col-span-5" />
            <EventLog events={device.events} className="md:col-span-1 lg:col-span-4" />
            <DeviceCard info={device.info} className="md:col-span-2 lg:col-span-3" />
          </div>
        )}
      </main>
      <SettingsDrawer open={settingsOpen} onClose={closeSettings} />
    </div>
  );
}
