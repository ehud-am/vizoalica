import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const project = { id: 'project-1', name: 'Developer Tools' };
const secondProject = { id: 'project-2', name: 'Developer Tools' };
const website = {
  id: 'site-1',
  projectId: project.id,
  name: 'Docs',
  publicSourceKey: 'public-key',
  allowedOrigins: ['https://docs.example.com'],
  status: 'active'
};

async function mockConsole(page: Page) {
  await page.route(/^http:\/\/127\.0\.0\.1:4173\/api\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let body: unknown = {};
    if (path === '/api/session') return route.fulfill({ status: 204 });
    if (path === '/api/projects') body = [project, secondProject];
    else if (path === '/api/preferences/theme') body = { theme: null };
    else if (path.endsWith('/websites')) body = [website];
    else if (path.endsWith('/snippet'))
      body = {
        projectId: project.id,
        sourceId: website.id,
        publicSourceKey: 'public-key',
        allowedOrigins: website.allowedOrigins,
        tokenIssuer: 'website-owned',
        html: '<script async src="/vizoalica.js" data-source="public-key"></script>'
      };
    else if (path.endsWith('/status'))
      body = {
        collection: 'healthy',
        aggregation: 'available',
        configuration: 'healthy',
        dataAccess: 'available'
      };
    else if (path.endsWith('/analytics'))
      body = {
        scope: {
          projectId: project.id,
          sourceId: null,
          label: 'All websites',
          identityMode: 'project-supplied'
        },
        range: {
          startUtc: '2026-09-10T00:00:00.000Z',
          endUtc: '2026-09-11T00:00:00.000Z',
          interval: 'hour',
          timezone: 'UTC'
        },
        totals: { pageViews: 12840, uniqueUsers: 3941 },
        trend: [
          { startUtc: '2026-09-10T00:00:00.000Z', pageViews: 500, uniqueUsers: 210 },
          { startUtc: '2026-09-10T01:00:00.000Z', pageViews: 740, uniqueUsers: 310 }
        ],
        rankings: {
          pagePaths: {
            items: [{ label: '/docs/getting-started/a-very-long-route', count: 820 }],
            otherCount: 20,
            total: 840
          },
          countries: { items: [{ label: 'United States', count: 610 }], otherCount: 0, total: 610 },
          userAgents: { items: [{ label: 'Chrome', count: 500 }], otherCount: 0, total: 500 },
          referrers: { items: [{ label: 'Direct', count: 700 }], otherCount: 0, total: 700 }
        },
        distributions: {
          operatingSystems: { items: [{ label: 'macOS', count: 500 }], total: 500 },
          browsers: { items: [{ label: 'Chrome', count: 500 }], total: 500 },
          devices: { items: [{ label: 'Desktop', count: 500 }], total: 500 },
          traffic: { items: [{ label: 'Human', count: 500 }], total: 500 }
        },
        availability: { state: 'complete', taxonomyVersions: [1] }
      };
    await route.fulfill({ json: body });
  });
}

test.beforeEach(async ({ page }) => {
  await mockConsole(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Understand what’s happening.' })).toBeVisible();
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

test('navigates Projects with the keyboard and preserves explicit current context', async ({
  page
}) => {
  const projects = page.getByRole('button', { name: 'Projects', exact: true });
  await projects.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await expect(projects).toHaveAttribute('aria-current', 'page');

  const selectSecond = page.getByRole('button', {
    name: 'Select Developer Tools (project-2)'
  });
  await selectSecond.focus();
  await page.keyboard.press('Enter');
  await expect(selectSecond).toHaveAttribute('aria-pressed', 'true');

  const openWebsites = page.getByRole('button', {
    name: 'Open websites for Developer Tools (project-2)'
  });
  await openWebsites.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Websites' })).toHaveAttribute(
    'aria-current',
    'page'
  );
  await expect(page.getByRole('combobox', { name: 'Project' })).toHaveValue('project-2');
});

test('has no serious axe findings on Projects, Overview, and Websites', async ({ page }) => {
  for (const name of ['Projects', 'Overview', 'Websites']) {
    await page.getByRole('button', { name }).click();
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))
    ).toEqual([]);
  }
});
