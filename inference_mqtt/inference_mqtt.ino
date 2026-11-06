// inference_mqtt.ino — real DHT11 + on-device room-state model + SSD1306 OLED + MQTT telemetry.
//
// Folder must contain: inference_mqtt.ino, room_features.h, room_model.h, room_labels.h
// Libraries (Arduino Library Manager):
//   "DHT sensor library" + "Adafruit Unified Sensor"   (Adafruit)
//   "Adafruit SSD1306"   + "Adafruit GFX Library"      (Adafruit)
//   "PubSubClient"                                     (Nick O'Leary)
//
// Wiring (ESP32 DevKit):
//   DHT11 DATA -> GPIO4   VCC -> 3.3V   GND -> GND   (10k DATA->3.3V pull-up if bare sensor)
//   OLED  SDA  -> GPIO21  SCL -> GPIO22 VCC -> 3.3V  GND -> GND
//
// MQTT topics (PREFIX = "edgeml/room/<DEVICE_ID>/"):
//   PREFIX status     "online" / "offline"            retained, "offline" is the Last Will
//   PREFIX info       device + model metadata (JSON)  retained, sent on every (re)connect
//   PREFIX telemetry  one JSON message per sample     retained, every 10 s
// The ML runs locally whether or not Wi-Fi/MQTT is up; the network only reports results.
//
// No warm-up: on the first good DHT11 reading the whole 5-min window is pre-filled with that
// reading, so a prediction comes out on the very first sample. Trend/variability features start
// at 0 and become fully meaningful once 5 min of real readings have replaced the pre-fill.

#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include "room_features.h"
#include "room_model.h"
#include "room_labels.h"

// ---------------- network config ----------------
// WIFI_SSID, WIFI_PASS, MQTT_HOST, MQTT_USER, MQTT_PASSWD live in secrets.h (git-ignored).
// Copy secrets.example.h to secrets.h and fill it in.
#include "secrets.h"
#define MQTT_PORT     1883
#define DEVICE_ID     "room-node-01"
#define TOPIC_ROOT    "edgeml/room/"
// -------------------------------------------------------------

// ---------------- hardware / model config ----------------
#define DHT_PIN      4
#define DHT_TYPE     DHT11
#define LED_PIN      2            // onboard LED: on when state != normal
#define OLED_SDA     21
#define OLED_SCL     22
#define OLED_ADDR    0x3C         // try 0x3D if the screen stays blank
#define SCREEN_W     128
#define SCREEN_H     64
#define SAMPLE_MS    10000UL      // must match training (10 s)
#define SMOOTH_N     3            // majority vote over last N predictions
#define MAX_FAILS    6            // consecutive failed reads before reporting a sensor error
#define FW_VERSION   "1.0.0"
#define WIFI_RETRY_MS  20000UL
#define MQTT_RETRY_MS  10000UL    // each failed attempt can block ~3 s, so don't retry too often
// ---------------------------------------------------------

static_assert(N_FEATURES == 9, "feature names below assume 9 features");
static const char *FEATURE_NAMES[N_FEATURES] = {
  "t_now", "h_now", "dew", "t_5m", "h_5m", "t_1m", "h_1m", "t_std", "h_std"};

DHT dht(DHT_PIN, DHT_TYPE);
Adafruit_SSD1306 oled(SCREEN_W, SCREEN_H, &Wire, -1);
WiFiClient net;
PubSubClient mqtt(net);
bool oledOk = false;

char tStatus[64], tInfo[64], tTelemetry[64];
unsigned long lastWifiTry = 0, lastMqttTry = 0;

float tBuf[WIN_LEN], hBuf[WIN_LEN];
int head = 0, filled = 0;
int lastPreds[SMOOTH_N], predCount = 0;
int failStreak = 0;
unsigned long lastSample = 0;
unsigned long seq = 0, nInfer = 0;

// latest results (display + telemetry)
float curT = NAN, curH = NAN;
int curState = -1, curRaw = -1;
float curConf = 0;
float curProba[N_CLASSES];
int16_t curFeats[N_FEATURES];
unsigned long curUs = 0;

