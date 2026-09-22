import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockConsole, setupState } from './mock-console.js';

test('a website owner sees analytics and manages projects and websites, never the backend', async ({
  page
}) => {
  await mockConsole(page, { setup: setupState('owner') });
  await page.goto('/#/manage/projects');
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Create project/ })).not.toHaveAttribute(
    'aria-disabled'
  );
  await page.goto('/#/manage/backend');
  await expect(page.getByRole('heading', { level: 1, name: 'Backend' })).toBeVisible();
  await expect(page.getByText(/coming in a future release/)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Access' })).toHaveCount(0);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the owner's Projects screen passes accessibility checks in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await mockConsole(page, { setup: setupState('owner') });
    await page.goto('/#/manage/projects');
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))
    ).toEqual([]);
  });
}
