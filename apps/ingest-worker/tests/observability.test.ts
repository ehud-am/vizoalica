import { describe, expect, it, vi } from 'vitest';
import { workerLogger } from '../src/observability.js';

describe('worker logger', () => {
  it('accepts only explicit safe contexts', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    workerLogger.info('accepted', { project_id: 'project-a', accepted_count: 1 });
    expect(spy).toHaveBeenCalledWith('accepted', { project_id: 'project-a', accepted_count: 1 });
    spy.mockRestore();
  });
});
