import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockConsole, setupState } from './mock-console.js';

const two = {
  active: 'prod',
  environments: [
    { name: 'prod', hasConnection: true, mode: 'file' as const },
    { name: 'dev', hasConnection: true, mode: 'file' as const }
  ]
};

test('a single environment shows only a small, unobtrusive label', async ({ page }) => {
  await mockConsole(page, { setup: setupState('admin') });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.locator('.environment-label')).toHaveText('prod');
  await expect(page.getByRole('button', { name: /Environment: prod/ })).toHaveCount(0);
});

test('a website owner never sees the switcher', async ({ page }) => {
  await mockConsole(page, { setup: setupState('owner'), environments: two });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.locator('.environment-switcher, .environment-label')).toHaveCount(0);
});

test('switching environments reflects on the next screen', async ({ page }) => {
  await mockConsole(page, { setup: setupState('admin'), environments: two });
  await page.goto('/');
  const summary = page.locator('.environment-switcher > summary');
  await summary.click();
  await expect(page.locator('.environment-switcher-panel')).toBeVisible();
  await page.getByRole('button', { name: 'dev', exact: true }).click();
  await expect(summary).toHaveText('dev');
});

test('creates a new environment with a validated name', async ({ page }) => {
  await mockConsole(page, { setup: setupState('admin'), environments: two });
  await page.goto('/');
  await page.locator('.environment-switcher > summary').click();
  await page.getByRole('button', { name: 'New environment' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('alert')).toContainText('lowercase');
  await page.getByLabel('New environment name').fill('stage');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('.environment-switcher-panel')).toBeHidden();
});

test('removes an environment with a named confirmation that says Cloudflare is untouched', async ({
  page
}) => {
  await mockConsole(page, { setup: setupState('admin'), environments: two });
  await page.goto('/');
  await page.locator('.environment-switcher > summary').click();
  await page.getByRole('button', { name: 'Remove environment dev' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('dev');
  await expect(dialog).toContainText('not');
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await expect(dialog).toHaveCount(0);
});

test('the switcher passes accessibility checks in both themes', async ({ page }) => {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await mockConsole(page, { setup: setupState('admin'), environments: two });
    await page.goto('/');
    await page.locator('.environment-switcher > summary').click();
    await expect(page.locator('.environment-switcher-panel')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
});

test('is keyboard operable', async ({ page }) => {
  await mockConsole(page, { setup: setupState('admin'), environments: two });
  await page.goto('/');
  const summary = page.locator('.environment-switcher > summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.environment-switcher-panel')).toBeVisible();
});
