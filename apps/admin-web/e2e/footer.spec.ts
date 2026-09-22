import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockConsole } from './mock-console.js';

const origin = 'http://127.0.0.1:4173';

test('shows the footer on Overview and Manage', async ({ page }) => {
  await mockConsole(page);
  for (const address of ['analytics/overview', 'manage/websites']) {
    await page.goto(`/#/${address}`);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    const footer = page.getByRole('contentinfo');
    await expect(footer).toBeVisible();
    await expect(
      footer.getByText('Privacy-first analytics that runs in your own Cloudflare account.')
    ).toBeVisible();
    await expect(footer.getByRole('navigation', { name: 'Vizoalica' })).toBeVisible();
    await expect(footer.getByRole('navigation', { name: 'Project' })).toBeVisible();
    await expect(footer.getByText(/^Version \d+\.\d+\.\d+/)).toBeVisible();
  }
});

test('shows the footer when the console cannot reach its service', async ({ page }) => {
  await page.route(/^http:\/\/127\.0\.0\.1:4173\/api\//, (route) => route.abort());
  await page.goto('/');
  await expect(page.getByText('Workspace unavailable')).toBeVisible();
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: /^Website:/ })
  ).toBeVisible();
});

test('points at the website and the project', async ({ page }) => {
  await mockConsole(page);
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  await expect(footer.getByRole('link', { name: /^Website:/ })).toHaveAttribute(
    'href',
    'https://vizoalica.dev'
  );
  await expect(footer.getByRole('link', { name: /^GitHub/ })).toHaveAttribute(
    'href',
    'https://github.com/ehud-am/vizoalica'
  );
});

for (const [width, columns] of [
  [320, 1],
  [768, 2],
  [1440, 3]
] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`reflows without overflow at ${width}px in ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await mockConsole(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.getByRole('contentinfo')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(1);
      const tops = await page
        .locator('.app-footer-inner > *')
        .evaluateAll(
          (items) => new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))).size
        );
      // One row of columns on a wide screen; stacked on a phone.
      if (columns === 1) expect(tops).toBe(3);
      if (columns === 3) expect(tops).toBe(1);
    });
  }
}

for (const scheme of ['light', 'dark'] as const) {
  test(`has no accessibility violations in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await mockConsole(page);
    await page.goto('/');
    await expect(page.getByRole('contentinfo')).toBeVisible();
    const results = await new AxeBuilder({ page }).include('footer').analyze();
    expect(results.violations).toEqual([]);
  });
}

test('is fully keyboard reachable with a visible focus ring', async ({ page }) => {
  await mockConsole(page);
  await page.goto('/');
  const links = page.getByRole('contentinfo').getByRole('link');
  const count = await links.count();
  expect(count).toBe(10);
  await links.first().focus();
  for (let index = 0; index < count; index += 1) {
    const focused = page.locator(':focus');
    await expect(focused).toHaveAttribute('target', '_blank');
    const outline = await focused.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline).not.toBe('none');
    await page.keyboard.press('Tab');
  }
});

test('requests nothing outside the console for its links', async ({ page }) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:'))
      outside.push(url);
  });
  await mockConsole(page);
  await page.goto('/');
  await expect(page.getByRole('contentinfo')).toBeVisible();
  expect(outside).toEqual([]);
});
