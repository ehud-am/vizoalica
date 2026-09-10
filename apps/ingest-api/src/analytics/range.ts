import type { AnalyticsRange } from '../domain/types.js';

export const MAX_ANALYTICS_RANGE_MS = 30 * 24 * 60 * 60 * 1000;

export function completeMinute(now = new Date()): Date {
  const value = new Date(now);
  value.setUTCSeconds(0, 0);
  return value;
}

export function presetRange(
  preset: '6h' | '12h' | '24h' | '7d' | '30d',
  now = new Date()
): AnalyticsRange {
  const hours =
    preset === '6h'
      ? 6
      : preset === '12h'
        ? 12
        : preset === '24h'
          ? 24
          : preset === '7d'
            ? 168
            : 720;
  const end = completeMinute(now);
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
    interval: hours <= 24 ? 'hour' : 'day',
    timezone: 'UTC'
  };
}

function minuteAligned(value: Date): boolean {
  return value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0;
}

export function parseAnalyticsRange(
  startValue: string | null,
  endValue: string | null,
  now = new Date()
): AnalyticsRange {
  if (!startValue || !endValue) throw new Error('invalid_range');
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    !minuteAligned(start) ||
    !minuteAligned(end) ||
    start.getTime() >= end.getTime() ||
    end.getTime() > completeMinute(now).getTime() ||
    end.getTime() - start.getTime() > MAX_ANALYTICS_RANGE_MS
  ) {
    throw new Error('invalid_range');
  }
  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
    interval: end.getTime() - start.getTime() <= 24 * 60 * 60 * 1000 ? 'hour' : 'day',
    timezone: 'UTC'
  };
}
