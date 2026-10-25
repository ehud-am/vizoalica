// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../src/index.js';
import { landingCampaign } from '../src/privacy.js';
import { captureFetch, flushMicrotasks, setUrl } from './support/page.js';

const endpoint = 'https://ingest.example/v1/events:batch';
const PAGE_VIEW = 'com.vizoalica.page_view.v1';
let stops: Array<() => void> = [];

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.unstubAllGlobals();
  setUrl('/');
});

function start(options: Record<string, unknown> = {}) {
  const captured = captureFetch();
  const client = init({ endpoint, sourceKey: 'src_1', autoActions: false, ...options });
  stops.push(() => client.stop());
  return { captured, client };
}

describe('campaign labels on the landing page view', () => {
  it('sends the cleaned UTM labels and no other query value', async () => {
    setUrl(
      '/?utm_source=Newsletter&utm_medium=email&utm_campaign=Spring-Sale&utm_term=shoes&token=secret-value&email=a@b.co'
    );
    const { captured, client } = start();
    await client.flush();
    const [view] = captured.events(PAGE_VIEW);
    expect(view?.data.campaign).toEqual({
      source: 'newsletter',
      medium: 'email',
      campaign: 'spring-sale'
    });
    const body = JSON.stringify(captured.requests);
    for (const secret of ['shoes', 'secret-value', 'a@b.co', 'utm_term', 'token']) {
      expect(body).not.toContain(secret);
    }
  });

  it('cleans hostile values in the browser', async () => {
    setUrl('/?utm_source=jane@example.com&utm_campaign=%3Cscript%3E4111111111111111');
    const { captured, client } = start();
    await client.flush();
    expect(captured.events(PAGE_VIEW)[0]?.data.campaign).toEqual({
      source: '[email]',
      campaign: 'script[number]'
    });
  });

  it('sends no campaign without UTM parameters, or when none survives cleaning', async () => {
    setUrl('/?ref=friend&utm_source=%3C%3E');
    const { captured, client } = start();
    await client.flush();
    expect(captured.events(PAGE_VIEW)[0]?.data).not.toHaveProperty('campaign');
  });

  it('counts one campaign view across many route changes', async () => {
    setUrl('/?utm_source=twitter&utm_medium=social');
    const { captured, client } = start();
    await client.flush();
    for (let index = 0; index < 50; index += 1) {
      history.pushState({}, '', `/page-${index}`);
      await flushMicrotasks();
    }
    client.page();
    await client.flush();
    const views = captured.events(PAGE_VIEW);
    expect(views.length).toBeGreaterThan(50);
    expect(views.filter((view) => view.data.campaign)).toHaveLength(1);
    expect(views[0]?.data.campaign).toEqual({ source: 'twitter', medium: 'social' });
  });

  it('attaches the campaign to the first manual page view when autoPageView is off', async () => {
    setUrl('/?utm_source=push');
    const { captured, client } = start({ autoPageView: false });
    setUrl('/elsewhere');
    client.page();
    client.page();
    await client.flush();
    const views = captured.events(PAGE_VIEW);
    expect(views.map((view) => view.data.campaign)).toEqual([{ source: 'push' }, undefined]);
  });

  it('never throws on an unreadable address', () => {
    expect(landingCampaign({ href: 'not a url' })).toBeUndefined();
  });
});
