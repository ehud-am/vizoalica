import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockConsole } from './mock-console.js';

test.beforeEach(async ({ page }) => {
  await mockConsole(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

const table = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'Actions on pages table' });

test('Actions is in the Analytics navigation and shows the report', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  await nav.getByRole('link', { name: 'Actions', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Actions' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Actions', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );
  await expect(table(page).getByRole('row')).toHaveCount(5);
  await expect(table(page).getByRole('row').nth(1)).toContainText('/#/pricing');
  await expect(table(page).getByRole('row').nth(1)).toContainText('Start free trial');
  await expect(
    page.getByRole('region', { name: 'Most used actions across pages table' })
  ).toBeVisible();
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
    await page.goto('/#/analytics/actions');
    await expect(table(page)).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
    await page.goto('/#/analytics/actions?page=%2F%23%2Fpricing');
    await expect(page.getByRole('list', { name: 'Current selection' })).toBeVisible();
    const narrowed = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(narrowed.violations).toEqual([]);
  });
}

test('narrows to a page and back using only the keyboard, and the address keeps the selection', async ({
  page
}) => {
  await page.goto('/#/analytics/actions');
  await expect(table(page)).toBeVisible();

  const pageLink = table(page).getByRole('link', { name: '/#/orders/:id' }).first();
  await pageLink.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/analytics\/actions\?page=%2F%23%2Forders%2F%3Aid$/);
  await expect(page.getByRole('list', { name: 'Current selection' })).toContainText(
    '/#/orders/:id'
  );
  const summary = page.getByLabel('Selected page');
  await expect(summary).toContainText('Page views');
  await expect(summary).toContainText('40');
  await expect(summary).toContainText('90');
  await expect(table(page).getByRole('row')).toHaveCount(3);

  const actionLink = table(page).getByRole('link', { name: 'Contact sales' });
  await actionLink.focus();
  await page.keyboard.press('Enter');
  await expect(table(page).getByRole('row')).toHaveCount(2);
  await expect(page).toHaveURL(/page=.*&action=Contact%20sales$/);

  // The address alone restores the same view after a reload.
  await page.reload();
  await expect(page.getByRole('list', { name: 'Current selection' })).toContainText(
    'Contact sales'
  );
  await expect(table(page).getByRole('row')).toHaveCount(2);

  await page.getByRole('link', { name: 'Remove page filter' }).focus();
  await page.keyboard.press('Enter');
  await expect(table(page).getByRole('row')).toHaveCount(3);
  await page.getByRole('link', { name: 'Remove action filter' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('list', { name: 'Current selection' })).toHaveCount(0);
  await expect(table(page).getByRole('row')).toHaveCount(5);
});

test('selecting an action lists every page it occurred on', async ({ page }) => {
  await page.goto('/#/analytics/actions');
  await table(page).getByRole('link', { name: 'Contact sales' }).first().click();
  await expect(table(page).getByRole('row')).toHaveCount(3);
  await expect(table(page)).toContainText('/#/pricing');
  await expect(table(page)).toContainText('/#/orders/:id');
});

test('contains its content at phone and desktop widths', async ({ page }) => {
  await page.goto('/#/analytics/actions');
  await expect(table(page)).toBeVisible();
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, `${width}px`).toBeLessThanOrEqual(1);
  }
});