// ================= helpers =================
static int smoothed(int p) {
  lastPreds[predCount++ % SMOOTH_N] = p;
  int n = predCount < SMOOTH_N ? predCount : SMOOTH_N;
  int votes[N_CLASSES] = {0}, best = p;
  for (int i = 0; i < n; i++) votes[lastPreds[i]]++;
  for (int c = 0; c < N_CLASSES; c++) if (votes[c] > votes[best]) best = c;
  return best;
}

// "window_open" -> "WINDOW OPEN"
static void prettyLabel(const char *in, char *out, int n) {
  int i = 0;
  for (; in[i] && i < n - 1; i++) out[i] = (in[i] == '_') ? ' ' : toupper((unsigned char)in[i]);
  out[i] = 0;
}

static const char *phaseName() {
  if (failStreak >= MAX_FAILS) return "sensor_error";
  if (filled == 0) return "warmup";          // only until the first good reading (one sample at most)
  return "running";
}

// ================= network =================
static void mqttPublishInfo() {
  char buf[640];
  int n = snprintf(buf, sizeof(buf),
    "{\"device_id\":\"%s\",\"fw\":\"%s\",\"ip\":\"%s\",\"chip\":\"%s\","
    "\"model\":{\"type\":\"random_forest\",\"classes\":[",
    DEVICE_ID, FW_VERSION, WiFi.localIP().toString().c_str(), ESP.getChipModel());
  for (int c = 0; c < N_CLASSES; c++)
    n += snprintf(buf + n, sizeof(buf) - n, "%s\"%s\"", c ? "," : "", ROOM_LABELS[c]);
  n += snprintf(buf + n, sizeof(buf) - n, "],\"features\":[");
  for (int i = 0; i < N_FEATURES; i++)
    n += snprintf(buf + n, sizeof(buf) - n, "%s\"%s\"", i ? "," : "", FEATURE_NAMES[i]);
  snprintf(buf + n, sizeof(buf) - n,
    "],\"feature_scale\":%d,\"window_len\":%d,\"sample_ms\":%lu,\"smooth_n\":%d}}",
    (int)FEAT_SCALE, WIN_LEN, (unsigned long)SAMPLE_MS, SMOOTH_N);
  mqtt.publish(tInfo, buf, true);
}

static bool mqttConnect() {
  char clientId[48];
  snprintf(clientId, sizeof(clientId), "%s-%04x", DEVICE_ID, (unsigned)(ESP.getEfuseMac() & 0xFFFF));
  const char *user = strlen(MQTT_USER) ? MQTT_USER : NULL;
  const char *pass = strlen(MQTT_PASSWD) ? MQTT_PASSWD : NULL;
  bool ok = mqtt.connect(clientId, user, pass, tStatus, 1, true, "offline");
  if (ok) {
    mqtt.publish(tStatus, "online", true);
    mqttPublishInfo();
    Serial.printf("MQTT connected to %s:%d as %s\n", MQTT_HOST, MQTT_PORT, clientId);
  } else {
    Serial.printf("MQTT connect failed, rc=%d (retry in %lu s)\n", mqtt.state(), MQTT_RETRY_MS / 1000);
  }
  return ok;
}

// Non-blocking network upkeep; called every loop() pass.
static void netTick() {
  unsigned long now = millis();
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastWifiTry > WIFI_RETRY_MS) {
      lastWifiTry = now;
      Serial.println("WiFi: reconnecting...");
      WiFi.reconnect();
    }
    return;
  }
  if (!mqtt.connected()) {
    if (now - lastMqttTry > MQTT_RETRY_MS) { lastMqttTry = now; mqttConnect(); }
    return;
  }
  mqtt.loop();
}

