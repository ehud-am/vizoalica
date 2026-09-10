import type { AnalyticsRange } from '../domain/types.js';

export const MAX_ANALYTICS_RANGE_MS = 30 * 24 * 60 * 60 * 1000;

export class AnalyticsRangeError extends Error {
  readonly code = 'invalid_range' as const;
  constructor(
    readonly field: 'start' | 'end',
    message: string
  ) {
    super(message);
    this.name = 'AnalyticsRangeError';
  }
}

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
  if (!startValue) throw new AnalyticsRangeError('start', 'Start is required.');
  if (!endValue) throw new AnalyticsRangeError('end', 'End is required.');
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (!Number.isFinite(start.getTime()))
    throw new AnalyticsRangeError('start', 'Start must be a valid UTC minute boundary.');
  if (!Number.isFinite(end.getTime()))
    throw new AnalyticsRangeError('end', 'End must be a valid UTC minute boundary.');
  if (!minuteAligned(start))
    throw new AnalyticsRangeError('start', 'Start must align to a whole minute.');
  if (!minuteAligned(end))
    throw new AnalyticsRangeError('end', 'End must align to a whole minute.');
  if (start.getTime() >= end.getTime())
    throw new AnalyticsRangeError('end', 'End must be after start.');
  if (end.getTime() > completeMinute(now).getTime())
    throw new AnalyticsRangeError(
      'end',
      'End must be after start and no later than the current complete minute.'
    );
  if (end.getTime() - start.getTime() > MAX_ANALYTICS_RANGE_MS)
    throw new AnalyticsRangeError('end', 'Range must not exceed 30 days.');
  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
    interval: end.getTime() - start.getTime() <= 24 * 60 * 60 * 1000 ? 'hour' : 'day',
    timezone: 'UTC'
  };
}
