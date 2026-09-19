import type { Page } from '@playwright/test';

export const project = { id: 'project-1', name: 'Developer Tools', websiteCount: 1 };
export const secondProject = { id: 'project-2', name: 'Developer Tools', websiteCount: 0 };
export const website = {
  id: 'site-1',
  projectId: project.id,
  name: 'Docs',
  publicSourceKey: 'public-key',
  allowedOrigins: ['https://docs.example.com'],
  status: 'active'
};

// 25 countries plus Tor and unknown traffic, so the complete list, the map, and the special
// labels can all be exercised.
export const COUNTRY_CODES = [
  'US',
  'DE',
  'GB',
  'FR',
  'IN',
  'BR',
  'CA',
  'AU',
  'JP',
  'NL',
  'ES',
  'IT',
  'SE',
  'PL',
  'MX',
  'KR',
  'ZA',
  'NG',
  'AR',
  'TR',
  'ID',
  'NZ',
  'NO',
  'CH',
  'EG'
];

export const geographyItems = [
  ...COUNTRY_CODES.map((label, index) => ({ label, count: 1000 - index * 30 })),
  { label: 'T1', count: 40 },
  { label: 'Unknown', count: 20 }
];

function overview(startUtc: string, endUtc: string) {
  const total = geographyItems.reduce((sum, item) => sum + item.count, 0);
  return {
    scope: {
      projectId: project.id,
      sourceId: null,
      label: 'All websites',
      identityMode: 'project-supplied'
    },
    range: { startUtc, endUtc, interval: 'hour', timezone: 'UTC' },
    totals: { pageViews: total, uniqueUsers: 3941 },
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
      countries: { items: geographyItems, otherCount: 0, total },
      userAgents: { items: [{ label: 'Chrome 120', count: 500 }], otherCount: 0, total: 500 },
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
}

export interface MockOptions {
  projects?: unknown[];
}

/** Answers every console API call locally; nothing reaches a real backend. */
export async function mockConsole(page: Page, options: MockOptions = {}) {
  await page.route(/^http:\/\/127\.0\.0\.1:4173\/api\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let body: unknown = {};
    if (path === '/api/session') return route.fulfill({ status: 204 });
    if (path.endsWith('/websites') && request.method() === 'POST') {
      const projectId = path.split('/')[3]!;
      const input = request.postDataJSON() as { name: string; allowedOrigins: string[] };
      return route.fulfill({
        status: 201,
        json: {
          id: 'site-created',
          projectId,
          name: input.name,
          publicSourceKey: 'created-public-key',
          allowedOrigins: input.allowedOrigins,
          status: 'active'
        }
      });
    }
    if (request.method() === 'DELETE')
      return route.fulfill({ json: { status: 'deleted', audit: 'recorded' } });
    if (request.method() === 'PATCH') return route.fulfill({ json: website });
    if (path === '/api/projects') body = options.projects ?? [project, secondProject];
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
    else if (path.endsWith('/reachability'))
      body = {
        configEndpointReachable: true,
        configEndpointCheckedAt: '2026-09-10T00:00:00.000Z',
        configEndpointError: null
      };
    else if (path.endsWith('/analytics'))
      body = overview(
        url.searchParams.get('start') ?? '2026-09-10T00:00:00.000Z',
        url.searchParams.get('end') ?? '2026-09-11T00:00:00.000Z'
      );
    await route.fulfill({ json: body });
  });
}
