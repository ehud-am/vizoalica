import { describe, expect, it } from 'vitest';
import {
  compareMetric,
  comparisonState,
  describeChange,
  previousRange
} from '../src/analytics/comparison.js';
import { formatShare } from '../src/format.js';
import { makeOverview } from './fixtures/console.js';

describe('previous period', () => {
  it('is the equally long range that ends where the selected range starts', () => {
    expect(
      previousRange({ startUtc: '2026-01-02T00:00:00.000Z', endUtc: '2026-01-03T06:00:00.000Z' })
    ).toEqual({ startUtc: '2025-12-31T18:00:00.000Z', endUtc: '2026-01-02T00:00:00.000Z' });
  });

  it('is comparable only when its aggregates are complete', () => {
    expect(comparisonState(makeOverview())).toBe('available');
    expect(
      comparisonState(makeOverview({ availability: { state: 'incomplete', taxonomyVersions: [] } }))
    ).toBe('no-previous-data');
    expect(comparisonState(undefined)).toBe('unavailable');
  });
});

describe('metric comparison', () => {
  it('reports the absolute and relative change', () => {
    expect(compareMetric(150, 100, 'available')).toEqual({
      current: 150,
      previous: 100,
      delta: 50,
      percent: 50,
      state: 'available'
    });
  });

  it('omits the percentage when the previous value was zero', () => {
    const result = compareMetric(5, 0, 'available');
    expect(result.percent).toBeUndefined();
    expect(result.delta).toBe(5);
  });

  it('carries no numbers when the previous period is not comparable', () => {
    expect(compareMetric(5, 3, 'no-previous-data')).toEqual({
      current: 5,
      state: 'no-previous-data'
    });
    expect(compareMetric(5, undefined, 'available')).toEqual({ current: 5, state: 'available' });
  });

  it('describes the change in words', () => {
    expect(describeChange(compareMetric(150, 100, 'available'))).toBe('Up 50%');
    expect(describeChange(compareMetric(80, 100, 'available'))).toBe('Down 20%');
    expect(describeChange(compareMetric(101, 100, 'available'))).toBe('Up 1.0%');
    expect(describeChange(compareMetric(5, 5, 'available'))).toBe('No change');
    expect(describeChange(compareMetric(5, 0, 'available'))).toBe('Up from none');
    expect(describeChange(compareMetric(5, 3, 'no-previous-data'))).toBe(
      'No earlier data to compare'
    );
    expect(describeChange(compareMetric(5, 3, 'unavailable'))).toBe('Comparison unavailable');
  });
});

describe('share formatting', () => {
  it('formats small, medium, and large shares', () => {
    expect(formatShare(0, 100)).toBe('0%');
    expect(formatShare(5, 0)).toBe('0%');
    expect(formatShare(1, 5000)).toBe('<0.1%');
    expect(formatShare(42, 1000)).toBe('4.2%');
    expect(formatShare(380, 1000)).toBe('38%');
  });
});
