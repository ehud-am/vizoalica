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
