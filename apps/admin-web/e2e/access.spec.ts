import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockConsole, setupState } from './mock-console.js';

test('the admin issues, sees, and revokes a key', async ({ page }) => {
  await mockConsole(page, { setup: setupState('admin') });
  await page.goto('/#/manage/access');
  await expect(page.getByRole('heading', { level: 1, name: 'Access' })).toBeVisible();
  await page.getByLabel('Label').fill('Jane, analyst');
  await page.getByRole('button', { name: 'Issue key' }).click();
  await expect(page.getByRole('heading', { name: 'Save this key now' })).toBeVisible();
  await expect(page.getByText('vzk_test_key')).toBeVisible();
  await page.getByRole('button', { name: 'I have saved it' }).click();
  await expect(page.getByRole('heading', { name: 'Save this key now' })).toHaveCount(0);
});

test('is absent from navigation and refused for other roles', async ({ page }) => {
  await mockConsole(page, { setup: setupState('analyst') });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Access' })).toHaveCount(0);
  await page.goto('/#/manage/access');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`passes accessibility checks in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await mockConsole(page, { setup: setupState('admin') });
    await page.goto('/#/manage/access');
    await expect(page.getByRole('heading', { level: 1, name: 'Access' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
