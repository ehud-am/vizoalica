import { describe, expect, it } from 'vitest';
import {
  AnalyticsRangeError,
  MAX_ANALYTICS_RANGE_MS,
  completeMinute,
  parseAnalyticsRange,
  presetRange
} from '../../src/analytics/range.js';

const NOW = new Date('2026-09-09T12:34:56.789Z');

describe('analytics range presets', () => {
  it.each([
    ['6h', 6],
    ['12h', 12],
    ['24h', 24],
    ['7d', 168],
    ['30d', 720]
  ] as const)('produces a complete-minute %s range spanning exactly %d hours', (preset, hours) => {
    const range = presetRange(preset, NOW);
    expect(range.endUtc).toBe(completeMinute(NOW).toISOString());
    expect(new Date(range.endUtc).getTime() - new Date(range.startUtc).getTime()).toBe(
      hours * 60 * 60 * 1000
    );
  });

  it('rounds the end boundary down to a complete minute, dropping seconds and milliseconds', () => {
    const range = presetRange('24h', NOW);
    expect(range.endUtc).toBe('2026-09-09T12:34:00.000Z');
  });

  it('selects an hourly interval for 24h or less and a daily interval beyond that', () => {
    expect(presetRange('24h', NOW).interval).toBe('hour');
    expect(presetRange('7d', NOW).interval).toBe('day');
    expect(presetRange('30d', NOW).interval).toBe('day');
  });

  it('always reports UTC as the timezone', () => {
    expect(presetRange('6h', NOW).timezone).toBe('UTC');
  });
});

describe('analytics range custom parsing', () => {
  const minute = (iso: string) => iso;

  it('accepts a minute-aligned half-open range and echoes the exact boundaries back', () => {
    const range = parseAnalyticsRange(
      minute('2026-09-08T00:00:00.000Z'),
      minute('2026-09-09T00:00:00.000Z'),
      NOW
    );
    expect(range).toEqual({
      startUtc: '2026-09-08T00:00:00.000Z',
      endUtc: '2026-09-09T00:00:00.000Z',
      interval: 'hour',
      timezone: 'UTC'
    });
  });

  it('rejects a missing start with a field-level error naming start', () => {
    expect(() => parseAnalyticsRange(null, '2026-09-09T00:00:00.000Z', NOW)).toThrow(
      AnalyticsRangeError
    );
    try {
      parseAnalyticsRange(null, '2026-09-09T00:00:00.000Z', NOW);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AnalyticsRangeError);
      expect((error as AnalyticsRangeError).field).toBe('start');
    }
  });

  it('rejects a missing end with a field-level error naming end', () => {
    try {
      parseAnalyticsRange('2026-09-08T00:00:00.000Z', null, NOW);
      expect.unreachable();
    } catch (error) {
      expect((error as AnalyticsRangeError).field).toBe('end');
    }
  });

  it('rejects an unparseable date string', () => {
    try {
      parseAnalyticsRange('not-a-date', '2026-09-09T00:00:00.000Z', NOW);
      expect.unreachable();
    } catch (error) {
      expect((error as AnalyticsRangeError).field).toBe('start');
    }
  });

  it('rejects a start or end that is not aligned to a whole minute', () => {
    try {
      parseAnalyticsRange('2026-09-08T00:00:00.500Z', '2026-09-09T00:00:00.000Z', NOW);
      expect.unreachable();
    } catch (error) {
      expect((error as AnalyticsRangeError).field).toBe('start');
    }
    try {
      parseAnalyticsRange('2026-09-08T00:00:00.000Z', '2026-09-09T00:00:30.000Z', NOW);
      expect.unreachable();
    } catch (error) {
      expect((error as AnalyticsRangeError).field).toBe('end');
    }
  });

  it('rejects an end equal to start', () => {
    try {
      parseAnalyticsRange('2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z', NOW);
      expect.unreachable();
    } catch (error) {
      expect((error as AnalyticsRangeError).field).toBe('end');
      expect((error as AnalyticsRangeError).message).toMatch(/after start/);
    }
  });

  it('rejects a reversed range (end before start)', () => {
    try {
      parseAnalyticsRange('2026-09-09T00:00:00.000Z', '2026-09-08T00:00:00.000Z', NOW);
      expect.unreachable();
    } catch (error) {
      expect((error as AnalyticsRangeError).field).toBe('end');
    }
  });

  it('rejects an end after the current complete minute', () => {
    try {
      parseAnalyticsRange('2026-09-09T00:00:00.000Z', '2026-09-09T13:00:00.000Z', NOW);
      expect.unreachable();
    } catch (error) {
      expect((error as AnalyticsRangeError).field).toBe('end');
      expect((error as AnalyticsRangeError).message).toMatch(/current complete minute/);
    }
  });

  it('accepts an end exactly at the current complete minute', () => {
    const range = parseAnalyticsRange(
      '2026-09-09T00:00:00.000Z',
      completeMinute(NOW).toISOString(),
      NOW
    );
    expect(range.endUtc).toBe(completeMinute(NOW).toISOString());
  });

  it('rejects a range spanning more than 30 days', () => {
    const start = '2026-08-01T00:00:00.000Z';
    const end = new Date(new Date(start).getTime() + MAX_ANALYTICS_RANGE_MS + 60_000).toISOString();
    try {
      parseAnalyticsRange(start, end, NOW);
      expect.unreachable();
    } catch (error) {
      expect((error as AnalyticsRangeError).field).toBe('end');
      expect((error as AnalyticsRangeError).message).toMatch(/30 days/);
    }
  });

  it('accepts a range exactly at the 30-day maximum', () => {
    const start = '2026-08-01T00:00:00.000Z';
    const end = new Date(new Date(start).getTime() + MAX_ANALYTICS_RANGE_MS).toISOString();
    const range = parseAnalyticsRange(start, end, NOW);
    expect(range.endUtc).toBe(end);
  });

  it('selects an hourly trend interval at or under 24 hours and daily beyond it', () => {
    expect(
      parseAnalyticsRange('2026-09-08T12:00:00.000Z', '2026-09-09T12:00:00.000Z', NOW).interval
    ).toBe('hour');
    expect(
      parseAnalyticsRange('2026-09-01T00:00:00.000Z', '2026-09-03T00:00:00.000Z', NOW).interval
    ).toBe('day');
  });

  it('resolves an ISO string with a non-UTC offset to the equivalent UTC instant', () => {
    // A local time with a +02:00 offset (e.g. a DST-observing timezone) must
    // convert to the correct UTC minute boundary rather than being rejected
    // or silently reinterpreted as UTC.
    const range = parseAnalyticsRange(
      '2026-09-08T02:00:00.000+02:00',
      '2026-09-09T02:00:00.000+02:00',
      NOW
    );
    expect(range.startUtc).toBe('2026-09-08T00:00:00.000Z');
    expect(range.endUtc).toBe('2026-09-09T00:00:00.000Z');
  });
});
