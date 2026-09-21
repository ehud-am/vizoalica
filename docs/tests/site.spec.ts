import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The built site, served with its real response headers (see tests/serve-dist.mjs).
const ORIGIN = 'http://127.0.0.1:4321';

const PAGES = [
  '/',
  '/get-started',
  '/tour',
  '/operations/cloudflare',
  '/operations/pages',
  '/operations/privacy',
  '/operations/docs-site',
  '/privacy/audience-attributes-review',
  '/privacy/action-collection-review',
  '/brand',
  '/releases/v0.6.2',
  '/releases/v0.6.1',
  '/releases/v0.6.0',
  '/releases/v0.5.3',
  '/v0.1.0-architecture-discussion'
];

const seriousOrWorse = (results: Awaited<ReturnType<AxeBuilder['analyze']>>) =>
  results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''));

async function collectProblems(page: Page) {
  const outside: string[] = [];
  const failed: string[] = [];
  const csp: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(ORIGIN) && !url.startsWith('data:') && !url.startsWith('blob:'))
      outside.push(url);
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText;
    // The browser cancels a video download when the page is left before it finishes. That is not a
    // failure to load anything.
    if (request.resourceType() === 'media' && reason === 'net::ERR_ABORTED') return;
    failed.push(`${request.url()} ${reason}`);
  });
  page.on('console', (message) => {
    if (/content security policy|refused to (load|execute|apply)/i.test(message.text()))
      csp.push(message.text());
  });
  return { outside, failed, csp };
}

test('every page loads with a title, a description, a canonical link, and one main heading', async ({
  page
}) => {
  for (const path of PAGES) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator('h1').first(), path).toBeVisible();
    expect(await page.title(), path).not.toBe('');
    await expect(page.locator('meta[name="description"]'), path).toHaveAttribute(
      'content',
      /.{40,}/
    );
    await expect(page.locator('link[rel="canonical"]'), path).toHaveAttribute(
      'href',
      /^https:\/\/vizoalica\.dev/
    );
  }
  const missing = await page.goto('/no-such-page');
  expect(missing?.status()).toBe(404);
});

// One test per colour scheme, each with room for a slower CI runner: axe scans every page.
for (const scheme of ['light', 'dark'] as const) {
  test(`has no serious accessibility findings on any page (${scheme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      expect(seriousOrWorse(await new AxeBuilder({ page }).analyze()), `${scheme} ${path}`).toEqual(
        []
      );
    }
  });
}

test('loads nothing from another origin, and the Content-Security-Policy blocks nothing it needs', async ({
  page
}) => {
  const problems = await collectProblems(page);
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  expect(problems.outside).toEqual([]);
  expect(problems.failed).toEqual([]);
  expect(problems.csp).toEqual([]);
});

test('sends the security headers, and caches only fingerprinted files for good', async ({
  request
}) => {
  const home = await request.get('/');
  const headers = home.headers();
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['content-security-policy']).toMatch(/script-src 'self' 'sha256-/);
  expect(headers['content-security-policy']).not.toContain('__SCRIPT_HASHES__');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['cache-control']).toBeUndefined();
  const script = (await home.text()).match(/src="(\/assets\/[^"]+\.js)"/)![1]!;
  expect((await request.get(script)).headers()['cache-control']).toContain('immutable');
});

test('offers a sitemap, robots.txt, and an llms.txt whose links are site pages', async ({
  request
}) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const path of ['/get-started', '/tour', '/operations/cloudflare'])
    expect(sitemap).toContain(`https://vizoalica.dev${path}`);
  expect(await (await request.get('/robots.txt')).text()).toContain(
    'Sitemap: https://vizoalica.dev/sitemap.xml'
  );
  const llms = await (await request.get('/llms.txt')).text();
  expect(llms).toMatch(/^# Vizoalica/);
  expect(llms).toContain('https://vizoalica.dev/operations/');
  expect(llms).not.toMatch(/\]\((docs\/|README\.md)/);
});

test('reaches every documentation page from the navigation, with working links', async ({
  page
}) => {
  await page.goto('/');
  const sidebarLinks = await page
    .goto('/operations/pages')
    .then(() =>
      page
        .locator('.VPSidebar a')
        .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).pathname))
    );
  expect(sidebarLinks.length).toBeGreaterThanOrEqual(20);
  for (const link of new Set(sidebarLinks)) {
    const response = await page.request.get(link);
    expect(response.status(), link).toBe(200);
  }
});