static void publishTelemetry() {
  if (!mqtt.connected()) return;
  char buf[900];
  int n = snprintf(buf, sizeof(buf),
    "{\"seq\":%lu,\"uptime_s\":%lu,\"phase\":\"%s\",\"warmup\":{\"filled\":%d,\"total\":%d},",
    seq, millis() / 1000, phaseName(), filled, WIN_LEN);

  if (isnan(curT)) n += snprintf(buf + n, sizeof(buf) - n, "\"t\":null,\"h\":null,\"dp\":null,");
  else n += snprintf(buf + n, sizeof(buf) - n, "\"t\":%.0f,\"h\":%.0f,\"dp\":%.2f,",
                     curT, curH, dew_point(curT, curH));
  n += snprintf(buf + n, sizeof(buf) - n, "\"sensor_ok\":%s,\"fail_streak\":%d,",
                failStreak == 0 ? "true" : "false", failStreak);

  if (curState < 0) {
    n += snprintf(buf + n, sizeof(buf) - n,
                  "\"state\":null,\"raw\":null,\"conf\":null,\"proba\":null,\"features\":null,\"infer_us\":null,");
  } else {
    n += snprintf(buf + n, sizeof(buf) - n, "\"state\":\"%s\",\"raw\":\"%s\",\"conf\":%.2f,\"proba\":{",
                  ROOM_LABELS[curState], ROOM_LABELS[curRaw], curConf);
    for (int c = 0; c < N_CLASSES; c++)
      n += snprintf(buf + n, sizeof(buf) - n, "%s\"%s\":%.2f", c ? "," : "", ROOM_LABELS[c], curProba[c]);
    n += snprintf(buf + n, sizeof(buf) - n, "},\"features\":[");
    for (int i = 0; i < N_FEATURES; i++)
      n += snprintf(buf + n, sizeof(buf) - n, "%s%d", i ? "," : "", curFeats[i]);
    n += snprintf(buf + n, sizeof(buf) - n, "],\"infer_us\":%lu,", curUs);
  }
  snprintf(buf + n, sizeof(buf) - n, "\"rssi\":%d,\"heap\":%u}", (int)WiFi.RSSI(), (unsigned)ESP.getFreeHeap());

  if (!mqtt.publish(tTelemetry, buf, true)) Serial.println("MQTT publish failed (payload too big?)");
}

// ================= display =================
static void drawHeader() {
  oled.setTextSize(1);
  oled.setCursor(0, 0);
  if (isnan(curT)) oled.print("T--C RH--%");
  else oled.printf("T%.0fC RH%.0f%% DP%.0f", curT, curH, dew_point(curT, curH));
  oled.setCursor(104, 0);                                        // link status, top-right
  if (mqtt.connected()) oled.print("MQTT");
  else if (WiFi.status() == WL_CONNECTED) oled.print("WIFI");
  else oled.print("----");
  oled.drawFastHLine(0, 10, SCREEN_W, SSD1306_WHITE);
}

static void drawScreen() {
  if (!oledOk) return;
  oled.clearDisplay();
  oled.setTextColor(SSD1306_WHITE);
  drawHeader();

  if (failStreak >= MAX_FAILS) {                       // sensor problem
    oled.setTextSize(2);
    oled.setCursor(0, 20); oled.print("DHT11");
    oled.setCursor(0, 40); oled.print("ERROR");
    oled.setTextSize(1);
    oled.setCursor(70, 44); oled.print("check");
    oled.setCursor(70, 54); oled.print("wiring");
  } else if (curState < 0) {                          // no good reading yet
    oled.setTextSize(1);
    oled.setCursor(0, 28); oled.print("Reading sensor...");
  } else {                          // prediction
    char label[16];
    prettyLabel(ROOM_LABELS[curState], label, sizeof(label));
    oled.setTextSize(1);
    oled.setCursor(0, 14); oled.print("ROOM STATE");
    oled.setTextSize(2);                               // 12 px/char -> max 10 chars per line
    const char *sp = strchr(label, ' ');
    if (strlen(label) > 10 && sp) {                    // split long two-word labels
      oled.setCursor(0, 24); oled.write((const uint8_t *)label, sp - label);
      oled.setCursor(0, 40); oled.print(sp + 1);
    } else {
      oled.setCursor(0, 28); oled.print(label);
    }
    oled.setTextSize(1);                               // confidence bar
    oled.setCursor(80, 56); oled.printf("p=%.2f", curConf);
    oled.drawRect(0, 58, 76, 6, SSD1306_WHITE);
    oled.fillRect(1, 59, (int)(74 * curConf), 4, SSD1306_WHITE);
  }
  oled.display();
}

