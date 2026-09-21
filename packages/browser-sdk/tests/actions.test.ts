// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchActions, type ActionObservation } from '../src/actions.js';
import { init } from '../src/index.js';
import { currentPageKey } from '../src/privacy.js';
import {
  captureFetch,
  click,
  flushMicrotasks,
  keyboardActivate,
  mount,
  setUrl
} from './support/page.js';

const endpoint = 'https://ingest.example/v1/events:batch';
let stops: Array<() => void> = [];
let seen: ActionObservation[] = [];
let clock = 0;

function watch() {
  const stop = watchActions((action) => seen.push(action), {
    currentPage: currentPageKey,
    now: () => clock
  });
  stops.push(stop);
}
const $ = (selector: string) => document.querySelector(selector)!;

beforeEach(() => {
  setUrl('/');
  seen = [];
  clock = 1_000_000;
  mount('');
});
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.unstubAllGlobals();
});

describe('what counts as an action', () => {
  it.each([
    ['<button id="c">Save</button>', 'button', 'Save'],
    ['<a id="c" href="/pricing">Pricing</a>', 'link', 'Pricing'],
    ['<input id="c" type="button" value="Go">', 'button', 'Go'],
    ['<input id="c" type="submit" value="Send">', 'button', 'Send'],
    ['<input id="c" type="reset" value="Clear">', 'button', 'Clear'],
    ['<input id="c" type="image" alt="Search" value="">', 'button', 'Unlabeled button'],
    ['<div id="c" role="button">Menu toggle</div>', 'button', 'Menu toggle'],
    ['<span id="c" role="link">Docs</span>', 'link', 'Docs'],
    ['<li id="c" role="menuitem">Settings</li>', 'other', 'Settings'],
    ['<div id="c" role="tab">Billing</div>', 'other', 'Billing']
  ])('records a click on %s', (html, kind, name) => {
    mount(html);
    watch();
    click($('#c'));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind, name, page: '/' });
  });

  it('resolves a click on a child to the control', () => {
    mount('<button id="c"><span id="inner">Buy <b>now</b></span></button>');
    watch();
    click($('#inner'));
    expect(seen).toEqual([{ kind: 'button', name: 'Buy now', page: '/' }]);
  });

  it('records keyboard activation (a click with detail 0) once', () => {
    mount('<button id="c">Save</button><a id="l" href="/x">Go</a>');
    watch();
    keyboardActivate($('#c'));
    keyboardActivate($('#l'));
    expect(seen.map((action) => action.name)).toEqual(['Save', 'Go']);
  });

  it('prefers the ARIA role over the tag for the kind', () => {
    mount('<a id="c" role="button" href="/x">Act</a>');
    watch();
    click($('#c'));
    expect(seen[0]!.kind).toBe('button');
  });

  it.each([
    '<input id="c" type="text" value="secret typed text">',
    '<input id="c" value="no type attribute">',
    '<input id="c" type="password" value="hunter2">',
    '<input id="c" type="text" autocomplete="cc-number" value="4111111111111111">',
    '<input id="c" type="text" autocomplete="one-time-code" value="123456">',
    '<textarea id="c">private notes</textarea>',
    '<select id="c"><option>One</option></select>',
    '<div id="c" contenteditable="true">editable</div>',
    '<p id="c">plain text</p>',
    '<img id="c" alt="picture" src="data:,">',
    '<div id="c">empty space</div>',
    '<div role="button"><input id="c" type="password" value="hunter2"></div>'
  ])('records nothing for %s', (html) => {
    mount(html);
    watch();
    click($('#c'));
    expect(seen).toEqual([]);
  });
});

