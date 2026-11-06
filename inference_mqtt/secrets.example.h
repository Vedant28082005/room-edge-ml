// secrets.example.h — template. Copy to secrets.h and fill in your values.
// secrets.h is git-ignored; never commit real credentials.
#pragma once

#define WIFI_SSID     "your-wifi-name"
#define WIFI_PASS     "your-wifi-password"
#define MQTT_HOST     "192.168.x.x"      // IP of the laptop running Mosquitto (run ipconfig), NOT localhost
#define MQTT_USER     ""                // leave empty for an anonymous local broker
#define MQTT_PASSWD   ""
