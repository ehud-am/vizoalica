import {
  AnalyticsRangeError,
  completeMinute,
  MAX_ANALYTICS_RANGE_MS,
  parseAnalyticsRange
} from '../../../ingest-api/src/analytics/range.js';

export const PRESETS = [
  'last_24_hours',
  'today',
  'yesterday',
  'last_7_days',
  'last_14_days',
  'last_28_days',
  'last_30_days'
] as const;
export type Preset = (typeof PRESETS)[number];

export type RangeInput = {
  preset?: Preset | undefined;
  start?: string | undefined;
  end?: string | undefined;
};
export type Range = { startUtc: string; endUtc: string };

const DAY = 24 * 60 * 60 * 1000;

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** A date (`2026-09-01`) is midnight UTC; anything else must be a full ISO time. */
function parseTime(value: string, field: 'start' | 'end'): Date {
  const text = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const time = new Date(text);
  if (!Number.isFinite(time.getTime()))
    throw new AnalyticsRangeError(
      field,
      `${field} must be a date (YYYY-MM-DD) or an ISO time in UTC.`
    );
  time.setUTCSeconds(0, 0);
  return time;
}

/**
 * The UTC range a tool asks the Worker for. Presets end at the current complete minute (or midnight
 * UTC for `yesterday`); explicit dates are whole UTC days, end exclusive. The Worker's 30-day cap is
 * checked here too, so the agent gets the reason instead of a failed request.
 */
export function resolveRange(input: RangeInput, now = new Date()): Range {
  const end = completeMinute(now);
  if (input.preset && (input.start || input.end))
    throw new AnalyticsRangeError('start', 'Give either a preset or start and end, not both.');
  if (input.start || input.end) {
    if (!input.start) throw new AnalyticsRangeError('start', 'start is required with end.');
    const start = parseTime(input.start, 'start');
    let until = input.end ? parseTime(input.end, 'end') : end;
    if (until.getTime() > end.getTime()) until = end;
    return check(start, until, now);
  }
  const preset = input.preset ?? 'last_7_days';
  const today = startOfUtcDay(end);
  switch (preset) {
    case 'last_24_hours':
      return check(new Date(end.getTime() - DAY), end, now);
    case 'today':
      return check(
        today.getTime() === end.getTime() ? new Date(end.getTime() - 60_000) : today,
        end,
        now
      );
    case 'yesterday':
      return check(new Date(today.getTime() - DAY), today, now);
    default: {
      const days = Number(/^last_(\d+)_days$/.exec(preset)![1]);
      return check(new Date(end.getTime() - days * DAY), end, now);
    }
  }
}

function check(start: Date, end: Date, now: Date): Range {
  if (end.getTime() - start.getTime() > MAX_ANALYTICS_RANGE_MS)
    throw new AnalyticsRangeError(
      'end',
      'A range can be at most 30 days. Split a longer question into periods of 30 days or less.'
    );
  const range = parseAnalyticsRange(start.toISOString(), end.toISOString(), now);
  return { startUtc: range.startUtc, endUtc: range.endUtc };
}

/** The period of the same length that ends where `range` starts. */
export function previousRange(range: Range): Range {
  const start = Date.parse(range.startUtc);
  const length = Date.parse(range.endUtc) - start;
  return {
    startUtc: new Date(start - length).toISOString(),
    endUtc: new Date(start).toISOString()
  };
}
