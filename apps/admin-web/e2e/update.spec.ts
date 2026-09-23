import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockConsole, setupState } from './mock-console.js';

test('an admin updates a backend that is one release behind, backup shown before it runs', async ({
  page
}) => {
  await mockConsole(page, { setup: setupState('admin'), backendBehind: true });
  await page.goto('/#/manage/backend');
  await expect(page.getByText('Update available').first()).toBeVisible();
  await page.getByRole('button', { name: 'Show the update plan' }).click();
  await expect(page.getByRole('heading', { name: 'This update will' })).toBeVisible();
  await expect(page.getByText('adds access keys')).toBeVisible();
  await page.getByRole('button', { name: 'Approve and update' }).click();
  await expect(page.getByText(/Now at Worker/)).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '0.7.0' })).toBeVisible();
  await expect(page.getByText(/A backup was saved to/)).toBeVisible();
});

test('every other role sees the update status read-only, with no update control', async ({
  page
}) => {
  for (const role of ['owner', 'analyst'] as const) {
    await mockConsole(page, { setup: setupState(role), backendBehind: true });
    await page.goto('/#/manage/backend');
    await expect(page.getByText('Update available').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show the update plan' })).toHaveCount(0);
  }
});

test('the update plan can be reached and approved with the keyboard alone', async ({ page }) => {
  await mockConsole(page, { setup: setupState('admin'), backendBehind: true });
  await page.goto('/#/manage/backend');
  await page.getByRole('button', { name: 'Show the update plan' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'This update will' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve and update' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Now at Worker/)).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the update plan passes accessibility checks in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await mockConsole(page, { setup: setupState('admin'), backendBehind: true });
    await page.goto('/#/manage/backend');
    await page.getByRole('button', { name: 'Show the update plan' }).click();
    await expect(page.getByRole('heading', { name: 'This update will' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
