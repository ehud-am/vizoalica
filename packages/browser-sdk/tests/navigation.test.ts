// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../src/index.js';
import { currentPageKey } from '../src/privacy.js';
import { watchNavigation } from '../src/navigation.js';
import { captureFetch, flushMicrotasks, setUrl } from './support/page.js';

const endpoint = 'https://ingest.example/v1/events:batch';
let stops: Array<() => void> = [];

beforeEach(() => {
  setUrl('/');
  document.body.innerHTML = '';
});
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.unstubAllGlobals();
});

function watch(onNavigate: () => void) {
  const stop = watchNavigation(onNavigate, currentPageKey);
  stops.push(stop);
  return stop;
}

describe('in-page navigation', () => {
  it('reports pushState, popstate, and hashchange only when the page key changes', async () => {
    const seen: string[] = [];
    watch(() => seen.push(currentPageKey()));

    history.pushState({}, '', '/pricing');
    await flushMicrotasks();
    history.pushState({}, '', '/pricing#/plans');
    await flushMicrotasks();
    setUrl('/pricing#/enterprise');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flushMicrotasks();
    // Back and forward change the address, then fire popstate.
    setUrl('/pricing');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flushMicrotasks();

    expect(seen).toEqual(['/pricing', '/pricing#/plans', '/pricing#/enterprise', '/pricing']);
  });

  it('does not count the initial load, query-only changes, or the same page twice', async () => {
    const onNavigate = vi.fn();
    watch(onNavigate);

    // The page key ignores the query, so tidying it with replaceState is not a new page.
    history.replaceState({}, '', '/?tab=1');
    await flushMicrotasks();
    history.pushState({}, '', '/?tab=2');
    await flushMicrotasks();
    expect(onNavigate).not.toHaveBeenCalled();

    history.pushState({}, '', '/other');
    history.pushState({}, '', '/other#anchor');
    await flushMicrotasks();
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('counts a replaceState redirect to a different page once, and not again when pushed', async () => {
    const keys: string[] = [];
    watch(() => keys.push(currentPageKey()));
    history.replaceState({}, '', '/dashboard');
    await flushMicrotasks();
    history.pushState({}, '', '/dashboard');
    await flushMicrotasks();
    expect(keys).toEqual(['/dashboard']);
  });

  it('counts one view per hashchange plus popstate pair for the same fragment navigation', async () => {
    const onNavigate = vi.fn();
    watch(onNavigate);
    setUrl('/#/a');
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flushMicrotasks();
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('counts a return to an earlier page again: A, B, A is two views of A', async () => {
    const keys: string[] = [];
    watch(() => keys.push(currentPageKey()));
    history.pushState({}, '', '/b');
    await flushMicrotasks();
    history.pushState({}, '', '/');
    await flushMicrotasks();
    expect(keys).toEqual(['/b', '/']);
  });

  it('calls the original pushState first, returns its result, and survives a throwing listener', async () => {
    const original = history.pushState;
    const spy = vi.fn(function (this: History, ...args: Parameters<History['pushState']>) {
      return original.apply(this, args);
    });
    history.pushState = spy;
    const stop = watchNavigation(() => {
      throw new Error('listener failed');
    }, currentPageKey);
    stops.push(() => {
      stop();
      history.pushState = original;
    });

    expect(() => history.pushState({}, '', '/x')).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
    await expect(flushMicrotasks()).resolves.toBeUndefined();
  });

  it('restores the history methods when stopped and does nothing without a window or history', () => {
    const before = [history.pushState, history.replaceState];
    const stop = watchNavigation(() => {}, currentPageKey);
    expect(history.pushState).not.toBe(before[0]);
    stop();
    expect([history.pushState, history.replaceState]).toEqual(before);

    vi.stubGlobal('history', undefined);
    expect(() => watchNavigation(() => {}, currentPageKey)()).not.toThrow();
  });
});

describe('client page views for navigation', () => {
  it('sends a page view on load and one per in-page navigation, each with its page key', async () => {
    const captured = captureFetch();
    const client = init({ endpoint, sourceKey: 'src_1', autoActions: false });
    stops.push(() => client.stop());
    await client.flush();

    history.pushState({}, '', '/#/pricing');
    await flushMicrotasks();
    history.pushState({}, '', '/orders/8841');
    await flushMicrotasks();
    await client.flush();

    const paths = captured.events('com.vizoalica.page_view.v1').map((e) => e.data.page.url_path);
    expect(paths).toEqual(['/', '/#/pricing', '/orders/:id']);
    expect(JSON.stringify(captured.requests)).not.toContain('8841');
  });

  it('does not report in-page views when consent is explicitly denied', async () => {
    const captured = captureFetch();
    const client = init({
      endpoint,
      sourceKey: 'src_1',
      consentState: 'analytics-denied',
      autoActions: false
    });
    stops.push(() => client.stop());
    await client.flush();
    history.pushState({}, '', '/pricing');
    await flushMicrotasks();
    await client.flush();
    // The initial page view keeps today's behavior; only the new navigation views stop.
    expect(captured.events('com.vizoalica.page_view.v1')).toHaveLength(1);
  });

  it('follows autoPageView when autoNavigation is not set', async () => {
    const captured = captureFetch();
    const client = init({ endpoint, sourceKey: 'src_1', autoPageView: false, autoActions: false });
    stops.push(() => client.stop());
    history.pushState({}, '', '/pricing');
    await flushMicrotasks();
    await client.flush();
    expect(captured.events()).toHaveLength(0);
  });

  it('can be switched off, and stop() ends observation', async () => {
    const captured = captureFetch();
    const off = init({
      endpoint,
      sourceKey: 'src_1',
      autoNavigation: false,
      autoActions: false
    });
    history.pushState({}, '', '/one');
    await flushMicrotasks();
    await off.flush();
    expect(captured.events('com.vizoalica.page_view.v1')).toHaveLength(1);

    const on = init({ endpoint, sourceKey: 'src_1', autoActions: false });
    on.stop();
    history.pushState({}, '', '/two');
    await flushMicrotasks();
    await on.flush();
    expect(captured.events('com.vizoalica.page_view.v1')).toHaveLength(2);
  });
});
