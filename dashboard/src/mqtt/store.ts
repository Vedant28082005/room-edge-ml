import { useSyncExternalStore } from 'react';
import { createClient, normalizeRoot, type ConnState } from './client';
import {
  infoSchema,
  statusSchema,
  telemetrySchema,
  type DeviceInfo,
  type DeviceStatus,
  type Sample,
} from './schema';
import { clearAllStored, loadAll, saveDevice, type EventItem } from '../lib/history';
import { humanize } from '../lib/format';

export interface Settings {
  url: string;
  username: string;
  password: string;
  root: string;
  staleSec: number;
}

export const DEFAULT_SETTINGS: Settings = {
  url: 'ws://localhost:9001',
  username: '',
  password: '',
  root: 'edgeml/room/',
  staleSec: 30,
};

const SETTINGS_KEY = 'edgeml.settings';
const HISTORY_MS = 6 * 3600 * 1000;
const HISTORY_MAX = 2160;
const EVENTS_MAX = 300;
const FLUSH_MS = 30_000;

export interface Device {
  id: string;
  status: DeviceStatus | null;
  info: DeviceInfo | null;
  last: Sample | null;
  /** true when `last` came from a retained packet (ts === 0) and nothing fresher has arrived. */
  lastRetained: boolean;
  /** Arrival time of the newest live (non-retained) telemetry this page session. */
  lastFreshAt: number | null;
  /** True once any message for this device arrived in this page session (gates event detection). */
  sawSession: boolean;
  history: Sample[];
  events: EventItem[];
}

export interface AppState {
  settings: Settings;
  conn: ConnState;
  connError: string | null;
  devices: Record<string, Device>;
  order: string[];
  selected: string | null;
  stale: Record<string, boolean>;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS;
}

let state: AppState = {
  settings: loadSettings(),
  conn: 'connecting',
  connError: null,
  devices: {},
  order: [],
  selected: null,
  stale: {},
};
const listeners = new Set<() => void>();

function set(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

/* ---------- derived ---------- */

export function isStale(d: Device, now: number, timeoutMs: number): boolean {
  return (
    d.status === 'offline' ||
    d.lastRetained ||
    d.lastFreshAt === null ||
    now - d.lastFreshAt > timeoutMs
  );
}

export function staleReason(d: Device, now: number, timeoutMs: number): string | null {
  if (!isStale(d, now, timeoutMs)) return null;
  if (d.status === 'offline') return 'Device offline';
  if (d.lastRetained || d.lastFreshAt === null) return 'Last known reading — waiting for fresh telemetry';
  return 'No telemetry received recently';
}

function refreshStale(): void {
  const now = Date.now();
  const timeout = state.settings.staleSec * 1000;
  const next: Record<string, boolean> = {};
  let changed = false;
  for (const id of state.order) {
    next[id] = isStale(state.devices[id], now, timeout);
    if (next[id] !== state.stale[id]) changed = true;
  }
  if (changed) set({ stale: next });
}

/* ---------- device updates ---------- */

const dirty = new Set<string>();
let evCounter = 0;

function emptyDevice(id: string): Device {
  return {
    id,
    status: null,
    info: null,
    last: null,
    lastRetained: false,
    lastFreshAt: null,
    sawSession: false,
    history: [],
    events: [],
  };
}

function updateDevice(id: string, fn: (d: Device) => Device): void {
  const existing = state.devices[id];
  const d = fn(existing ?? emptyDevice(id));
  const order = existing ? state.order : [...state.order, id];
  set({
    devices: { ...state.devices, [id]: d },
    order,
    selected: state.selected ?? id,
  });
  refreshStale();
}

function ev(ts: number, kind: EventItem['kind'], tone: EventItem['tone'], text: string): EventItem {
  return { id: `${ts}-${evCounter++}`, ts, kind, tone, text };
}

function diffEvents(prev: Sample, cur: Sample, now: number): EventItem[] {
  const out: EventItem[] = [];
  const rebooted = cur.seq < prev.seq || cur.uptime_s < prev.uptime_s;
  if (rebooted) {
    out.push(ev(now, 'reboot', 'warn', `Device rebooted (seq reset ${prev.seq} → ${cur.seq})`));
  } else if (cur.seq > prev.seq + 1) {
    const n = cur.seq - prev.seq - 1;
    out.push(ev(now, 'gap', 'warn', `Missed ${n} message${n === 1 ? '' : 's'} (seq ${prev.seq} → ${cur.seq})`));
  }
  if (prev.phase !== cur.phase) {
    if (cur.phase === 'sensor_error') {
      out.push(ev(now, 'phase', 'error', `DHT11 sensor error (${cur.fail_streak} failed reads in a row)`));
    } else if (prev.phase === 'sensor_error') {
      out.push(ev(now, 'phase', 'good', 'Sensor recovered'));
    } else if (prev.phase === 'warmup' && cur.phase === 'running') {
      out.push(ev(now, 'phase', 'good', 'Warm-up complete — model running'));
    } else if (cur.phase === 'warmup') {
      out.push(ev(now, 'phase', 'neutral', 'Warm-up started'));
    }
  }
  if (prev.state && cur.state && prev.state !== cur.state) {
    out.push(ev(now, 'state', 'neutral', `State changed: ${humanize(prev.state)} → ${humanize(cur.state)}`));
  }
  return out;
}

function trimHistory(h: Sample[], now: number): Sample[] {
  const cutoff = now - HISTORY_MS;
  let start = 0;
  while (start < h.length && h[start].ts < cutoff) start++;
  const t = start ? h.slice(start) : h;
  return t.length > HISTORY_MAX ? t.slice(t.length - HISTORY_MAX) : t;
}

/* ---------- message handling ---------- */

function parseJson(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return undefined;
  }
}

