import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockConsole } from './mock-console.js';

const origin = 'http://127.0.0.1:4173';

test('shows a one-line footer on Overview and Manage', async ({ page }) => {
  await mockConsole(page);
  for (const address of ['analytics/overview', 'manage/websites']) {
    await page.goto(`/#/${address}`);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    const footer = page.getByRole('contentinfo');
    await expect(footer).toBeVisible();
    await expect(footer).toHaveText('Vizoalica·vizoalica.dev·GitHub');
    await expect(footer.getByRole('link')).toHaveCount(2);
    await expect(footer.getByRole('navigation')).toHaveCount(0);
    await expect(footer).not.toContainText(/Version|©|Privacy-first/);
  }
});

test('shows the footer when the console cannot reach its service', async ({ page }) => {
  await page.route(/^http:\/\/127\.0\.0\.1:4173\/api\//, (route) => route.abort());
  await page.goto('/');
  await expect(page.getByText('Workspace unavailable')).toBeVisible();
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: /^vizoalica\.dev:/ })
  ).toBeVisible();
});

test('points at the website and the repository', async ({ page }) => {
  await mockConsole(page);
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  await expect(footer.getByRole('link', { name: /^vizoalica\.dev:/ })).toHaveAttribute(
    'href',
    'https://vizoalica.dev'
  );
  await expect(footer.getByRole('link', { name: /^GitHub/ })).toHaveAttribute(
    'href',
    'https://github.com/ehud-am/vizoalica'
  );
});

for (const width of [320, 768, 1440] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`is one line without overflow at ${width}px in ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await mockConsole(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.getByRole('contentinfo')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(1);
      // The three items share one row wherever they fit, and never overlap where they wrap.
      const boxes = await page.locator('.app-footer-line > *').evaluateAll((items) =>
        items.map((item) => {
          const box = item.getBoundingClientRect();
          return { top: Math.round(box.top), left: box.left, right: box.right };
        })
      );
      expect(boxes).toHaveLength(3);
      if (width >= 768) expect(new Set(boxes.map((box) => box.top)).size).toBe(1);
      for (const [index, box] of boxes.entries())
        if (index > 0 && boxes[index - 1]!.top === box.top)
          expect(box.left).toBeGreaterThanOrEqual(boxes[index - 1]!.right - 0.5);
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
  expect(count).toBe(2);
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
