import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockConsole, mockEnvironment, setupState } from './mock-console.js';

const file = { status: 'ok' as const, path: '/home/test/.config/vizoalica/environments.json' };
const two = {
  file,
  environments: [mockEnvironment('dev'), mockEnvironment('prod')],
  selected: 'prod'
};
const none = { file, environments: [], selected: null };

test('a single environment shows only a small, unobtrusive label', async ({ page }) => {
  await mockConsole(page, { setup: setupState('admin') });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.locator('.environment-label')).toContainText('prod');
  await expect(page.getByRole('combobox', { name: 'Environment' })).toHaveCount(0);
});

test('with several environments, the picker opens on the selected one and lists them all', async ({
  page
}) => {
  await mockConsole(page, { setup: setupState('admin'), environments: two });
  await page.goto('/');
  const picker = page.getByRole('combobox', { name: 'Environment' });
  await expect(picker).toHaveValue('prod');
  await expect(picker.getByRole('option')).toHaveText(['dev (admin)', 'prod (admin)']);
});

test('an environment that is not usable is shown disabled with the reason', async ({ page }) => {
  await mockConsole(page, {
    setup: setupState('admin'),
    environments: {
      file,
      environments: [
        mockEnvironment('dev', 'admin', 'The Worker rejected this administrator secret.'),
        mockEnvironment('prod')
      ],
      selected: 'prod'
    }
  });
  await page.goto('/');
  const option = page.getByRole('combobox', { name: 'Environment' }).getByRole('option').first();
  await expect(option).toBeDisabled();
  await expect(option).toContainText('rejected this administrator secret');
});

test('choosing another environment reloads the console for it and sends nothing else', async ({
  page
}) => {
  const writes: string[] = [];
  await mockConsole(page, { setup: setupState('admin'), environments: two, writes });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Environment' }).selectOption('dev');
  await expect(page.getByRole('combobox', { name: 'Environment' })).toHaveValue('dev');
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  expect(writes).toEqual(['POST /api/environments/dev/select']);
});

test('there is no way to add, edit, or remove an environment in the console', async ({ page }) => {
  await mockConsole(page, { setup: setupState('admin'), environments: two });
  for (const route of ['/', '/#/manage/backend', '/#/manage/projects']) {
    await page.goto(route);
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
    for (const name of [/new environment/i, /add environment/i, /remove environment/i, /deploy/i])
      await expect(page.getByRole('button', { name })).toHaveCount(0);
  }
});

test('with no environment the welcome page explains it and names the command', async ({ page }) => {
  await mockConsole(page, { environments: none });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome to Vizoalica' })).toBeVisible();
  await expect(page.getByText('vizoalica env add <name>')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(0);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('the welcome page says what is wrong with each environment, and re-checks on request', async ({
  page
}) => {
  await mockConsole(page, {
    environments: {
      file,
      environments: [
        mockEnvironment('prod', 'admin', 'The Worker rejected this administrator secret.')
      ],
      selected: null
    }
  });
  await page.goto('/');
  await expect(page.getByText('rejected this administrator secret')).toBeVisible();
  await expect(page.getByText('vizoalica env update prod')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible();
});

test('a broken environments file is reported with its path', async ({ page }) => {
  await mockConsole(page, {
    environments: {
      file: {
        status: 'broken',
        path: '/home/test/.config/vizoalica/environments.json',
        reason: 'The file is not valid JSON.'
      },
      environments: [],
      selected: null
    }
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('The file is not valid JSON.');
  await expect(page.getByText('/home/test/.config/vizoalica/environments.json')).toBeVisible();
});
