import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { firstRunSetup, mockConsole, setupState } from './mock-console.js';

async function toRole(page: import('@playwright/test').Page, options = {}) {
  await mockConsole(page, { setup: firstRunSetup(), ...options });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome to Vizoalica' })).toBeVisible();
}

test('shows first run first, with the footer and no navigation', async ({ page }) => {
  await toRole(page);
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(0);
  await expect(page.getByRole('contentinfo')).toBeVisible();
});

test('an admin with a backend connects and lands in the console', async ({ page }) => {
  await toRole(page, { afterConnect: setupState('admin') });
  await page.getByRole('button', { name: /Admin/ }).click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Name your environment'
    })
  ).toBeVisible();
  await page.getByLabel('Environment name').fill('prod');
  await page.getByRole('button', { name: /I already have one/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Connect your backend' })).toBeVisible();
  await page.getByLabel('Backend address').fill('https://worker.test');
  await page.getByLabel('Administrator secret').fill('the-secret');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

test('an admin who needs a backend deploys from the console', async ({ page }) => {
  await toRole(page);
  await page.getByRole('button', { name: /Admin/ }).click();
  await page.getByLabel('Environment name').fill('prod');
  await page.getByRole('button', { name: /I need a backend/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Set up a backend' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Deploy this environment/ })).toBeVisible();
  await page.getByRole('button', { name: 'Show the deployment plan' }).click();
  await page.getByRole('button', { name: 'Approve and deploy' }).click();
  await expect(page.getByRole('button', { name: 'Show the generated secrets' })).toBeVisible();
});

test('Analyst goes straight to the address and access key', async ({ page }) => {
  await toRole(page, { afterConnect: setupState('analyst') });
  await page.getByRole('button', { name: /Analyst/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Connect as analyst' })).toBeVisible();
  await expect(page.getByLabel('Access key')).toBeVisible();
  await page.getByLabel('Backend address').fill('https://worker.test');
  await page.getByLabel('Access key').fill('vzk_key');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
});

test('Website owner pastes setup details and connects with no separate address field shown first', async ({
  page
}) => {
  await toRole(page, { afterConnect: setupState('owner') });
  await page.getByRole('button', { name: /Website owner/ }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Connect as website owner' })
  ).toBeVisible();
  await expect(page.getByLabel('Setup details')).toBeVisible();
  await expect(page.getByLabel('Backend address')).toHaveCount(0);
  await page
    .getByLabel('Setup details')
    .fill(JSON.stringify({ workerUrl: 'https://worker.test', readKey: 'vzk_key' }));
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
});

test('shows a one-line notice when an administrator secret was entered as an analyst', async ({
  page
}) => {
  await toRole(page, {
    afterConnect: { ...setupState('admin'), notice: 'administrator_secret_used' }
  });
  await page.getByRole('button', { name: /Analyst/ }).click();
  await page.getByLabel('Backend address').fill('https://worker.test');
  await page.getByLabel('Access key').fill('the-admin-secret');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.getByText(/administrator secret, not an access key/)).toBeVisible();
});

test('says in words when the backend refuses the credential', async ({ page }) => {
  await toRole(page, { connectFails: 401 });
  await page.getByRole('button', { name: /Admin/ }).click();
  await page.getByLabel('Environment name').fill('prod');
  await page.getByRole('button', { name: /I already have one/ }).click();
  await page.getByLabel('Backend address').fill('https://worker.test');
  await page.getByLabel('Administrator secret').fill('wrong');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByRole('alert')).toContainText('did not accept that credential');
  await expect(page.getByLabel('Backend address')).toHaveValue('https://worker.test');
});

test('can be completed with the keyboard alone', async ({ page }) => {
  await toRole(page, { afterConnect: setupState('analyst') });
  // The heading takes focus first; the role cards follow in reading order.
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome to Vizoalica' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /Admin/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /Analyst/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Connect as analyst' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.type('https://worker.test');
  await page.keyboard.press('Tab');
  await page.keyboard.type('vzk_key');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`every first-run step passes accessibility checks in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await toRole(page);
    const audit = async () =>
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await audit();
    await page.getByRole('button', { name: /Admin/ }).click();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Name your environment'
      })
    ).toBeVisible();
    await audit();
    await page.getByLabel('Environment name').fill('prod');
    await page.getByRole('button', { name: /I need a backend/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Set up a backend' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Deploy this environment/ })).toBeVisible();
    await audit();
    await page.getByRole('button', { name: 'Show the deployment plan' }).click();
    await expect(page.getByRole('heading', { name: 'This will create' })).toBeVisible();
    await audit();
    await page.getByRole('button', { name: 'Approve and deploy' }).click();
    await expect(page.getByRole('button', { name: 'Show the generated secrets' })).toBeVisible();
    await audit();
    await page.getByRole('button', { name: 'Show the generated secrets' }).click();
    await expect(page.getByText('shown-once-secret')).toBeVisible();
    await audit();
  });
}

test('the Connection screen reviews and changes the connection', async ({ page }) => {
  await mockConsole(page, { setup: setupState('owner') });
  await page.goto('/#/setup');
  await expect(page.getByRole('heading', { level: 1, name: 'Connection' })).toBeVisible();
  await expect(page.getByText('Website owner (Jane)')).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome to Vizoalica' })).toBeVisible();
});

test('stays usable at phone width without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await toRole(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
