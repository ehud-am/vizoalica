import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockConsole } from './mock-console.js';

test.beforeEach(async ({ page }) => {
  await mockConsole(page);
});

const overflow = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('list, website, edit, and back, by mouse', async ({ page }) => {
  await page.goto('/#/manage/websites');
  await expect(page.getByRole('list', { name: 'Websites' }).getByRole('link')).toHaveCount(1);
  // The list has no fields at all.
  await expect(page.locator('main input, main select, main textarea')).toHaveCount(0);
  await page.getByRole('link', { name: /Docs/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Docs/ })).toBeVisible();
  await expect(page).toHaveURL(/#\/manage\/websites\/site-1$/);
  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Edit Docs' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Website name' })).toBeFocused();
  await page.getByRole('link', { name: /Back to Docs/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Docs/ })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Edit Docs' })).toBeVisible();
});

test('edit is keyboard-only, protects unsaved changes, and saves back to the website', async ({
  page
}) => {
  await page.goto('/#/manage/websites/site-1/edit');
  const name = page.getByRole('textbox', { name: 'Website name' });
  await expect(name).toBeFocused();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await page.keyboard.type(' v2');
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  // Leaving through Cancel asks first, and keeping the edits is the default.
  await page.getByRole('link', { name: 'Cancel' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('alertdialog', { name: 'Discard your changes?' });
  await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(name).toHaveValue('Docs v2');
  await page.getByRole('button', { name: 'Save changes' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Website updated and audit recorded.')).toBeVisible();
  await expect(page).toHaveURL(/#\/manage\/websites\/site-1$/);
});

test('adding a website ends on its Install page', async ({ page }) => {
  await page.goto('/#/manage/websites');
  await page.getByRole('link', { name: /Add website/ }).click();
  const form = page.getByRole('form', { name: 'Add website' });
  await form.getByRole('combobox', { name: 'Project' }).selectOption('project-1');
  await form.getByRole('textbox', { name: 'Website name' }).fill('Launch');
  await form.getByRole('textbox', { name: 'Allowed origins' }).fill('https://launch.example');
  await form.getByRole('button', { name: 'Add website' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Install on Launch' })).toBeVisible();
  await expect(page.getByText(/Next: install it/)).toBeVisible();
});

test('install: choose a path with the keyboard, copy, and check that data arrives', async ({
  page,
  context
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#/manage/websites/site-1/install');
  const github = page.getByRole('tab', { name: 'GitHub → Cloudflare Pages' });
  await expect(github).toHaveAttribute('aria-selected', 'true');
  await expect(github).toContainText('Recommended');
  await expect(page.locator('.install-step')).toHaveCount(5);

  await github.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Paste a snippet' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  // The snippet path has a step for downloading the SDK file.
  await expect(page.locator('.install-step')).toHaveCount(5);
  // The choice is remembered for this website.
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Paste a snippet' })).toHaveAttribute(
    'aria-selected',
    'true'
  );

  await page.getByRole('button', { name: 'Copy snippet' }).click();
  await expect(page.getByRole('button', { name: 'Copy snippet' })).toContainText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('vizoalica.js');

  await page.getByRole('button', { name: 'Check now' }).click();
  await expect(page.getByText('Receiving data.')).toBeVisible();
});

test('the new pages fit at phone width and 200% zoom, and pass axe in both themes', async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const address of [
    'manage/websites',
    'manage/websites/new',
    'manage/websites/site-1',
    'manage/websites/site-1/edit',
    'manage/websites/site-1/install'
  ]) {
    await page.goto(`/#/${address}`);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.locator('.skeleton')).toHaveCount(0);
    expect(await overflow(page), address).toBeLessThanOrEqual(1);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    expect(await overflow(page), `${address} at 200%`).toBeLessThanOrEqual(1);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
  }
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/#/manage/websites/site-1/install');
    await page.getByRole('tab', { name: 'GitHub → Cloudflare Pages' }).click();
    await expect(page.locator('.install-step')).toHaveCount(5);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? '')),
      scheme
    ).toEqual([]);
  }
});
