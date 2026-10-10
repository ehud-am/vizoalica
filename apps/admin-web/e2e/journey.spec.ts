import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockConsole, setupState } from './mock-console.js';

const noWebsite = setupState('admin', {
  at: 2,
  next: {
    id: 'create-project',
    label: 'Create a project and add a website',
    href: '#/manage/projects'
  }
});
const noData = setupState('admin', {
  at: 3,
  next: {
    id: 'install-website',
    label: 'Follow the install steps, then check',
    href: '#/manage/websites/site-1/install'
  }
});

test('shows where things stand, with one next action', async ({ page }) => {
  await mockConsole(page, { setup: noWebsite });
  await page.goto('/');
  const journey = page.getByRole('region', { name: 'Setup progress' });
  await expect(journey.getByRole('listitem')).toHaveCount(4);
  await expect(journey.getByRole('listitem').nth(2)).toHaveAttribute('aria-current', 'step');
  await expect(
    journey.getByRole('link', { name: 'Create a project and add a website' })
  ).toHaveAttribute('href', '#/manage/projects');
  await expect(journey).toContainText('Done');
  await expect(journey).toContainText('Current step');
  await expect(journey).toContainText('To do');
});

test('moves on to data and points at the install steps', async ({ page }) => {
  await mockConsole(page, { setup: noData });
  await page.goto('/');
  await expect(
    page
      .getByRole('region', { name: 'Setup progress' })
      .getByRole('link', { name: /install steps/ })
  ).toBeVisible();
  await expect(page.getByText(/no data has arrived/)).toBeVisible();
});

test('hides once data is arriving', async ({ page }) => {
  await mockConsole(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Setup progress' })).toHaveCount(0);
});

test('marks stages blocked and says so when the backend stops answering', async ({ page }) => {
  await mockConsole(page, {
    setup: setupState(
      'admin',
      {
        at: 1,
        status: 'blocked',
        next: {
          id: 'check-backend',
          label: 'The backend is not answering. Check it and retry.'
        }
      },
      {
        connection: { status: 'unreachable', workerHost: 'worker.test' }
      }
    )
  });
  await page.goto('/#/manage/projects');
  await expect(page.getByRole('alert').filter({ hasText: 'not answering' }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Setup progress' })).toContainText('Blocked');
});

test('an analyst sees every change control unavailable, and none of them sends anything', async ({
  page
}) => {
  const writes: string[] = [];
  await mockConsole(page, { setup: setupState('analyst'), writes });
  await page.goto('/#/manage/projects');
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  const create = page.getByRole('button', { name: /Create project/ });
  await expect(create).toHaveAttribute('aria-disabled', 'true');
  await expect(create).toHaveAccessibleDescription(/Your access is read-only\./);
  await page.getByLabel('Project name').fill('Nope');
  // Playwright treats aria-disabled as not clickable, so force it: the point is that nothing happens.
  await create.click({ force: true });
  await page.getByLabel('Project name').press('Enter');
  await page
    .getByRole('button', { name: /Delete project/ })
    .first()
    .click({ force: true });
  await page.goto('/#/manage/websites/site-1');
  await expect(page.getByRole('heading', { level: 1, name: 'Docs' })).toBeVisible();
  await page.getByRole('button', { name: /Delete website/ }).click({ force: true });
  await page.getByRole('button', { name: /Disable website/ }).click({ force: true });
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(writes).toEqual([]);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the journey and unavailable controls pass accessibility checks in ${scheme}`, async ({
    page
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await mockConsole(page, {
      setup: setupState('analyst', {
        at: 3,
        next: { id: 'waiting-for-data', label: 'Waiting for the first data.' }
      })
    });
    await page.goto('/#/manage/websites/new');
    await expect(page.getByRole('region', { name: 'Setup progress' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add website/ })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test('keeps the journey readable at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await mockConsole(page, { setup: noWebsite });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Setup progress' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
