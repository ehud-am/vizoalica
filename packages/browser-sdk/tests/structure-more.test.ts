// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { collectStructure, learnWindowOpen } from '../src/structure.js';
import { mount } from './support/page.js';

beforeEach(() => {
  document.title = '';
  document.documentElement.removeAttribute('lang');
});

describe('collectStructure: edge shapes', () => {
  it('caps lists, skips ignored areas, and handles landmarks and field types', () => {
    mount(`
      <div role="banner"></div><div role="made-up"></div>
      <header><p>x</p></header>
      <article><header>inner</header><footer>inner</footer></article>
      <section aria-label="Offers"></section><section></section>
      <form aria-labelledby="t1 t2"><span id="t1">Sign</span><span id="t2">up</span>
        <select><option>a</option></select>
        <input type="submit"><input autocomplete="cc-number" value="4111">
        <input aria-label="Nickname"><label>Wrapped <input type="text"></label>
        <input type="checkbox">
      </form>
      <form data-vizoalica-ignore><input></form>
      ${Array.from({ length: 12 }, (_, i) => `<h2>H${i}</h2>`).join('')}
      ${Array.from({ length: 14 }, (_, i) => `<nav aria-label="N${i}"></nav>`).join('')}
      ${Array.from({ length: 30 }, (_, i) => `<button>B${i}</button>`).join('')}
      ${Array.from({ length: 6 }, () => '<form><input></form>').join('')}
      ${Array.from({ length: 12 }, () => '<form id="many"><input><input><input><input><input><input><input><input><input><input></form>').join('')}
    `);
    const s = collectStructure(document);
    expect(s.headings).toHaveLength(9);
    expect(s.landmarks).toHaveLength(12);
    expect(s.controls).toHaveLength(25);
    expect(s.forms).toHaveLength(4);
    expect(s.a11y!.controls).toBeGreaterThan(25);
    const first = s.forms![0]!;
    expect(first.name).toBe('Sign up');
    expect(first.fields).toEqual(
      expect.arrayContaining([
        { type: 'select' },
        { type: 'text', label: 'Nickname' },
        { type: 'text', label: 'Wrapped' },
        { type: 'checkbox' }
      ])
    );
    expect(JSON.stringify(s)).not.toContain('4111');
  });

  it('returns only what exists on an empty page', () => {
    mount('');
    const s = collectStructure(document);
    expect(s.title).toBeUndefined();
    expect(s.forms).toBeUndefined();
    expect(s.a11y).toEqual({ controls: 0, unlabeledControls: 0, imagesWithoutAlt: 0 });
  });
});

describe('data-vizoalica-ignore inside what is described', () => {
  it('leaves out ignored descendants and ignored label targets', () => {
    mount(`
      <h1>Welcome, <span data-vizoalica-ignore>Jane Doe</span></h1>
      <button>Account <span data-vizoalica-ignore>jdoe99</span></button>
      <button><img alt="Avatar of Jane" src="a.png" data-vizoalica-ignore><img alt="Menu" src="m.png"></button>
      <div data-vizoalica-ignore><span id="who">Jane Doe</span><label for="n">Jane label</label></div>
      <form aria-labelledby="who"><input id="n" type="text">
        <label>Visible <span data-vizoalica-ignore>secret</span><input type="text"></label>
      </form>
    `);
    const text = JSON.stringify(collectStructure(document));
    expect(text).not.toMatch(/Jane|jdoe99|secret/);
    expect(text).toContain('Welcome');
    expect(text).toContain('Account');
    expect(text).toContain('Visible');
    expect(text).toContain('Menu');
  });
});

describe('learnWindowOpen', () => {
  const now = Date.parse('2026-12-05T00:00:00Z');
  it('is open only inside a readable window', () => {
    const w = { start: '2026-12-01T00:00:00Z', end: '2026-12-10T00:00:00Z' };
    expect(learnWindowOpen(now, w)).toBe(true);
    expect(learnWindowOpen(Date.parse('2026-12-10T00:00:00Z'), w)).toBe(false);
    expect(learnWindowOpen(now, undefined)).toBe(false);
    expect(learnWindowOpen(now, { start: 1, end: 2 })).toBe(false);
    expect(learnWindowOpen(now, { start: 'x', end: 'y' })).toBe(false);
    expect(learnWindowOpen(now)).toBe(false);
  });
});
