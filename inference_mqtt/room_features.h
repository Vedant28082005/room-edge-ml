// room_features.h — feature extraction for room-state model.
// MUST stay identical to compute_features() in train/train.py.
// Pure C so it can be unit-tested on a PC with gcc.
#pragma once
#include <math.h>
#include <stdint.h>

#define WIN_LEN      30   // samples in window (30 x 10 s = 5 min)
#define N_FEATURES   9
#define FEAT_SCALE   100.0f  // features are sent to the model as int16 = round(x * 100)

// Magnus formula dew point (deg C)
static inline float dew_point(float t, float rh) {
  const float a = 17.62f, b = 243.12f;
  if (rh < 1.0f) rh = 1.0f;
  float g = logf(rh / 100.0f) + (a * t) / (b + t);
  return (b * g) / (a - g);
}

static inline float mean_range(const float *x, int from, int to) {  // [from, to)
  float s = 0;
  for (int i = from; i < to; i++) s += x[i];
  return s / (float)(to - from);
}

static inline float std_all(const float *x, int n) {
  float m = mean_range(x, 0, n), s = 0;
  for (int i = 0; i < n; i++) s += (x[i] - m) * (x[i] - m);
  return sqrtf(s / (float)n);
}

static inline int16_t to_i16(float v) {
  float s = roundf(v * FEAT_SCALE);
  if (s > 32767.0f) s = 32767.0f;
  if (s < -32768.0f) s = -32768.0f;
  return (int16_t)s;
}

// t[], h[]: oldest .. newest, length WIN_LEN (chronological order)
static inline void compute_features(const float *t, const float *h, int16_t *out) {
  const int n = WIN_LEN;
  float t_now  = mean_range(t, n - 3, n);
  float h_now  = mean_range(h, n - 3, n);
  float t_old  = mean_range(t, 0, 3);
  float h_old  = mean_range(h, 0, 3);
  float t_prev = mean_range(t, n - 9, n - 6);   // ~1 min earlier
  float h_prev = mean_range(h, n - 9, n - 6);

  out[0] = to_i16(t_now);
  out[1] = to_i16(h_now);
  out[2] = to_i16(dew_point(t_now, h_now));
  out[3] = to_i16(t_now - t_old);    // 5-min trend
  out[4] = to_i16(h_now - h_old);
  out[5] = to_i16(t_now - t_prev);   // 1-min trend
  out[6] = to_i16(h_now - h_prev);
  out[7] = to_i16(std_all(t, n));
  out[8] = to_i16(std_all(h, n));
}
