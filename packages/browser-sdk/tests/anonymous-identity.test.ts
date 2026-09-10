import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAnonymousId } from '../src/events.js';
import type { VizoalicaConfig } from '../src/types.js';

function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    get size() {
      return store.size;
    },
    dump: () => Object.fromEntries(store)
  };
}

function config(overrides: Partial<VizoalicaConfig> = {}): VizoalicaConfig {
  return { endpoint: 'https://worker.test/v1/events:batch', sourceKey: 'public-key', ...overrides };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser SDK anonymous identity', () => {
  it('always prefers an explicit anonymousId over anything stored or generated', () => {
    const storage = fakeStorage({ 'vizoalica:anonymous:public-key': 'anon_stored' });
    vi.stubGlobal('localStorage', storage);
    const id = resolveAnonymousId(
      config({ anonymousId: 'anon_explicit', consentState: 'analytics-granted' })
    );
    expect(id).toBe('anon_explicit');
    expect(storage.getItem('vizoalica:anonymous:public-key')).toBe('anon_stored');
  });

  it('persists a newly generated id under a source-namespaced key when consent is granted', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    const id = resolveAnonymousId(config({ consentState: 'analytics-granted' }));
    expect(id).toMatch(/^anon_/);
    expect(storage.getItem('vizoalica:anonymous:public-key')).toBe(id);
  });

  it('namespaces persisted ids by source key so two sources on the same origin never collide', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    const first = resolveAnonymousId(
      config({ sourceKey: 'source-a', consentState: 'analytics-granted' })
    );
    const second = resolveAnonymousId(
      config({ sourceKey: 'source-b', consentState: 'analytics-granted' })
    );
    expect(storage.getItem('vizoalica:anonymous:source-a')).toBe(first);
    expect(storage.getItem('vizoalica:anonymous:source-b')).toBe(second);
    expect(first).not.toBe(second);
  });

  it('reuses a previously persisted id on a later call instead of generating a new one', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    const first = resolveAnonymousId(config({ consentState: 'analytics-granted' }));
    const second = resolveAnonymousId(config({ consentState: 'analytics-granted' }));
    expect(second).toBe(first);
    expect(storage.size).toBe(1);
  });

  it('rejects a corrupted stored value and falls back to generating a fresh one', () => {
    const storage = fakeStorage({ 'vizoalica:anonymous:public-key': '<script>evil()</script>' });
    vi.stubGlobal('localStorage', storage);
    const id = resolveAnonymousId(config({ consentState: 'analytics-granted' }));
    expect(id).toMatch(/^anon_[A-Za-z0-9-]+$/);
    expect(id).not.toContain('<script>');
  });

  it('never persists to storage without explicit consent, using an ephemeral id instead', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    const first = resolveAnonymousId(config({ consentState: 'unknown' }));
    const second = resolveAnonymousId(config({ consentState: 'unknown' }));
    expect(storage.size).toBe(0);
    expect(first).not.toBe(second);
  });

  it('never persists when consentState is absent', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    resolveAnonymousId(config());
    expect(storage.size).toBe(0);
  });

  it('falls back to a safe ephemeral id when storage access throws (private browsing, quota, or no storage at all)', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('SecurityError');
      },
      setItem() {
        throw new Error('SecurityError');
      }
    });
    const id = resolveAnonymousId(config({ consentState: 'analytics-granted' }));
    expect(id).toMatch(/^anon_/);
  });

  it('falls back to a safe ephemeral id when localStorage does not exist at all', () => {
    vi.stubGlobal('localStorage', undefined);
    const id = resolveAnonymousId(config({ consentState: 'analytics-granted' }));
    expect(id).toMatch(/^anon_/);
  });
});
