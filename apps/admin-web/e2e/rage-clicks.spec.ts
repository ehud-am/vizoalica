import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockConsole } from './mock-console.js';

test.beforeEach(async ({ page }) => {
  await mockConsole(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

test('Rage clicks is in the Analytics navigation and shows the report', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  await nav.getByRole('link', { name: 'Rage clicks', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Rage clicks' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Rage clicks', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );
  const table = page.getByRole('region', { name: 'Controls with rage clicks table' });
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table.getByRole('row').nth(1)).toContainText('Pay now');
  // View-only: nothing on the page changes a setting.
  await expect(
    page.locator('main').getByRole('button', { name: /create|add|save|delete|enable|disable/i })
  ).toHaveCount(0);
});

for (const theme of ['Light', 'Dark'] as const) {
  test(`has no automated accessibility violations in the ${theme.toLowerCase()} theme`, async ({
    page
  }) => {
    await page.getByRole('button', { name: theme }).click();
    await page.goto('/#/analytics/rage-clicks');
    await expect(
      page.getByRole('region', { name: 'Controls with rage clicks table' })
    ).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
