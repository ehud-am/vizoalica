import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockConsole, setupState } from './mock-console.js';

test('an analyst sees analytics and read-only configuration', async ({ page }) => {
  await mockConsole(page, { setup: setupState('analyst') });
  await page.goto('/#/manage/projects');
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  const create = page.getByRole('button', { name: /Create project/ });
  await expect(create).toHaveAttribute('aria-disabled', 'true');
  await expect(create).toHaveAccessibleDescription(/Your access is read-only\./);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the analyst's Projects screen passes accessibility checks in ${scheme}`, async ({
    page
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await mockConsole(page, { setup: setupState('analyst') });
    await page.goto('/#/manage/projects');
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))
    ).toEqual([]);
  });
}
