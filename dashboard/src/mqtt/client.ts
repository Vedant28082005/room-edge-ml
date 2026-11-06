import mqtt, { type MqttClient } from 'mqtt';

export type ConnState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface ConnSettings {
  url: string;
  username: string;
  password: string;
  root: string;
}

export interface MqttHandlers {
  onState(state: ConnState, error?: string): void;
  onMessage(topic: string, payload: string, retain: boolean): void;
}

export const normalizeRoot = (root: string): string => {
  const r = root.trim().replace(/^\/+/, '');
  return r.endsWith('/') ? r : r + '/';
};

/** Single MQTT client for the whole app. Call end() for a clean disconnect. */
export function createClient(s: ConnSettings, h: MqttHandlers): { end(): void } {
  let ended = false;
  let everConnected = false;
  let client: MqttClient;
  const root = normalizeRoot(s.root);

  try {
    client = mqtt.connect(s.url, {
      reconnectPeriod: 2000,
      connectTimeout: 8000,
      clean: true,
      clientId: `edgeml-dash-${Math.random().toString(16).slice(2, 10)}`,
      username: s.username || undefined,
      password: s.password || undefined,
    });
  } catch (e) {
    h.onState('disconnected', e instanceof Error ? e.message : String(e));
    return { end() {} };
  }

  client.on('connect', () => {
    everConnected = true;
    client.subscribe(`${root}+/#`, { qos: 0 }, (err) => {
      if (err) h.onState('connected', `Subscribe failed: ${err.message}`);
    });
    h.onState('connected');
  });
  client.on('reconnect', () => {
    if (!ended) h.onState(everConnected ? 'reconnecting' : 'connecting');
  });
  client.on('offline', () => {
    if (!ended && everConnected) h.onState('reconnecting');
  });
  client.on('error', (err) => {
    if (!ended) h.onState(everConnected ? 'reconnecting' : 'connecting', err.message);
  });
  client.on('message', (topic, payload, packet) => {
    h.onMessage(topic, payload.toString('utf8'), packet.retain === true);
  });

  return {
    end() {
      ended = true;
      client.removeAllListeners();
      client.on('error', () => {});
      client.end(true);
    },
  };
}
