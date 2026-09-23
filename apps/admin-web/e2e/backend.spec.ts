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

test('an admin with no connection lands in the deploy wizard from the backend screen', async ({
  page
}) => {
  await mockConsole(page, {
    setup: setupState('admin', undefined, { connection: { status: 'none' } })
  });
  await page.goto('/#/manage/backend');
  await expect(page.getByRole('heading', { name: /Deploy this environment/ })).toBeVisible();
  await page.getByRole('button', { name: 'Show the deployment plan' }).click();
  await page.getByRole('button', { name: 'Approve and deploy' }).click();
  await expect(page.getByRole('button', { name: 'Show the generated secrets' })).toBeVisible();
  await page.getByRole('button', { name: 'Show the generated secrets' }).click();
  await expect(page.getByText('shown-once-secret')).toBeVisible();
});

test('an admin rotates a secret and purges deleted data with named confirmations', async ({
  page
}) => {
  await mockConsole(page, { setup: setupState('admin') });
  await page.goto('/#/manage/backend');
  await page.getByRole('button', { name: 'Rotate analytics digest secret' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Unique-visitor counts restart');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Rotate' }).click();
  await expect(page.getByText('new-secret-value')).toBeVisible();

  await page.getByRole('button', { name: 'Purge now' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('permanently removes');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Purge' }).click();
  await expect(page.getByText(/Removed 0 stored object/)).toBeVisible();
});

test('an owner sees no rotate or purge controls', async ({ page }) => {
  await mockConsole(page, { setup: setupState('owner') });
  await page.goto('/#/manage/backend');
  await expect(page.getByRole('heading', { name: 'Rotate a secret' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Purge deleted data' })).toHaveCount(0);
  await expect(page.getByText('Only an admin can change the backend.')).toBeVisible();
});