// ================= main =================
void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  dht.begin();

  Wire.begin(OLED_SDA, OLED_SCL);
  oledOk = oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  if (!oledOk) Serial.println("OLED not found - check wiring/address (0x3C/0x3D). Continuing without display.");
  else {
    oled.clearDisplay();
    oled.setTextColor(SSD1306_WHITE);
    oled.setTextSize(2); oled.setCursor(0, 8);  oled.print("Room ML");
    oled.setTextSize(1); oled.setCursor(0, 32); oled.printf("%d classes, edge RF", N_CLASSES);
    oled.setCursor(0, 46); oled.print("WiFi: connecting...");
    oled.display();
  }

  snprintf(tStatus, sizeof(tStatus), "%s%s/status", TOPIC_ROOT, DEVICE_ID);
  snprintf(tInfo, sizeof(tInfo), "%s%s/info", TOPIC_ROOT, DEVICE_ID);
  snprintf(tTelemetry, sizeof(tTelemetry), "%s%s/telemetry", TOPIC_ROOT, DEVICE_ID);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 10000) delay(250);   // wait up to 10 s, then carry on
  if (WiFi.status() == WL_CONNECTED) Serial.printf("WiFi connected, IP %s, RSSI %d\n",
                                                   WiFi.localIP().toString().c_str(), (int)WiFi.RSSI());
  else Serial.println("WiFi not connected yet - running offline, will keep retrying");
  lastWifiTry = millis();

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(1024);        // default 256 B is too small for telemetry JSON
  mqtt.setKeepAlive(30);
  mqtt.setSocketTimeout(3);
  if (WiFi.status() == WL_CONNECTED) { mqttConnect(); lastMqttTry = millis(); }

  Serial.printf("room-state model: %d classes, no warm-up, topic %s\n", N_CLASSES, tTelemetry);
  lastSample = millis() - SAMPLE_MS;   // take the first sample immediately
}

void loop() {
  netTick();

  unsigned long now = millis();
  if (now - lastSample < SAMPLE_MS) return;
  lastSample = now;
  seq++;

  float t = dht.readTemperature(), h = dht.readHumidity();
  if (isnan(t) || isnan(h)) { delay(1100); t = dht.readTemperature(); h = dht.readHumidity(); }  // one retry

  if (isnan(t) || isnan(h)) {
    failStreak++;
    Serial.printf("DHT read failed (%d in a row)\n", failStreak);
    if (filled == 0) { drawScreen(); publishTelemetry(); return; }   // nothing to fall back on yet
    int prev = (head - 1 + WIN_LEN) % WIN_LEN;                        // hold last good value
    t = tBuf[prev]; h = hBuf[prev];
  } else {
    failStreak = 0;
    curT = t; curH = h;
  }

  if (filled == 0) {                                  // first good reading: pre-fill the window
    for (int i = 0; i < WIN_LEN; i++) { tBuf[i] = t; hBuf[i] = h; }
    head = 0;
    filled = WIN_LEN;
    Serial.printf("window pre-filled with T=%.0f RH=%.0f, predicting now\n", t, h);
  } else {
    tBuf[head] = t; hBuf[head] = h;
    head = (head + 1) % WIN_LEN;
  }

  float tw[WIN_LEN], hw[WIN_LEN];
  for (int i = 0; i < WIN_LEN; i++) { tw[i] = tBuf[(head + i) % WIN_LEN]; hw[i] = hBuf[(head + i) % WIN_LEN]; }
  compute_features(tw, hw, curFeats);

  unsigned long t0 = micros();
  room_model_predict_proba(curFeats, N_FEATURES, curProba, N_CLASSES);
  curUs = micros() - t0;

  int raw = 0;
  for (int c = 1; c < N_CLASSES; c++) if (curProba[c] > curProba[raw]) raw = c;
  curRaw = raw;
  curState = smoothed(raw);
  curConf = curProba[curState];
  nInfer++;

  digitalWrite(LED_PIN, strcmp(ROOM_LABELS[curState], "normal") != 0);
  Serial.printf("#%lu T=%.0f RH=%.0f -> %s (p=%.2f, raw=%s) [%lu us] %s\n",
                nInfer, t, h, ROOM_LABELS[curState], curConf, ROOM_LABELS[raw], curUs,
                mqtt.connected() ? "MQTT" : "offline");
  drawScreen();
  publishTelemetry();
}
