import { describe, expect, it } from 'vitest';
import { StepTracker } from '../src/deploy/steps.js';

describe('StepTracker', () => {
  const ids = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' }
  ];

  it('starts every step pending, and moves it through running, done, skipped, or failed', () => {
    const tracker = new StepTracker(ids);
    expect(tracker.steps.map((s) => s.status)).toEqual(['pending', 'pending']);
    tracker.start('a');
    expect(tracker.steps[0]!.status).toBe('running');
    tracker.finish('a');
    expect(tracker.steps[0]!.status).toBe('done');
    tracker.start('b');
    tracker.skip('b');
    expect(tracker.steps[1]!.status).toBe('skipped');
  });

  it('records a failure with its message', () => {
    const tracker = new StepTracker(ids);
    tracker.start('a');
    tracker.fail('a', new Error('it broke'));
    expect(tracker.steps[0]!).toMatchObject({ status: 'failed', error: 'it broke' });
  });

  it('does nothing for an id it was never built with', () => {
    const tracker = new StepTracker(ids);
    tracker.start('unknown');
    tracker.fail('unknown', new Error('x'));
    expect(tracker.steps.map((s) => s.status)).toEqual(['pending', 'pending']);
  });
});
