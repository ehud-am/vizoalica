import type { AnalyticsOverview } from '../api/local-operations.js';
import type { AppliedRange } from '../time-range.js';

export type ComparisonState = 'available' | 'no-previous-data' | 'unavailable';

export interface MetricComparison {
  current: number;
  previous?: number;
  /** current - previous */
  delta?: number;
  /** Relative change in percent; omitted when the previous value is 0. */
  percent?: number;
  state: ComparisonState;
}

export function compareMetric(
  current: number,
  previous: number | undefined,
  state: ComparisonState
): MetricComparison {
  if (state !== 'available' || previous === undefined) return { current, state };
  return {
    current,
    previous,
    delta: current - previous,
    ...(previous > 0 ? { percent: ((current - previous) / previous) * 100 } : {}),
    state
  };
}

/** The immediately preceding range of equal length. */
export function previousRange(range: Pick<AppliedRange, 'startUtc' | 'endUtc'>): {
  startUtc: string;
  endUtc: string;
} {
  const start = Date.parse(range.startUtc);
  const end = Date.parse(range.endUtc);
  return {
    startUtc: new Date(start - (end - start)).toISOString(),
    endUtc: new Date(start).toISOString()
  };
}

/** A previous period is only comparable when the aggregates for all of it exist. */
export function comparisonState(previous: AnalyticsOverview | undefined): ComparisonState {
  if (!previous) return 'unavailable';
  return previous.availability.state === 'complete' ? 'available' : 'no-previous-data';
}

/** Words for the change, so the direction never depends on color or an arrow alone. */
export function describeChange(comparison: MetricComparison): string {
  if (comparison.state === 'unavailable') return 'Comparison unavailable';
  if (comparison.state === 'no-previous-data') return 'No earlier data to compare';
  const delta = comparison.delta ?? 0;
  if (delta === 0) return 'No change';
  const direction = delta > 0 ? 'Up' : 'Down';
  if (comparison.percent === undefined) return `${direction} from none`;
  const magnitude = Math.abs(comparison.percent);
  return `${direction} ${magnitude < 10 ? magnitude.toFixed(1) : Math.round(magnitude)}%`;
}
