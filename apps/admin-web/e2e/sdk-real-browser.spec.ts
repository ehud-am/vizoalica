import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * The built SDK bundle in a real browser, where keyboard activation, history navigation, and
 * fragment routes behave as they do for visitors (jsdom only approximates them). Needs
 * `pnpm browser-sdk:build`, which CI runs before the end-to-end tests.
 */
const bundlePath = resolve(process.cwd(), '../../packages/browser-sdk/dist/vizoalica.js');
if (!existsSync(bundlePath))
  throw new Error(
    'Build the SDK first: pnpm browser-sdk:build (this spec tests the built bundle).'
  );
const bundle = readFileSync(bundlePath, 'utf8');
const ORIGIN = 'http://sdk-test.example';
const INGEST = 'http://ingest.example/v1/events:batch';

const pageHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Shop</title>
<script async src="${ORIGIN}/vizoalica.js" data-endpoint="${INGEST}" data-source="src" data-project="proj"
  data-token-url="/token" data-consent="analytics-granted"></script></head>
<body>
  <nav>
    <a href="#/pricing">Pricing</a>
    <a href="#/orders/8841">First order</a>
    <a href="#/orders/8842">Second order</a>
    <button type="button" data-path="/docs">Docs</button>
    <button type="button" data-path="/docs/start">Start</button>
  </nav>
  <button type="button" data-vizoalica-action="Buy now">cart</button>
  <button type="button" data-vizoalica-ignore>Delete jane@example.com</button>
  <a href="https://other.example/pricing?utm=demo#top">Elsewhere</a>
  <input type="text" aria-label="Note">
  <script>
    document.querySelectorAll('button[data-path]').forEach((b) =>
      b.addEventListener('click', () => history.pushState({}, '', b.dataset.path)));
    document.querySelector('a[href^="https://other"]').addEventListener('click', (e) => e.preventDefault());
  </script>
</body></html>`;

type Sent = Array<Array<{ type: string; data: any }>>;

test('reports pages and actions from the built bundle in a real browser', async ({ page }) => {
  const posts: Sent = [];
  await page.route(`${ORIGIN}/vizoalica.js`, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: bundle })
  );
  await page.route(`${ORIGIN}/`, (route) =>
    route.fulfill({ contentType: 'text/html', body: pageHtml })
  );
  await page.route(INGEST, async (route) => {
    posts.push(JSON.parse(route.request().postData() ?? '[]'));
    await route.fulfill({ status: 202, body: '{}' });
  });
  await page.route(`${ORIGIN}/token`, (route) => route.fulfill({ status: 404, body: '' }));

  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => Boolean((window as any).vizoalica));
  const settle = () => page.waitForTimeout(250);
  await settle();

  await page.getByRole('link', { name: 'Pricing' }).click();
  await settle();
  await page.getByRole('link', { name: 'First order' }).click();
  await settle();
  await page.getByRole('link', { name: 'Second order' }).click();
  await settle();
  await page.getByRole('button', { name: 'Docs' }).click();
  await settle();
  await page.getByRole('button', { name: 'Start' }).click();
  await settle();
  // A real keyboard activation of a named control, then things that must not be recorded.
  await page.getByRole('button', { name: 'cart' }).focus();
  await page.keyboard.press('Enter');
  await settle();
  await page.getByRole('button', { name: 'Delete jane@example.com' }).click();
  await page.getByRole('textbox', { name: 'Note' }).fill('a private note');
  await page.getByRole('textbox', { name: 'Note' }).click();
  await page.getByRole('link', { name: 'Elsewhere' }).click();
  await settle();
  await page.goBack();
  await settle();

  const events = posts.flat();
  const views = events
    .filter((e) => e.type.endsWith('page_view.v1'))
    .map((e) => e.data.page.url_path);
  // Each screen once (the two orders are one page), and back returns to /docs.
  expect(views).toEqual(['/', '/#/pricing', '/#/orders/:id', '/docs', '/docs/start', '/docs']);

  const actions = events.filter((e) => e.type.endsWith('action.v1'));
  const names = actions.map((e) => e.data.action.name);
  expect(names).toEqual([
    'Pricing',
    'First order',
    'Second order',
    'Docs',
    'Start',
    'Buy now',
    'Elsewhere'
  ]);
  expect(actions.find((e) => e.data.action.name === 'Elsewhere')!.data.action).toEqual({
    name: 'Elsewhere',
    kind: 'link',
    destination: {
      url_origin: 'https://other.example',
      url_path: '/pricing'
    }
  });
  // Actions travel in their own requests, never mixed with page views.
  expect(
    posts.filter((batch) => new Set(batch.map((e) => e.type.endsWith('action.v1'))).size > 1)
  ).toEqual([]);
  // Nothing typed, ignored, or query-shaped was sent.
  const wire = JSON.stringify(posts);
  for (const secret of ['a private note', 'jane@example.com', 'utm=demo', '8841', '8842'])
    expect(wire, secret).not.toContain(secret);
});
