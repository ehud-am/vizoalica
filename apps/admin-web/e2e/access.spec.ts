import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockConsole, setupState } from './mock-console.js';

test('the admin issues, sees, and revokes a key', async ({ page }) => {
  await mockConsole(page, { setup: setupState('admin') });
  await page.goto('/#/manage/access');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Access keys', exact: true })
  ).toBeVisible();
  await page.getByLabel('Label').fill('Jane, analyst');
  await page.getByRole('button', { name: 'Issue key' }).click();
  await expect(page.getByRole('heading', { name: 'Save this key now' })).toBeVisible();
  await expect(page.getByText('vzk_test_key')).toBeVisible();
  await page.getByRole('button', { name: 'I have saved it' }).click();
  await expect(page.getByRole('heading', { name: 'Save this key now' })).toHaveCount(0);
});

test('explains who keys are for, and is reached from the environment menu and a website, not the sidebar', async ({
  page
}) => {
  await mockConsole(page, { setup: setupState('admin') });
  await page.goto('/#/manage/websites/site-1');
  await expect(
    page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: /Access/ })
  ).toHaveCount(0);
  // From a website's Share section.
  await page.getByRole('link', { name: 'Access keys', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Access keys', exact: true })
  ).toBeVisible();
  await expect(page.getByText(/analyst \(who can only view\) or a website owner/)).toBeVisible();
  // From the environment menu.
  await page.goto('/#/manage/health');
  await page.getByRole('button', { name: /^Environment/ }).click();
  await page.getByRole('menuitem', { name: 'Access keys' }).click();
  await expect(page).toHaveURL(/#\/manage\/access$/);
});

test('is absent from navigation and refused for other roles', async ({ page }) => {
  await mockConsole(page, { setup: setupState('analyst') });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Access keys', exact: true })).toHaveCount(0);
  await page.goto('/#/manage/access');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`passes accessibility checks in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await mockConsole(page, { setup: setupState('admin') });
    await page.goto('/#/manage/access');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Access keys', exact: true })
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
