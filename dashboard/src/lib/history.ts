import { get, set, del, keys } from 'idb-keyval';
import type { DeviceInfo, Sample } from '../mqtt/schema';

export interface EventItem {
  id: string;
  ts: number;
  kind: 'state' | 'phase' | 'online' | 'reboot' | 'gap';
  tone: 'neutral' | 'good' | 'warn' | 'error';
  text: string;
}

export interface StoredDevice {
  samples: Sample[];
  events: EventItem[];
  info: DeviceInfo | null;
}

const PREFIX = 'edgeml.device:';

export async function loadAll(): Promise<Record<string, StoredDevice>> {
  const out: Record<string, StoredDevice> = {};
  try {
    const all = await keys();
    for (const k of all) {
      if (typeof k !== 'string' || !k.startsWith(PREFIX)) continue;
      const v = await get<StoredDevice>(k);
      if (v && Array.isArray(v.samples)) out[k.slice(PREFIX.length)] = v;
    }
  } catch (e) {
    console.warn('[history] IndexedDB unavailable', e);
  }
  return out;
}

export async function saveDevice(id: string, v: StoredDevice): Promise<void> {
  try {
    await set(PREFIX + id, v);
  } catch (e) {
    console.warn('[history] save failed', e);
  }
}

export async function clearAllStored(): Promise<void> {
  try {
    for (const k of await keys()) {
      if (typeof k === 'string' && k.startsWith(PREFIX)) await del(k);
    }
  } catch (e) {
    console.warn('[history] clear failed', e);
  }
}
