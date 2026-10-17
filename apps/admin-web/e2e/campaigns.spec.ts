import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockConsole } from './mock-console.js';

test.beforeEach(async ({ page }) => {
  await mockConsole(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

const sources = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'Sources table' });

test('Campaigns is in the Analytics navigation and shows the report', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  await nav.getByRole('link', { name: 'Campaigns', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Campaigns' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Campaigns', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );
  await expect(sources(page).getByRole('row')).toHaveCount(3);
  await expect(sources(page).getByRole('row').nth(1)).toContainText('newsletter');
  await expect(page.getByRole('region', { name: 'Top combinations table' })).toBeVisible();
  // View-only: nothing on the page changes a setting.
  await expect(
    page.locator('main').getByRole('button', { name: /create|add|save|delete|enable|disable/i })
  ).toHaveCount(0);
});

test('choosing a source keeps it in the address and can be removed', async ({ page }) => {
  await page.goto('/#/analytics/campaigns');
  await sources(page).getByRole('link', { name: 'newsletter' }).click();
  await expect(page).toHaveURL(/#\/analytics\/campaigns\?source=newsletter/);
  await expect(page.getByRole('list', { name: 'Current selection' })).toContainText('newsletter');
  await page.getByRole('link', { name: 'Remove source filter' }).click();
  await expect(page.getByRole('list', { name: 'Current selection' })).toHaveCount(0);
});

for (const theme of ['Light', 'Dark'] as const) {
  test(`has no automated accessibility violations in the ${theme.toLowerCase()} theme`, async ({
    page
  }) => {
    await page.getByRole('button', { name: theme }).click();
    await page.goto('/#/analytics/campaigns?source=newsletter');
    await expect(sources(page)).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
