// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init, type VizoalicaClient } from '../src/index.js';
import { captureFetch, click, flushMicrotasks, mount, setUrl } from './support/page.js';

const endpoint = 'https://ingest.example/v1/events:batch';
let clients: VizoalicaClient[] = [];

function start(options: Partial<Parameters<typeof init>[0]> = {}) {
  const client = init({ endpoint, sourceKey: 'src_1', ...options });
  clients.push(client);
  return client;
}

beforeEach(() => {
  setUrl('/');
  mount('<button id="a">Go</button>');
});
afterEach(() => {
  for (const client of clients.splice(0)) client.stop();
  vi.unstubAllGlobals();
});

describe('batching of actions', () => {
  it('sends actions in their own request, separate from page views and custom events', async () => {
    const captured = captureFetch();
    const client = start({ autoPageView: false });
    client.track('signup_click');
    client.page();
    click(document.querySelector('#a')!);
    await flushMicrotasks();
    await client.flush();

    for (const request of captured.requests) {
      const kinds = new Set(
        request.events.map((event) => event.type === 'com.vizoalica.action.v1')
      );
      expect(kinds.size).toBe(1);
    }
    expect(captured.events('com.vizoalica.action.v1')).toHaveLength(1);
    expect(captured.events('com.vizoalica.page_view.v1')).toHaveLength(1);
    expect(captured.events('com.vizoalica.custom_event.v1')).toHaveLength(1);
  });

  it('keeps delivering page views when an older backend rejects action batches (version skew)', async () => {
    const captured = captureFetch((events) =>
      events.some((event) => event.type === 'com.vizoalica.action.v1') ? 400 : 202
    );
    const client = start({ autoPageView: false });
    click(document.querySelector('#a')!);
    client.page();
    await flushMicrotasks();
    await client.flush();
    await client.flush();

    expect(captured.events('com.vizoalica.page_view.v1')).toHaveLength(1);
    // The rejected action batch is dropped, not retried forever, and does not block the queue.
    expect(client.queuedEvents).toBe(0);
    const actionPosts = captured.requests.filter((request) =>
      request.events.some((event) => event.type === 'com.vizoalica.action.v1')
    );
    expect(actionPosts).toHaveLength(1);
  });

  it.each([400, 413])('drops a batch answered with %i instead of requeueing it', async (status) => {
    const captured = captureFetch(status);
    const client = start({ autoPageView: false });
    client.track('one');
    await client.flush();
    expect(client.queuedEvents).toBe(0);
    await client.flush();
    expect(captured.events('com.vizoalica.custom_event.v1')).toHaveLength(1);
  });

  it.each([429, 500, 503])('still requeues a batch answered with %i, as before', async (status) => {
    captureFetch(status);
    const client = start({ autoPageView: false, autoActions: false });
    // `track` flushes on its own; wait for that attempt, then check the event is still queued.
    client.track('one');
    await flushMicrotasks();
    expect(client.queuedEvents).toBe(1);
  });

  it('still requeues after a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );
    const client = start({ autoPageView: false, autoActions: false });
    client.track('one');
    await flushMicrotasks();
    expect(client.queuedEvents).toBe(1);
  });
});
