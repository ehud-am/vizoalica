import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

describe('standalone website bundle', () => {
  it('builds an IIFE that reads its script attributes and sends a signed page view', async () => {
    execFileSync(process.execPath, ['scripts/build-browser-sdk.mjs'], { cwd: process.cwd() });
    const source = readFileSync('packages/browser-sdk/dist/vizoalica.js', 'utf8');
    const dom = new JSDOM('<!doctype html><title>Test</title>', {
      url: 'https://site.test/',
      runScripts: 'dangerously'
    });
    const fetch = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? new Response(null, { status: 202 }) : new Response('test.jwt.token')
    );
    dom.window.fetch = fetch;
    const script = dom.window.document.createElement('script');
    Object.assign(script.dataset, {
      endpoint: 'https://worker.test/v1/events:batch',
      source: 'public-key',
      project: 'project-1',
      tokenUrl: '/vizoalica/ingest-token',
      consent: 'analytics-granted'
    });
    script.textContent = source;
    dom.window.document.head.append(script);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls[0]?.[0]).toBe('/vizoalica/ingest-token');
    const [endpoint, init] = fetch.mock.calls[1]!;
    expect(endpoint).toBe('https://worker.test/v1/events:batch');
    expect(init?.headers).toMatchObject({
      'x-vizoalica-source': 'public-key',
      authorization: 'Bearer test.jwt.token'
    });
    expect(JSON.parse(String(init?.body))).toHaveLength(1);
    expect((dom.window as unknown as { vizoalica: unknown }).vizoalica).toBeTruthy();
    dom.window.close();
  });

  it('demo waits for consent and Decline never loads the SDK', () => {
    const html = readFileSync('examples/cloudflare-pages/public/index.html', 'utf8');
    const declined = new JSDOM(html, { url: 'https://site.test', runScripts: 'dangerously' });
    expect(declined.window.document.getElementById('vizoalica-sdk')).toBeNull();
    declined.window.document.getElementById('decline')!.click();
    expect(declined.window.document.getElementById('vizoalica-sdk')).toBeNull();
    const allowed = new JSDOM(html, { url: 'https://site.test', runScripts: 'dangerously' });
    allowed.window.document.getElementById('allow')!.click();
    const script = allowed.window.document.getElementById('vizoalica-sdk') as HTMLScriptElement;
    expect(script.dataset.consent).toBe('analytics-granted');
    expect(script.src).toBe('https://site.test/vizoalica.js');
    declined.window.close();
    allowed.window.close();
  });
});
