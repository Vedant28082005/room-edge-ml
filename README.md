# Room State · Edge ML — live dashboard

ESP32 + DHT11 + on-device Random Forest (emlearn) publishes the room state over MQTT.
The dashboard in `dashboard/` subscribes via MQTT over WebSockets and shows **live data only** (no mock data).

Quick start (after Mosquitto is installed): double-click `start-dashboard.bat`; stop with `stop-dashboard.bat`.

## 1. Install Mosquitto on Windows

Download and install from <https://mosquitto.org/download/>, then run it from the `broker/` folder:

```bat
cd broker
"C:\Program Files\mosquitto\mosquitto.exe" -c mosquitto.conf -v
```

`broker/mosquitto.conf` opens 1883 (MQTT, for the ESP32) and 9001 (WebSockets, for the browser).
Allow both through Windows Firewall (run in an **Administrator** terminal):

```bat
netsh advfirewall firewall add rule name="Mosquitto MQTT 1883" dir=in action=allow protocol=TCP localport=1883
netsh advfirewall firewall add rule name="Mosquitto WebSockets 9001" dir=in action=allow protocol=TCP localport=9001
```

## 2. Point the ESP32 at your laptop

1. Run `ipconfig` and note the IPv4 address of your Wi-Fi adapter.
2. In the firmware (`inference_mqtt/inference_mqtt.ino`) set `MQTT_HOST` to that IP, plus your Wi-Fi SSID and password, then flash.
3. The ESP32 and the laptop must be on the same network (a phone hotspot works).

## 3. Verify the broker

```bat
mosquitto_sub -h localhost -t "edgeml/room/#" -v
```

You should see `status`, `info` and `telemetry` messages once the ESP32 is online.

## 4. Start the dashboard

```bat
cd dashboard
npm install
npm run dev
```

Open the URL it prints (default <http://localhost:5173>). Broker URL, credentials, topic root and stale timeout are in the Settings drawer (defaults: `ws://localhost:9001`, `edgeml/room/`, 30 s).

`npm run build` type-checks (strict) and produces a production build.

## 5. Troubleshooting

- **Stuck on "Connecting"** — the WebSocket listener on 9001 isn't running, or the firewall blocks it. Check the broker log and the firewall rules above.
- **Device shows Offline** — open the ESP32 serial monitor and look at the MQTT `rc=` code (e.g. `rc=-2` can't reach the host/port, `rc=5` not authorised).
- **Old retained messages** — clear them, e.g. `mosquitto_pub -t edgeml/room/<id>/telemetry -r -n` (repeat for `status` and `info`).

## Notes

- Telemetry is timestamped on arrival (`Date.now()`); the ESP32 has no RTC.
- History (up to 6 h per device) is kept in memory and persisted to IndexedDB at most every 30 s.
- Retained messages are shown as "last known" and are not charted; the dashboard is marked stale until a live message arrives, the device is `offline`, or nothing arrives for the stale timeout.
