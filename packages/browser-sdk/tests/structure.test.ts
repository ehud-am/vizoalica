// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../src/index.js';
import { collectStructure, learnWindowOpen } from '../src/structure.js';
import { captureFetch, mount, setUrl } from './support/page.js';

const endpoint = 'https://ingest.example/v1/events:batch';
const PAGE = `
  <header><nav aria-label="Main"><a href="/pricing">Pricing</a><button aria-label="Open menu"></button></nav></header>
  <main>
    <h1>Plans and prices</h1><h2>Compare</h2>
    <button>Start free trial</button>
    <button id="icon"><svg></svg></button>
    <img src="x.png"><img src="y.png" alt="">
    <form aria-label="Contact">
      <label for="e">Work email</label><input id="e" type="email" value="jane@example.com" placeholder="you@corp.com">
      <label>Password <input type="password" value="hunter2"></label>
      <textarea aria-label="Message">secret text</textarea>
      <input type="hidden" name="csrf" value="tok">
    </form>
    <section data-vizoalica-ignore><h2>Welcome back, Jane</h2><button>Hidden</button></section>
  </main>
  <footer>Legal</footer>`;
const WINDOW = { start: '2026-12-01T00:00:00.000Z', end: '2026-12-15T00:00:00.000Z' };

beforeEach(() => {
  setUrl('/pricing');
  mount(PAGE);
  document.title = 'Pricing | Shop';
  document.documentElement.lang = 'en';
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('collectStructure', () => {
  it('describes landmarks, headings, controls and form fields, never values', () => {
    const structure = collectStructure(document);
    expect(structure).toMatchObject({ lang: 'en', title: 'Pricing | Shop' });
    expect(structure.headings).toEqual([
      { level: 1, text: 'Plans and prices' },
      { level: 2, text: 'Compare' }
    ]);
    expect(structure.landmarks).toEqual(
      expect.arrayContaining([{ role: 'navigation', label: 'Main' }, { role: 'main' }, { role: 'banner' }])
    );
    expect(structure.controls).toEqual(
      expect.arrayContaining([
        { role: 'button', name: 'Start free trial', landmark: 'main' },
        { role: 'button', landmark: 'main' },
        { role: 'link', name: 'Pricing', landmark: 'navigation' }
      ])
    );
    expect(structure.a11y).toMatchObject({ unlabeledControls: 1, imagesWithoutAlt: 1 });
    expect(structure.forms).toEqual([
      {
        name: 'Contact',
        fields: [{ type: 'email', label: 'Work email' }, { type: 'password' }, { type: 'textarea', label: 'Message' }]
      }
    ]);
    const text = JSON.stringify(structure);
    for (const secret of ['jane@example.com', 'you@corp.com', 'hunter2', 'secret text', 'Welcome back', 'Hidden', 'tok'])
      expect(text).not.toContain(secret);
  });
});

describe('learning window', () => {
  it('is open only inside the window and closed for anything unreadable', () => {
    const inside = Date.parse('2026-12-02T00:00:00Z');
    expect(learnWindowOpen(inside, WINDOW)).toBe(true);
    expect(learnWindowOpen(Date.parse('2026-11-30T23:59:59Z'), WINDOW)).toBe(false);
    expect(learnWindowOpen(Date.parse('2026-12-15T00:00:00Z'), WINDOW)).toBe(false);
    expect(learnWindowOpen(inside, undefined)).toBe(false);
    expect(learnWindowOpen(inside, { start: 'x', end: 'y' })).toBe(false);
  });

  async function run(learn: Parameters<typeof init>[0]['learn'], consentState?: 'analytics-denied') {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-02T10:00:00Z'));
    const captured = captureFetch();
    const client = init({ endpoint, sourceKey: 'k', ...(consentState ? { consentState } : {}), learn });
    await vi.advanceTimersByTimeAsync(2000);
    const types = captured.events().map((event) => event.type);
    client.stop();
    return types;
  }

  it('sends one structure event for a sampled page load inside the window', async () => {
    const types = await run({ window: WINDOW, sampleRate: 1 });
    expect(types.filter((type) => type === 'com.vizoalica.page_structure.v1')).toHaveLength(1);
  });

  it('sends nothing without a window, outside it, unsampled, or with consent denied', async () => {
    const none = 'com.vizoalica.page_structure.v1';
    expect(await run(undefined)).not.toContain(none);
    expect(await run({ window: { start: '2026-01-01T00:00:00Z', end: '2026-01-10T00:00:00Z' }, sampleRate: 1 })).not.toContain(none);
    expect(await run({ window: WINDOW, sampleRate: 0 })).not.toContain(none);
    expect(await run({ window: WINDOW, sampleRate: 1 }, 'analytics-denied')).not.toContain(none);
  });
});
