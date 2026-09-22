import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockConsole, secondProject } from './mock-console.js';

test.beforeEach(async ({ page }) => {
  await mockConsole(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

for (const [label, width] of [
  ['compact', 320],
  ['medium', 768],
  ['standard', 1024],
  ['wide', 1440]
] as const) {
  test(`${label} layout contains content at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('link', { name: 'Vizoalica overview' })).toBeVisible();
    if (width === 320) {
      await expect(page.getByTestId('brand-logo')).toHaveJSProperty(
        'currentSrc',
        'http://127.0.0.1:4173/brand/vizoalica-mark.svg'
      );
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('preserves state across resize and synchronizes the dark lockup', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: /Last 24 hours/ }).click();
  await page.getByLabel('Custom').check();
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.getByRole('dialog', { name: 'Choose a time range' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.getByTestId('brand-logo')).toHaveAttribute(
    'src',
    '/brand/vizoalica-lockup-dark.svg'
  );
});

test('navigates Projects with the keyboard and keeps the scope explicit', async ({ page }) => {
  const projects = page.getByRole('link', { name: 'Projects', exact: true });
  await projects.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  await expect(projects).toHaveAttribute('aria-current', 'page');

  const openWebsites = page.getByRole('link', {
    name: 'Manage websites in Developer Tools (project-2)'
  });
  await openWebsites.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: 'Websites', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );
  await expect(page.getByRole('region', { name: 'Scope' }).getByLabel('Project')).toHaveValue(
    'project-2'
  );
});

test('requires project confirmation as the first website creation control', async ({ page }) => {
  await page.getByRole('link', { name: 'Websites', exact: true }).click();
  await page.getByRole('link', { name: /Add website/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add a website' })).toBeVisible();
  const form = page.getByRole('form', { name: 'Add website' });
  const projectChoice = form.getByRole('combobox', { name: 'Project' });
  await expect(projectChoice).toHaveValue('');
  await expect(projectChoice).toHaveAttribute('required', '');
  await expect(projectChoice).toBeFocused();
  expect(
    await form.evaluate((element) => element.querySelector('select, input, textarea')?.tagName)
  ).toBe('SELECT');
  await projectChoice.selectOption(secondProject.id);
  await form.getByRole('textbox', { name: 'Website name' }).fill('Launch');
  await form.getByRole('textbox', { name: 'Allowed origins' }).fill('https://launch.example');
  await form.getByRole('button', { name: 'Add website' }).click();
  // Creating lands on the new website's Install page, in the chosen project.
  await expect(page.getByRole('heading', { level: 1, name: /^Install on/ })).toBeVisible();
  await expect(
    page.getByText(
      `Website Launch created in project ${secondProject.name} (${secondProject.id}).`,
      {
        exact: false
      }
    )
  ).toBeVisible();
});

test('recovers from an empty project list with a keyboard-accessible Create a project action', async ({
  page
}) => {
  await page.route('http://127.0.0.1:4173/api/projects', (route) => route.fulfill({ json: [] }));
  await page.reload();
  const recovery = page.getByRole('link', { name: 'Create a project' });
  await recovery.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  await expect(
    page.getByText('Create a project before adding websites or viewing analytics.')
  ).toBeVisible();
});

test('keeps the footer centered, unobscured, and reachable at narrow 200% zoom', async ({
  page
}) => {
  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 720 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const footer = page.getByRole('contentinfo');
  await footer.scrollIntoViewIfNeeded();
  const footerBox = await footer.boundingBox();
  const lastActionBox = await page
    .getByRole('button', { name: 'Delete project Developer Tools (project-2)' })
    .boundingBox();
  expect(footerBox).toBeTruthy();
  expect(lastActionBox).toBeTruthy();
  expect(lastActionBox!.y + lastActionBox!.height).toBeLessThanOrEqual(footerBox!.y);
  const center = await page.locator('.app-footer-inner').evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.left + box.width / 2;
  });
  expect(Math.abs(center - 160)).toBeLessThanOrEqual(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
  await expect(footer.getByRole('link', { name: /^Website:/ })).toHaveAttribute(
    'href',
    'https://vizoalica.dev'
  );
  await expect(footer.getByRole('link', { name: /^GitHub:/ })).toHaveAttribute(
    'href',
    'https://github.com/ehud-am/vizoalica'
  );
});

test('the console has no Local workspace indicator', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Local workspace' })).toHaveCount(0);
  await expect(page.getByText('Local workspace')).toHaveCount(0);
});

test('time range options are ordinary radio buttons with the label after them on one line', async ({
  page
}) => {
  await page.getByRole('button', { name: /^Last/ }).click();
  const options = page.locator('.time-range-presets label');
  await expect(options).toHaveCount(6);
  for (let index = 0; index < 6; index += 1) {
    const label = options.nth(index);
    const radio = await label.locator('input[type="radio"]').boundingBox();
    const text = await label.evaluate((element) => {
      const range = document.createRange();
      const node = Array.from(element.childNodes).find(
        (child) => child.nodeType === Node.TEXT_NODE
      )!;
      range.selectNodeContents(node);
      const box = range.getBoundingClientRect();
      return { left: box.left, top: box.top, height: box.height };
    });
    expect(radio).toBeTruthy();
    // Same line: their vertical centres agree, and the text starts to the right of the radio.
    expect(Math.abs(radio!.y + radio!.height / 2 - (text.top + text.height / 2))).toBeLessThan(4);
    expect(text.left).toBeGreaterThan(radio!.x + radio!.width);
  }
});

test('has no serious axe findings on any screen, in light and dark', async ({ page }) => {
  const screens: Array<[string, string]> = [
    ['analytics/overview', 'Overview'],
    ['analytics/pages', 'Pages'],
    ['analytics/sources', 'Sources'],
    ['analytics/geography', 'Geography'],
    ['analytics/technology', 'Technology'],
    ['analytics/traffic-quality', 'Traffic quality'],
    ['manage/projects', 'Projects'],
    ['manage/websites', 'Websites'],
    ['manage/websites/new', 'Add a website'],
    ['manage/websites/site-1', 'Docs'],
    ['manage/websites/site-1/edit', 'Edit Docs'],
    ['manage/websites/site-1/install', 'Install on Docs'],
    ['manage/health', 'Health']
  ];
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [address, title] of screens) {
      await page.goto(`/#/${address}`);
      await expect(page.getByRole('heading', { level: 1, name: new RegExp(title) })).toBeVisible();
      await expect(page.locator('.skeleton')).toHaveCount(0);
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? '')),
        `${scheme} ${title}`
      ).toEqual([]);
    }
  }
});
