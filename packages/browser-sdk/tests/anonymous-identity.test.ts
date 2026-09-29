import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAnonymousId } from '../src/events.js';
import type { VizoalicaConfig } from '../src/types.js';

function trackingStorage() {
  const calls: string[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(`${name}:${args.join(',')}`);
      return null;
    };
  return {
    storage: { getItem: record('get'), setItem: record('set'), removeItem: record('remove') },
    calls
  };
}

function config(overrides: Partial<VizoalicaConfig> = {}): VizoalicaConfig {
  return { endpoint: 'https://worker.test/v1/events:batch', sourceKey: 'public-key', ...overrides };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser SDK anonymous identity', () => {
  it('prefers an explicit anonymousId', () => {
    expect(resolveAnonymousId(config({ anonymousId: 'anon_explicit' }))).toBe('anon_explicit');
  });

  it('never reads or writes browser storage, whatever the consent state', () => {
    const { storage, calls } = trackingStorage();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('sessionStorage', storage);
    for (const consentState of ['analytics-granted', 'analytics-denied', 'unknown'] as const)
      resolveAnonymousId(config({ consentState }));
    resolveAnonymousId(config());
    expect(calls).toEqual([]);
  });

  it('generates a fresh id on every call, so nothing links two page loads in the browser', () => {
    const first = resolveAnonymousId(config({ consentState: 'analytics-granted' }));
    const second = resolveAnonymousId(config({ consentState: 'analytics-granted' }));
    expect(first).toMatch(/^anon_/);
    expect(second).not.toBe(first);
  });
});
