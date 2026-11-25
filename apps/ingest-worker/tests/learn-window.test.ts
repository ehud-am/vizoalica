import { describe, expect, it } from 'vitest';
import {
  isLearnWindowOpen,
  parseLearnWindow
} from '../../ingest-api/src/ingestion/learn-window.js';

describe('parseLearnWindow', () => {
  it('reads a start date with default days and sample', () => {
    const w = parseLearnWindow('2026-12-01', undefined)!;
    expect(w.startUtc).toBe('2026-12-01T00:00:00.000Z');
    expect(w.endUtc).toBe('2026-12-15T00:00:00.000Z');
  });
  it('accepts explicit days and sample, and refuses anything unreadable', () => {
    expect(parseLearnWindow('2026-12-01', '7', '25')).toBeDefined();
    expect(parseLearnWindow('2026-12-01', '', '')).toBeDefined();
    for (const bad of [
      [undefined, undefined],
      ['soon', undefined],
      ['2026-13-45', undefined],
      ['2026-12-01', '0'],
      ['2026-12-01', '1000'],
      ['2026-12-01', '1.5']
    ] as const)
      expect(parseLearnWindow(bad[0], bad[1])).toBeUndefined();
    expect(parseLearnWindow('2026-12-01', '7', '0')).toBeUndefined();
    expect(parseLearnWindow('2026-12-01', '7', '101')).toBeUndefined();
  });
  it('is open only inside the window', () => {
    const w = parseLearnWindow('2026-12-01', '2')!;
    expect(isLearnWindowOpen(w, new Date('2026-12-02T12:00:00Z'))).toBe(true);
    expect(isLearnWindowOpen(w, new Date('2026-12-03T00:00:00Z'))).toBe(false);
    expect(isLearnWindowOpen(undefined, new Date())).toBe(false);
  });
});
