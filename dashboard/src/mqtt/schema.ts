import { z } from 'zod';

const nullNum = z
  .number()
  .nullish()
  .transform((v) => v ?? null);
const nullStr = z
  .string()
  .nullish()
  .transform((v) => v ?? null);

export const phaseSchema = z.enum(['warmup', 'running', 'sensor_error']);
export type Phase = z.infer<typeof phaseSchema>;

export const telemetrySchema = z.object({
  seq: z.number().int(),
  uptime_s: z.number(),
  phase: phaseSchema,
  warmup: z.object({ filled: z.number(), total: z.number() }),
  t: nullNum,
  h: nullNum,
  dp: nullNum,
  sensor_ok: z.boolean(),
  fail_streak: z.number(),
  state: nullStr,
  raw: nullStr,
  conf: nullNum,
  proba: z
    .record(z.string(), z.number())
    .nullish()
    .transform((v) => v ?? null),
  features: z
    .array(z.number())
    .nullish()
    .transform((v) => v ?? null),
  infer_us: nullNum,
  rssi: z.number(),
  heap: z.number(),
});

export type Telemetry = z.infer<typeof telemetrySchema>;
/** Telemetry stamped with arrival time. ts === 0 means the time is unknown (retained message). */
export type Sample = Telemetry & { ts: number };

export const infoSchema = z.object({
  device_id: z.string(),
  fw: z.string(),
  ip: z.string(),
  chip: z.string(),
  model: z.object({
    type: z.string(),
    classes: z.array(z.string()),
    features: z.array(z.string()),
    feature_scale: z.number().positive(),
    window_len: z.number(),
    sample_ms: z.number().positive(),
    smooth_n: z.number(),
  }),
});
export type DeviceInfo = z.infer<typeof infoSchema>;

export const statusSchema = z.enum(['online', 'offline']);
export type DeviceStatus = z.infer<typeof statusSchema>;
