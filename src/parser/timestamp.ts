import type { TimestampResult } from '../types.ts';

/** Asia/Shanghai is UTC+8 with no DST; a fixed offset is exact for this zone. */
const SHANGHAI_OFFSET_SECONDS = 8 * 3600;

/** Steam launched on 2003-09-12; anything earlier is implausible for first-play. */
export const MIN_STEAM_EPOCH_SECONDS = Date.UTC(2003, 8, 12) / 1000;
/** Values at or above this are far more likely milliseconds/microseconds than seconds. */
export const UNIT_ANOMALY_THRESHOLD = 100_000_000_000;
/** Below this (and above 0) a timestamp cannot be Unix seconds for any Steam play date. */
export const UNIT_ANOMALY_LOW_THRESHOLD = 100_000_000;
const FUTURE_SKEW_SECONDS = 86_400;

export function toShanghaiDate(unixSeconds: number): string {
  const date = new Date((unixSeconds + SHANGHAI_OFFSET_SECONDS) * 1000);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface ClassifyTimestampOptions {
  nowUnix?: number;
}

/**
 * Classifies a raw `first_*_playtime` value. The unit is validated against
 * plausible Unix-second ranges instead of trusting the field name.
 */
export function classifyTimestamp(
  value: unknown,
  options: ClassifyTimestampOptions = {},
): TimestampResult {
  if (value === undefined || value === null) {
    return { status: 'missing', unix: null, date: null };
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { status: 'not-a-number', unix: null, date: null };
  }
  if (value === 0) {
    return { status: 'zero', unix: null, date: null };
  }
  if (!Number.isInteger(value)) {
    return { status: 'not-integer', unix: null, date: null };
  }
  if (value < 0) {
    return { status: 'negative', unix: null, date: null };
  }
  if (value >= UNIT_ANOMALY_THRESHOLD || value < UNIT_ANOMALY_LOW_THRESHOLD) {
    return { status: 'unit-anomaly', unix: null, date: null };
  }
  const nowUnix = options.nowUnix ?? Math.floor(Date.now() / 1000);
  if (value < MIN_STEAM_EPOCH_SECONDS || value > nowUnix + FUTURE_SKEW_SECONDS) {
    return { status: 'implausible-date', unix: null, date: null };
  }
  return { status: 'valid', unix: value, date: toShanghaiDate(value) };
}
