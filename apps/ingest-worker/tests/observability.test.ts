import { describe, expect, it, vi } from 'vitest';
import { workerLogger } from '../src/observability.js';

describe('worker logger', () => {
  it('accepts only explicit safe contexts', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    workerLogger.info('accepted', { project_id: 'project-a', accepted_count: 1 });
    expect(spy).toHaveBeenCalledWith('accepted', { project_id: 'project-a', accepted_count: 1 });
    spy.mockRestore();
  });

  it('uses an empty safe context when one is omitted', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    workerLogger.info('info');
    workerLogger.warn('warn');
    workerLogger.error('error');

    expect(info).toHaveBeenCalledWith('info', {});
    expect(warn).toHaveBeenCalledWith('warn', {});
    expect(error).toHaveBeenCalledWith('error', {});
  });
});