describe('naming', () => {
  it('uses aria-label, then text, then title, then the image alt, then a fallback', () => {
    mount(`
      <button id="a" aria-label="Close dialog">X</button>
      <button id="b">   Save   changes </button>
      <button id="c" title="Refresh"></button>
      <button id="d"><img alt="Cart" src="data:,"></button>
      <button id="e"></button>
      <a id="f" href="/x"></a>
      <div id="g" role="tab"></div>`);
    watch();
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      clock += 1000;
      click($(`#${id}`));
    }
    expect(seen.map((action) => action.name)).toEqual([
      'Close dialog',
      'Save changes',
      'Refresh',
      'Cart',
      'Unlabeled button',
      'Unlabeled link',
      'Unlabeled control'
    ]);
  });

  it('redacts and shortens the name', () => {
    mount(
      `<button id="a">Delete jane@example.com</button><button id="b">${'w'.repeat(300)}</button>`
    );
    watch();
    click($('#a'));
    clock += 1000;
    click($('#b'));
    expect(seen[0]!.name).toBe('Delete [email]');
    expect(seen[1]!.name).toHaveLength(80);
  });

  it('never reads a field value: a submit button is named by its own label only', () => {
    mount(
      '<form><input id="f" type="text" value="hunter2"><button id="c" type="submit">Sign in</button></form>'
    );
    watch();
    click($('#c'));
    expect(JSON.stringify(seen)).not.toContain('hunter2');
    expect(seen[0]!.name).toBe('Sign in');
  });
});

describe('markings', () => {
  it('uses data-vizoalica-action first, and falls through when it is empty', () => {
    mount(`
      <button id="a" data-vizoalica-action="Buy now" aria-label="Cart">🛒</button>
      <button id="b" data-vizoalica-action="  " aria-label="Cart">🛒</button>
      <button id="c" data-vizoalica-action="Email jane@example.com">x</button>`);
    watch();
    for (const id of ['a', 'b', 'c']) {
      clock += 1000;
      click($(`#${id}`));
    }
    expect(seen.map((action) => action.name)).toEqual(['Buy now', 'Cart', 'Email [email]']);
  });

  it('records nothing for data-vizoalica-ignore on the control or on any ancestor', () => {
    mount(`
      <button id="a" data-vizoalica-ignore>Delete</button>
      <section data-vizoalica-ignore><div><button id="b">Inner</button><a id="c" href="/x">Link</a></div></section>
      <button id="d" data-vizoalica-ignore data-vizoalica-action="Named but ignored">x</button>`);
    watch();
    for (const id of ['a', 'b', 'c', 'd']) click($(`#${id}`));
    expect(seen).toEqual([]);
  });

  it('reads markings at click time, so an attribute added later is honored', () => {
    mount('<button id="a">Save</button>');
    watch();
    click($('#a'));
    $('#a').setAttribute('data-vizoalica-ignore', '');
    clock += 1000;
    click($('#a'));
    expect(seen).toHaveLength(1);
  });
});

describe('link destinations', () => {
  it('records origin and the grouped path, never the query or a plain fragment', () => {
    mount(`
      <a id="a" href="https://app.example.com/orders/8841?token=secret#top">Order</a>
      <a id="b" href="/pricing?utm=x">Pricing</a>
      <a id="c" href="#/plans/12">Plans</a>`);
    watch();
    for (const id of ['a', 'b', 'c']) click($(`#${id}`));
    expect(seen.map((action) => action.destination)).toEqual([
      { url_origin: 'https://app.example.com', url_path: '/orders/:id' },
      { url_origin: location.origin, url_path: '/pricing' },
      { url_origin: location.origin, url_path: '/#/plans/:id' }
    ]);
    expect(JSON.stringify(seen)).not.toContain('secret');
  });

  it('records no destination for mailto, tel, or javascript links, and none for buttons', () => {
    mount(`
      <a id="a" href="mailto:jane@example.com">Mail</a>
      <a id="b" href="tel:+15551234567">Call</a>
      <a id="c" href="javascript:void(0)">Script</a>
      <button id="d">Plain</button>`);
    watch();
    for (const id of ['a', 'b', 'c', 'd']) click($(`#${id}`));
    expect(seen.every((action) => action.destination === undefined)).toBe(true);
    expect(JSON.stringify(seen)).not.toContain('jane@example.com');
    expect(JSON.stringify(seen)).not.toContain('5551234567');
  });
});

describe('page attribution', () => {
  it('records the page key at click time', () => {
    mount('<button id="a">Go</button>');
    watch();
    setUrl('/orders/8841#/items/3');
    click($('#a'));
    expect(seen[0]!.page).toBe('/orders/:id#/items/:id');
    setUrl('/app#/orders/9');
    clock += 1000;
    click($('#a'));
    expect(seen[1]!.page).toBe('/app#/orders/:id');
  });
});

