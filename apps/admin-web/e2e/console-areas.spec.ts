import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { COUNTRY_CODES, mockConsole } from './mock-console.js';

const origin = 'http://127.0.0.1:4173';

test.beforeEach(async ({ page }) => {
  await mockConsole(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

test('groups navigation into Analytics and Manage', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(nav.locator('.nav-group')).toHaveCount(2);
  await expect(nav.locator('[data-area="analytics"] a')).toHaveText([
    'Overview',
    'Pages',
    'Sources',
    'Geography',
    'Technology',
    'Traffic quality'
  ]);
  await expect(nav.locator('[data-area="manage"] a')).toHaveText([
    'Projects',
    'Websites',
    'Installation',
    'Health'
  ]);
});

test('Analytics screens contain no state-changing controls', async ({ page }) => {
  for (const name of [
    'Overview',
    'Pages',
    'Sources',
    'Geography',
    'Technology',
    'Traffic quality'
  ]) {
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.locator('[data-capability]')).toHaveCount(0);
  }
});

test('remembers project, website, and range across a reload', async ({ page }) => {
  const scope = page.getByRole('region', { name: 'Scope' });
  await scope.getByLabel('Project').selectOption('project-2');
  await expect(scope.getByLabel('Website')).toBeVisible();
  await page.getByRole('button', { name: /^Last/ }).click();
  await page.getByRole('radio', { name: 'Last 7 days' }).check();
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Scope' }).getByLabel('Project')).toHaveValue(
    'project-2'
  );
  await expect(page.getByRole('button', { name: 'Last 7 days' })).toBeVisible();
});

test('Geography shows every country by full name, a map, and continent totals', async ({
  page
}) => {
  await page.getByRole('link', { name: 'Geography', exact: true }).click();
  const table = page.getByRole('region', { name: 'Locations table' });
  // 25 countries plus Tor and unknown traffic.
  await expect(table.locator('tbody tr')).toHaveCount(COUNTRY_CODES.length + 2);
  await expect(table.getByRole('rowheader', { name: 'United States US' })).toBeVisible();
  await expect(table.getByRole('rowheader', { name: 'Germany DE' })).toBeVisible();
  await expect(table.getByRole('rowheader', { name: 'Tor network' })).toBeVisible();
  await expect(table.getByRole('rowheader', { name: 'Unknown location' })).toBeVisible();
  await expect(table).not.toContainText(/\bT1\b/);
  const map = page.getByRole('group', { name: 'World map of page views by country' });
  await expect(map.getByRole('img')).toHaveCount(COUNTRY_CODES.length);
  await expect(page.getByRole('region', { name: 'Continents table' })).toContainText('Europe');
  // Keyboard reachable: focusing a shaded country reads out its value.
  await map.getByRole('img', { name: /^United States/ }).focus();
  await expect(page.locator('.map-readout')).toContainText('United States:');
});

test('Geography fits at phone width and passes axe in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole('link', { name: 'Geography', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Locations table' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? '')),
      scheme
    ).toEqual([]);
  }
});

test('deleting a website is a keyboard-only, named confirmation that returns focus', async ({
  page
}) => {
  await page.getByRole('link', { name: 'Websites', exact: true }).click();
  await page.getByRole('button', { name: /Docs/ }).click();
  const trigger = page.getByRole('button', { name: 'Delete website…' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('alertdialog', { name: 'Delete Docs?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Website Docs deleted/)).toBeVisible();
});

test('never contacts anything outside the local console', async ({ page }) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:'))
      outside.push(url);
  });
  for (const name of ['Overview', 'Geography', 'Technology', 'Websites', 'Health']) {
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  }
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(outside).toEqual([]);
});
