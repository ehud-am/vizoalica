import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  datetimeLocalValueToUtc,
  localTimeZoneLabel,
  validateCustomRange
} from '../src/time-range.js';

afterEach(() => vi.unstubAllGlobals());

describe('validateCustomRange', () => {
  const now = new Date('2026-01-15T12:00:00.000Z');

  it('rejects an unparseable start date', () => {
    expect(validateCustomRange('not-a-date', '2026-01-15T00:00:00.000Z', now)).toEqual({
      field: 'start',
      message: 'Start is not a valid date.'
    });
  });

  it('rejects an unparseable end date', () => {
    expect(validateCustomRange('2026-01-14T00:00:00.000Z', 'not-a-date', now)).toEqual({
      field: 'end',
      message: 'End is not a valid date.'
    });
  });

  it('rejects an end later than the current complete minute', () => {
    expect(
      validateCustomRange('2026-01-14T00:00:00.000Z', '2026-01-16T00:00:00.000Z', now)
    ).toEqual({
      field: 'end',
      message: 'End must not be later than the current complete minute.'
    });
  });

  it('rejects a range longer than 30 days', () => {
    expect(
      validateCustomRange('2025-11-01T00:00:00.000Z', '2026-01-15T00:00:00.000Z', now)
    ).toEqual({ field: 'end', message: 'Range must not exceed 30 days.' });
  });

  it('accepts a valid range', () => {
    expect(
      validateCustomRange('2026-01-14T00:00:00.000Z', '2026-01-15T00:00:00.000Z', now)
    ).toBeUndefined();
  });
});

describe('datetimeLocalValueToUtc', () => {
  it('returns undefined for a value that does not match the expected shape', () => {
    expect(datetimeLocalValueToUtc('not-a-datetime-local-value')).toBeUndefined();
    expect(datetimeLocalValueToUtc('2026-01-15')).toBeUndefined();
  });
});

describe('localTimeZoneLabel', () => {
  it('falls back to a UTC offset label when Intl throws', () => {
    vi.stubGlobal('Intl', {
      DateTimeFormat: () => {
        throw new Error('unavailable');
      }
    });
    expect(localTimeZoneLabel()).toMatch(/^UTC[+-]\d{2}:\d{2}$/);
  });

  it('falls back to a UTC offset label when Intl reports no timeZone', () => {
    vi.stubGlobal('Intl', { DateTimeFormat: () => ({ resolvedOptions: () => ({}) }) });
    expect(localTimeZoneLabel()).toMatch(/^UTC[+-]\d{2}:\d{2}$/);
  });
});
