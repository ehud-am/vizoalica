import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockConsole, setupState } from './mock-console.js';

test('the admin creates and sees a key', async ({ page }) => {
  await mockConsole(page, { setup: setupState('admin') });
  await page.goto('/#/manage/access');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Access keys', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create access key' }).click();
  await page.getByLabel('Name').fill('Jane, analyst');
  await page.locator('.access-form').getByRole('button', { name: 'Create access key' }).click();
  await expect(page.getByRole('heading', { name: 'Save this access key now' })).toBeVisible();
  await expect(page.getByText('vzk_test_key')).toBeVisible();
  await page.getByRole('button', { name: 'I have saved it' }).click();
  await expect(page.getByRole('heading', { name: 'Save this access key now' })).toHaveCount(0);
});

test('issues a key with dropdowns, then says what to do with it', async ({ page }) => {
  await mockConsole(page, { setup: setupState('admin') });
  await page.goto('/#/manage/access');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Access keys', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create access key' }).click();
  const form = page.locator('.access-form');
  await expect(form.locator('input[type="radio"]')).toHaveCount(0);
  // The role is a dropdown that explains each choice.
  await form.getByRole('button', { name: /^Role/ }).click();
  await expect(page.getByRole('menuitemradio', { name: /Website owner/ })).toContainText(
    'manage websites and projects'
  );
  await page.getByRole('menuitemradio', { name: /Website owner/ }).click();
  await expect(form.getByRole('button', { name: /^Role/ })).toContainText('Website owner');
  await form.getByLabel('Name').fill('Jane, owner');
  await form.getByRole('button', { name: 'Create access key' }).click();
  await expect(page.getByRole('heading', { name: 'Save this access key now' })).toBeFocused();
  const panel = page.locator('.key-reveal .key-instructions');
  await expect(panel).toContainText('Nothing to deploy');
  await expect(panel.getByRole('region', { name: 'Add the backend', exact: true })).toContainText(
    'vizoalica env add prod-owner --connect --url https://worker.test --role owner'
  );
  await panel.getByText('Advanced: keep the key in OneCLI').click();
  await expect(panel.getByRole('region', { name: 'Add the backend with OneCLI' })).toContainText(
    '--secret-onecli'
  );
  await panel.getByRole('tab', { name: 'From a script' }).click();
  await expect(panel.getByRole('region', { name: 'Add the backend', exact: true })).toContainText(
    '--secret-stdin'
  );
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole('button', { name: 'I have saved it' }).click();
  await expect(page.getByRole('heading', { name: 'Save this access key now' })).toHaveCount(0);
});

test('the access form fits a phone and 200% zoom', async ({ page }) => {
  await mockConsole(page, { setup: setupState('admin') });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/#/manage/access');
  await page.getByRole('button', { name: 'Create access key' }).click();
  await expect(page.locator('.access-form')).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await page.locator('.access-form').getByRole('button', { name: /^Role/ }).click();
  await expect(page.getByRole('menu', { name: 'Role' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
});

test('explains who keys are for, and is reached from the environment menu and a website, not the sidebar', async ({
  page
}) => {
  await mockConsole(page, { setup: setupState('admin') });
  await page.goto('/#/manage/websites/site-1');
  await expect(
    page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: /access/i })
  ).toHaveCount(0);
  // From a website's Access keys card.
  await page.getByRole('link', { name: 'Manage access keys', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Access keys for / })).toBeVisible();
  // From the Backend menu.
  await page.goto('/#/manage/health');
  await page.getByRole('button', { name: /^Backend/ }).click();
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
