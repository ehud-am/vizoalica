// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../src/index.js';
import { IGNORE_KEY, IGNORE_PARAM, resolveIgnore } from '../src/ignore.js';
import { initializeDynamicLoader } from '../src/dynamic-config.js';
import { captureFetch, flushMicrotasks, setUrl } from './support/page.js';

const endpoint = 'https://ingest.example/v1/events:batch';
let stops: Array<() => void> = [];

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  setUrl('/');
});
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function start() {
  const captured = captureFetch();
  const client = init({ endpoint, sourceKey: 'src_1' });
  stops.push(() => client.stop());
  return { captured, client };
}

describe('browser opt-out', () => {
  it('turns Vizoalica off for this load and remembers it', async () => {
    setUrl(`/?${IGNORE_PARAM}=1`);
    const { captured, client } = start();
    client.track('signup');
    client.page();
    history.pushState({}, '', '/elsewhere');
    document.body.innerHTML = '<button>Buy</button>';
    document.querySelector('button')!.click();
    await flushMicrotasks();
    await client.flush();
    expect(captured.mock).not.toHaveBeenCalled();
    expect(client.queuedEvents).toBe(0);
    expect(localStorage.getItem(IGNORE_KEY)).toBe('1');
  });

  it('stays off on later loads without the parameter, and on other pages', async () => {
    localStorage.setItem(IGNORE_KEY, '1');
    setUrl('/pricing');
    const { captured, client } = start();
    client.track('signup');
    await client.flush();
    expect(captured.mock).not.toHaveBeenCalled();
  });

  it.each(['0', 'false'])('turns it back on with %s', async (value) => {
    localStorage.setItem(IGNORE_KEY, '1');
    setUrl(`/?${IGNORE_PARAM}=${value}`);
    const { captured, client } = start();
    await client.flush();
    expect(localStorage.getItem(IGNORE_KEY)).toBeNull();
    expect(captured.events('com.vizoalica.page_view.v1')).toHaveLength(1);
  });

  it.each(['', 'yes', '2', 'TRUE', 'on'])('ignores the other value %j', async (value) => {
    setUrl(`/?${IGNORE_PARAM}=${value}`);
    const { captured, client } = start();
    await client.flush();
    expect(localStorage.getItem(IGNORE_KEY)).toBeNull();
    expect(captured.events('com.vizoalica.page_view.v1')).toHaveLength(1);
  });

  it('stores only the constant 1, and reads nothing else from the address', () => {
    setUrl(`/?${IGNORE_PARAM}=1&email=a@b.co`);
    resolveIgnore();
    expect(Object.keys(localStorage)).toEqual([IGNORE_KEY]);
    expect(localStorage.getItem(IGNORE_KEY)).toBe('1');
  });

  it('works without any parameter or storage value', async () => {
    const { captured, client } = start();
    await client.flush();
    expect(captured.events('com.vizoalica.page_view.v1')).toHaveLength(1);
  });

  it('is per browser: only the exact stored value counts', () => {
    localStorage.setItem(IGNORE_KEY, 'true');
    expect(resolveIgnore()).toBe(false);
  });
});

describe('resolveIgnore with unusable storage', () => {
  const throwing = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    }
  };

  it('is silent for a load that asks for it, and otherwise counts as not opted out', () => {
    expect(resolveIgnore({ href: `https://x.test/?${IGNORE_PARAM}=1` }, throwing)).toBe(true);
    expect(resolveIgnore({ href: `https://x.test/?${IGNORE_PARAM}=0` }, throwing)).toBe(false);
    expect(resolveIgnore({ href: 'https://x.test/' }, throwing)).toBe(false);
  });

  it('works with no storage at all, and never throws on an unreadable address', () => {
    expect(resolveIgnore({ href: `https://x.test/?${IGNORE_PARAM}=1` }, null)).toBe(true);
    expect(resolveIgnore({ href: 'https://x.test/' }, null)).toBe(false);
    expect(resolveIgnore({ href: 'not a url' }, null)).toBe(false);
    expect(resolveIgnore(undefined as never, null)).toBe(false);
  });

  it('survives a window whose localStorage property throws', () => {
    vi.stubGlobal('localStorage', undefined);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      }
    });
    try {
      expect(resolveIgnore({ href: 'https://x.test/' })).toBe(false);
      expect(resolveIgnore({ href: `https://x.test/?${IGNORE_PARAM}=1` })).toBe(true);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});

describe('dynamic loader', () => {
  it('does not fetch the site configuration in an opted-out browser', async () => {
    localStorage.setItem(IGNORE_KEY, '1');
    const fetcher = vi.fn();
    const started = await initializeDynamicLoader(
      window as never,
      document,
      fetcher as unknown as typeof fetch
    );
    expect(started).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