test('reads without JavaScript: content, links, and the tour images are all there', async ({
  browser
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Vizoalica');
  await expect(page.getByRole('link', { name: 'Get started' }).first()).toBeVisible();
  await expect(page.getByText('pnpm vizoalica install').first()).toBeVisible();
  await page.goto('/tour');
  const images = page.locator('.vp-doc img');
  await expect(images).toHaveCount(6);
  for (let index = 0; index < 6; index += 1) {
    expect(await images.nth(index).getAttribute('alt'), `image ${index}`).toMatch(/.{20,}/);
    expect(
      await images
        .nth(index)
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)
    ).toBe(true);
  }
  await context.close();
});

test('fits at phone width and at 200% zoom on every page', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
    expect(await overflow(), path).toBeLessThanOrEqual(1);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    expect(await overflow(), `${path} at 200%`).toBeLessThanOrEqual(1);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
  }
});

test('the intro video is muted, controllable, has a poster and a text version, and respects reduced motion', async ({
  browser
}) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  const video = page.locator('video');
  await expect(video).toHaveAttribute('controls', '');
  await expect(video).toHaveAttribute('poster', '/media/vizoalica-intro-poster.jpg');
  await expect(video).toHaveAttribute('aria-label', /Vizoalica/);
  expect(await video.evaluate((element: HTMLVideoElement) => element.muted)).toBe(true);
  await page.waitForTimeout(800);
  // Reduced motion: it waits for the visitor to press play.
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  await page.getByText('Read the video’s text').click();
  await expect(page.getByText('Privacy-first web analytics.').first()).toBeVisible();
  await context.close();
});

test('searches the docs in the browser', async ({ page }) => {
  const problems = await collectProblems(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.locator('.VPLocalSearchBox input.search-input').fill('OneCLI');
  await expect(page.locator('#localsearch-list a').first()).toBeVisible();
  await page.keyboard.press('Escape');
  expect(problems.outside).toEqual([]);
});

test('the console tour and home page are keyboard reachable, with a visible focus', async ({
  page
}) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
  await page.goto('/tour');
  await expect(page.locator('.vp-doc figure')).toHaveCount(6);
});

// The consent prompt exists only in a site built for a Vizoalica backend (the CI build sets a
// placeholder endpoint for this). A locally built site without one has no prompt to test.
test.describe('analytics consent', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    test.skip(
      (await page.getByRole('region', { name: /improve these docs/i }).count()) === 0 &&
        (await page.getByRole('button', { name: /^Analytics:/ }).count()) === 0,
      'built without analytics'
    );
  });

  test('asks first, and loads nothing from Vizoalica until analytics is allowed', async ({
    page
  }) => {
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));
    await page.reload();
    await expect(page.getByRole('region', { name: /improve these docs/i })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(requested.filter((url) => /vizoalica-loader|vizoalica\/config/.test(url))).toEqual([]);
  });

  test('"No thanks" is remembered and loads nothing, and the choice can be changed', async ({
    page
  }) => {
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));
    await page.getByRole('button', { name: 'No thanks' }).click();
    await page.reload();
    await expect(page.getByRole('region', { name: /improve these docs/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Analytics: off. Change' })).toBeVisible();
    expect(requested.filter((url) => /vizoalica-loader/.test(url))).toEqual([]);
    await page.getByRole('button', { name: 'Analytics: off. Change' }).click();
    await expect(page.getByRole('region', { name: /improve these docs/i })).toBeVisible();
  });

  test('"Allow analytics" loads the loader, and only then', async ({ page }) => {
    await page.route('**/vizoalica-loader.js', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: 'window.__loaderRan = true;' })
    );
    await page.getByRole('button', { name: 'Allow analytics' }).click();
    await expect
      .poll(() => page.evaluate(() => (window as { __loaderRan?: boolean }).__loaderRan))
      .toBe(true);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Analytics: on. Change' })).toBeVisible();
  });
});
