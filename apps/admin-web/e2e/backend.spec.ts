import { expect, test } from '@playwright/test';
import { mockConsole, setupState } from './mock-console.js';

test('shows the three versions and their status to every role', async ({ page }) => {
  for (const role of ['admin', 'owner', 'analyst'] as const) {
    await mockConsole(page, { setup: setupState(role) });
    await page.goto('/#/manage/backend');
    await expect(page.getByRole('heading', { level: 1, name: 'Backend' })).toBeVisible();
    await expect(page.getByText('Up to date').first()).toBeVisible();
  }
});

test('an update that is available is only reported, for every role, with nothing to change it', async ({
  page
}) => {
  const writes: string[] = [];
  for (const role of ['admin', 'owner', 'analyst'] as const) {
    await mockConsole(page, { setup: setupState(role), backendBehind: true, writes });
    await page.goto('/#/manage/backend');
    await expect(page.getByText('Update available').first()).toBeVisible();
    await expect(page.getByRole('button')).toHaveCount(
      await page.locator('header button, footer button').count()
    );
    for (const name of [/update/i, /deploy/i, /rotate/i, /purge/i])
      await expect(page.getByRole('button', { name })).toHaveCount(0);
  }
  expect(writes).toEqual([]);
});
