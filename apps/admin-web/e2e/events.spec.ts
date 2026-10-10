import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockConsole } from './mock-console.js';

test.beforeEach(async ({ page }) => {
  await mockConsole(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

const table = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'Events table' });

test('Events is in the Analytics navigation and shows the report', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  await nav.getByRole('link', { name: 'Events', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Events' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Events', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );
  await expect(table(page).getByRole('row')).toHaveCount(3);
  await expect(table(page).getByRole('row').nth(1)).toContainText('signup');
  await expect(page.getByRole('region', { name: 'Top pages table' })).toBeVisible();
  // View-only: nothing on the page changes a setting.
  await expect(
    page.locator('main').getByRole('button', { name: /create|add|save|delete|enable|disable/i })
  ).toHaveCount(0);
});

test('choosing an event keeps it in the address and shows its property values', async ({
  page
}) => {
  await page.goto('/#/analytics/events');
  await table(page).getByRole('link', { name: 'signup' }).click();
  await expect(page).toHaveURL(/#\/analytics\/events\?event=signup/);
  await expect(page.getByRole('region', { name: 'Property values table' })).toContainText('pro');
  await page.getByRole('link', { name: 'Remove event filter' }).click();
  await expect(page.getByRole('region', { name: 'Property values table' })).toHaveCount(0);
});

for (const theme of ['Light', 'Dark'] as const) {
  test(`has no automated accessibility violations in the ${theme.toLowerCase()} theme`, async ({
    page
  }) => {
    await page.getByRole('button', { name: theme }).click();
    await page.goto('/#/analytics/events?event=signup');
    await expect(table(page)).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
