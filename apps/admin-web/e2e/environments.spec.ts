import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockConsole, mockEnvironment, setupState } from './mock-console.js';

const file = { status: 'ok' as const, path: '/home/test/.config/vizoalica/environments.json' };
const two = {
  file,
  environments: [mockEnvironment('dev'), mockEnvironment('prod')],
  selected: 'prod'
};
const none = { file, environments: [], selected: null };

const environmentButton = (page: Page) => page.getByRole('button', { name: /^Environment/ });

test('a single environment shows its name and role, and only an administrator gets a menu', async ({
  page
}) => {
  await mockConsole(page, { setup: setupState('admin') });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(environmentButton(page)).toContainText('prod');
  await expect(environmentButton(page).locator('.menu-badge')).toHaveText('admin');
  // The only thing in its menu is the administrator's Access keys entry.
  await environmentButton(page).click();
  await expect(page.getByRole('menuitemradio')).toHaveCount(1);
  await expect(page.getByRole('menuitem', { name: 'Access keys' })).toBeVisible();
});

test('a single environment is plain text for someone who cannot manage keys', async ({ page }) => {
  await mockConsole(page, { setup: setupState('analyst') });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.locator('.menu-static')).toContainText('prod');
  await expect(environmentButton(page)).toHaveCount(0);
});

test('with several environments, the menu opens on the selected one and lists them all', async ({
  page
}) => {
  await mockConsole(page, { setup: setupState('admin'), environments: two });
  await page.goto('/');
  await expect(environmentButton(page)).toContainText('prod');
  await environmentButton(page).click();
  const items = page.getByRole('menuitemradio');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('dev');
  await expect(items.nth(1)).toHaveAttribute('aria-checked', 'true');
  // The role is its own element, not part of the name.
  await expect(items.nth(0).locator('.menu-item-label')).toHaveText('dev');
  await expect(items.nth(0).locator('.menu-badge')).toHaveText('admin');
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
  await environmentButton(page).click();
  const item = page.getByRole('menuitemradio').first();
  await expect(item).toHaveAttribute('aria-disabled', 'true');
  await expect(item).toContainText('rejected this administrator secret');
});

test('choosing another environment reloads the console for it and sends nothing else', async ({
  page
}) => {
  const writes: string[] = [];
  await mockConsole(page, { setup: setupState('admin'), environments: two, writes });
  await page.goto('/');
  await environmentButton(page).click();
  await page.getByRole('menuitemradio', { name: /dev/ }).click();
  await expect(environmentButton(page)).toContainText('dev');
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  expect(writes).toEqual(['POST /api/environments/dev/select']);
});

test('the environment control never overlaps its own text, at any width', async ({ page }) => {
  await mockConsole(page, {
    setup: setupState('admin'),
    environments: {
      file,
      environments: [
        mockEnvironment('a-rather-long-environment-name-for-production', 'admin'),
        mockEnvironment('dev')
      ],
      selected: 'a-rather-long-environment-name-for-production'
    }
  });
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const trigger = environmentButton(page);
    await expect(trigger).toBeVisible();
    // The chevron sits in its own column: it never intersects the face (name and badge).
    const boxes = await trigger.evaluate((element) => {
      const face = element.querySelector('.menu-face')!.getBoundingClientRect();
      const chevron = element.querySelector('.menu-chevron')!.getBoundingClientRect();
      const button = element.getBoundingClientRect();
      return {
        faceRight: face.right,
        chevronLeft: chevron.left,
        chevronRight: chevron.right,
        buttonRight: button.right,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(boxes.faceRight).toBeLessThanOrEqual(boxes.chevronLeft + 0.5);
    expect(boxes.chevronRight).toBeLessThanOrEqual(boxes.buttonRight + 0.5);
    expect(boxes.pageOverflow).toBeLessThanOrEqual(1);
    await trigger.click();
    const list = page.getByRole('menu', { name: 'Environment' });
    await expect(list).toBeVisible();
    const inside = await list.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.left >= -0.5 && box.right <= window.innerWidth + 0.5;
    });
    expect(inside).toBe(true);
    await page.keyboard.press('Escape');
  }
});

test('the environment menu works from the keyboard and reports no accessibility violations', async ({
  page
}) => {
  await mockConsole(page, { setup: setupState('admin'), environments: two });
  await page.goto('/');
  await environmentButton(page).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menu', { name: 'Environment' })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(environmentButton(page)).toBeFocused();
});

test('there is no way to add, edit, or remove an environment in the console', async ({ page }) => {
  await mockConsole(page, { setup: setupState('admin'), environments: two });
  for (const route of ['/', '/#/manage/health', '/#/manage/projects']) {
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