describe('duplicate suppression and rate cap', () => {
  it('counts a repeat within 500 ms once, and one after the window again', () => {
    mount('<button id="a">Go</button><button id="b">Other</button>');
    watch();
    click($('#a'));
    clock += 200;
    click($('#a'));
    clock += 200;
    click($('#b'));
    expect(seen.map((action) => action.name)).toEqual(['Go', 'Other']);
    clock += 600;
    click($('#a'));
    expect(seen).toHaveLength(3);
  });

  it('stops after 100 actions in a rolling minute and resumes when the minute passes', () => {
    mount('<button id="a">Go</button>');
    watch();
    for (let index = 0; index < 150; index += 1) {
      clock += 501;
      if (index < 119) click($('#a'));
    }
    expect(seen.length).toBe(100);
    clock += 60_000;
    click($('#a'));
    expect(seen.length).toBe(101);
  });
});

describe('safety', () => {
  it('never calls preventDefault or stopPropagation', () => {
    mount('<button id="a">Go</button>');
    watch();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const prevent = vi.spyOn(event, 'preventDefault');
    const stop = vi.spyOn(event, 'stopPropagation');
    $('#a').dispatchEvent(event);
    expect(prevent).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('is a passive listener, and never throws into the page when its own work fails', () => {
    mount('<button id="a">Go</button>');
    const add = vi.spyOn(document, 'addEventListener');
    const stop = watchActions(
      () => {
        throw new Error('consumer failed');
      },
      { currentPage: currentPageKey }
    );
    stops.push(stop);
    expect(add).toHaveBeenCalledWith('click', expect.any(Function), {
      capture: true,
      passive: true
    });
    expect(() => click($('#a'))).not.toThrow();

    const button = $('#a');
    Object.defineProperty(button, 'textContent', {
      get() {
        throw new Error('hostile getter');
      }
    });
    expect(() => click(button)).not.toThrow();
  });

  it('handles a very large label well inside the 50 ms budget', () => {
    mount(`<button id="a">${'word '.repeat(50_000)}</button>`);
    watch();
    const start = performance.now();
    click($('#a'));
    expect(performance.now() - start).toBeLessThan(50);
    expect(seen[0]!.name.length).toBeLessThanOrEqual(80);
  });

  it('does nothing without a document, and stop() removes the listener', () => {
    mount('<button id="a">Go</button>');
    watch();
    stops.pop()!();
    click($('#a'));
    expect(seen).toEqual([]);
    vi.stubGlobal('document', undefined);
    expect(() => watchActions(() => {}, { currentPage: currentPageKey })()).not.toThrow();
  });

  it('ignores clicks whose target is missing or not an element', () => {
    watch();
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const text = document.createTextNode('text');
    document.body.append(text);
    text.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(seen).toEqual([]);
  });
});

describe('client integration', () => {
  it('turns clicks into action events with the same envelope as page views', async () => {
    const captured = captureFetch();
    mount('<a id="a" href="https://app.example.com/signup">Start free trial</a>');
    const client = init({
      endpoint,
      sourceKey: 'src_1',
      projectId: 'proj_1',
      consentState: 'analytics-granted',
      autoPageView: false
    });
    stops.push(() => client.stop());
    click($('#a'));
    await flushMicrotasks();
    await client.flush();
    const [event] = captured.events('com.vizoalica.action.v1');
    expect(event).toMatchObject({
      type: 'com.vizoalica.action.v1',
      vizoalicaconsent: 'analytics-granted',
      vizoalicaproject: 'proj_1',
      data: {
        page: { url_origin: location.origin, url_path: '/' },
        action: {
          name: 'Start free trial',
          kind: 'link',
          destination: { url_origin: 'https://app.example.com', url_path: '/signup' }
        },
        visitor: { anonymous_id: expect.any(String) },
        session: { id: expect.any(String) }
      }
    });
  });

  it('records nothing when consent is explicitly denied, or when actions are switched off', async () => {
    const captured = captureFetch();
    mount('<button id="a">Go</button>');
    const denied = init({
      endpoint,
      sourceKey: 'src_1',
      consentState: 'analytics-denied',
      autoPageView: false
    });
    const off = init({ endpoint, sourceKey: 'src_1', autoPageView: false, autoActions: false });
    stops.push(
      () => denied.stop(),
      () => off.stop()
    );
    click($('#a'));
    await flushMicrotasks();
    await denied.flush();
    await off.flush();
    expect(captured.events()).toEqual([]);
  });
});