function onMessage(topic: string, payload: string, retain: boolean): void {
  const root = normalizeRoot(state.settings.root);
  if (!topic.startsWith(root)) return;
  const [id, kind] = topic.slice(root.length).split('/');
  if (!id || !kind) return;
  const now = Date.now();

  if (kind === 'status') {
    const p = statusSchema.safeParse(payload.trim().toLowerCase());
    if (!p.success) {
      console.warn(`[mqtt] ignoring malformed status on ${topic}:`, payload);
      return;
    }
    updateDevice(id, (d) => {
      const events =
        d.sawSession && d.status !== null && d.status !== p.data
          ? [ev(now, 'online', p.data === 'online' ? 'good' : 'error', `Device ${p.data}`), ...d.events].slice(0, EVENTS_MAX)
          : d.events;
      dirty.add(id);
      return { ...d, status: p.data, events, sawSession: true };
    });
    return;
  }

  if (kind === 'info') {
    const p = infoSchema.safeParse(parseJson(payload));
    if (!p.success) {
      console.warn(`[mqtt] ignoring malformed info on ${topic}:`, p.error.issues);
      return;
    }
    dirty.add(id);
    updateDevice(id, (d) => ({ ...d, info: p.data, sawSession: true }));
    return;
  }

  if (kind === 'telemetry') {
    const p = telemetrySchema.safeParse(parseJson(payload));
    if (!p.success) {
      console.warn(`[mqtt] ignoring malformed telemetry on ${topic}:`, p.error.issues);
      return;
    }
    const t = p.data;
    updateDevice(id, (d) => {
      const last = d.last;
      if (retain) {
        // Retained = last known value only; its arrival time is unknown, so it is not charted.
        if (last && last.seq === t.seq && last.uptime_s === t.uptime_s) return { ...d, sawSession: true };
        return { ...d, last: { ...t, ts: 0 }, lastRetained: true, sawSession: true };
      }
      const sample: Sample = { ...t, ts: now };
      const newEvents = d.sawSession && last ? diffEvents(last, sample, now) : [];
      dirty.add(id);
      return {
        ...d,
        last: sample,
        lastRetained: false,
        lastFreshAt: now,
        sawSession: true,
        history: trimHistory([...d.history, sample], now),
        events: newEvents.length ? [...newEvents.reverse(), ...d.events].slice(0, EVENTS_MAX) : d.events,
      };
    });
  }
}

/* ---------- lifecycle ---------- */

let client: { end(): void } | null = null;
let runToken = 0;
let hydrated = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;

async function hydrate(): Promise<void> {
  const stored = await loadAll();
  const devices = { ...state.devices };
  const order = [...state.order];
  for (const [id, v] of Object.entries(stored)) {
    if (devices[id]) continue;
    const history = trimHistory(v.samples, Date.now());
    devices[id] = {
      ...emptyDevice(id),
      info: v.info ?? null,
      history,
      events: v.events ?? [],
      last: history.length ? history[history.length - 1] : null,
    };
    order.push(id);
  }
  hydrated = true;
  set({ devices, order, selected: state.selected ?? order[0] ?? null });
  refreshStale();
}

function flush(): void {
  for (const id of dirty) {
    const d = state.devices[id];
    if (d) void saveDevice(id, { samples: d.history, events: d.events, info: d.info });
  }
  dirty.clear();
}

function connectNow(): void {
  client?.end();
  const s = state.settings;
  set({ conn: 'connecting', connError: null });
  client = createClient(s, {
    onState: (conn, err) => set({ conn, connError: err ?? null }),
    onMessage,
  });
}

export async function start(): Promise<void> {
  const token = ++runToken;
  if (!hydrated) await hydrate();
  if (token !== runToken) return;
  connectNow();
  tickTimer = setInterval(refreshStale, 1000);
  flushTimer = setInterval(flush, FLUSH_MS);
}

export function stop(): void {
  runToken++;
  client?.end();
  client = null;
  if (tickTimer) clearInterval(tickTimer);
  if (flushTimer) clearInterval(flushTimer);
  tickTimer = flushTimer = null;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  set({ settings: s });
  connectNow();
  refreshStale();
}

export function selectDevice(id: string): void {
  set({ selected: id });
}

export async function clearHistory(): Promise<void> {
  const devices: Record<string, Device> = {};
  for (const id of state.order) devices[id] = { ...state.devices[id], history: [], events: [] };
  dirty.clear();
  set({ devices });
  await clearAllStored();
}
