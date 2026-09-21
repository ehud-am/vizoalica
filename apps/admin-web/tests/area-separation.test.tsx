// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { CAPABILITIES, capabilityById } from '../src/capabilities.js';
import { NAV_ROUTES, ROUTES, routeArea, type RoutePath } from '../src/router.js';
import { makeActionsReport, makeOverview, primaryIntegration } from './fixtures/console.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  listProjects: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  listWebsites: vi.fn(),
  createWebsite: vi.fn(),
  updateWebsite: vi.fn(),
  deleteWebsite: vi.fn(),
  getSnippet: vi.fn(),
  getStatus: vi.fn(),
  getReachability: vi.fn(),
  getAnalyticsOverview: vi.fn(),
  getAnalyticsActions: vi.fn()
}));
vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

const website = {
  id: 's1',
  projectId: 'p1',
  name: 'Docs',
  publicSourceKey: 'public',
  allowedOrigins: ['https://docs.test'],
  status: 'active' as const
};
const MUTATIONS = [
  api.createProject,
  api.deleteProject,
  api.createWebsite,
  api.updateWebsite,
  api.deleteWebsite
];

beforeEach(() => {
  api.bootstrapSession.mockResolvedValue(undefined);
  api.listProjects.mockResolvedValue([{ id: 'p1', name: 'Acme', websiteCount: 1 }]);
  api.listWebsites.mockResolvedValue([website]);
  api.getSnippet.mockResolvedValue(primaryIntegration);
  api.getStatus.mockResolvedValue({
    collection: 'healthy',
    aggregation: 'available',
    configuration: 'healthy',
    dataAccess: 'available'
  });
  api.getReachability.mockResolvedValue({
    configEndpointReachable: true,
    configEndpointCheckedAt: '2026-01-01T00:00:00.000Z',
    configEndpointError: null
  });
  api.getAnalyticsActions.mockResolvedValue(makeActionsReport());
  api.getAnalyticsOverview.mockResolvedValue(
    makeOverview({
      totals: { pageViews: 10, uniqueUsers: 4 },
      rankings: {
        pagePaths: { items: [{ label: '/', count: 10 }], otherCount: 0, total: 10 },
        countries: { items: [{ label: 'DE', count: 10 }], otherCount: 0, total: 10 },
        userAgents: { items: [{ label: 'Chrome 120', count: 10 }], otherCount: 0, total: 10 },
        referrers: { items: [{ label: 'example.com', count: 10 }], otherCount: 0, total: 10 }
      },
      distributions: {
        operatingSystems: { items: [{ label: 'macOS', count: 10 }], total: 10 },
        browsers: { items: [{ label: 'Chrome', count: 10 }], total: 10 },
        devices: { items: [{ label: 'desktop', count: 10 }], total: 10 },
        traffic: { items: [{ label: 'human', count: 10 }], total: 10 }
      }
    })
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const analyticsRoutes = ROUTES.filter((route) => route.area === 'analytics');
// Every Manage page, with a real website id where the address needs one.
const manageAddresses = [
  'manage/projects',
  'manage/websites',
  'manage/websites/new',
  'manage/websites/s1',
  'manage/websites/s1/edit',
  'manage/websites/s1/install',
  'manage/health'
];

describe('view and manage separation', () => {
  it.each(analyticsRoutes.map((route) => [route.path]))(
    '%s has no state-changing control and issues no state-changing request',
    async (path) => {
      window.location.hash = `#/${path}`;
      render(<App />);
      await screen.findByRole('heading', { level: 1 });
      // Each view loads its own data; the Actions page never needs the overview.
      await waitFor(() =>
        expect(
          api.getAnalyticsOverview.mock.calls.length + api.getAnalyticsActions.mock.calls.length
        ).toBeGreaterThan(0)
      );
      await waitFor(() =>
        expect(document.querySelector('.dashboard-card:not(.skeleton)')).toBeTruthy()
      );
      expect(document.querySelectorAll('[data-capability]')).toHaveLength(0);
      const buttons = Array.from(document.querySelectorAll('main button:not([role="tab"])')).map(
        (button) => button.textContent ?? ''
      );
      expect(buttons.filter((text) => /create|add|save|delete|disable|enable/i.test(text))).toEqual(
        []
      );
      for (const mutation of MUTATIONS) expect(mutation).not.toHaveBeenCalled();
    }
  );

  it('labels the two areas in primary navigation and lists only its own destinations in each', async () => {
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Primary navigation' });
    const groups = Array.from(nav.querySelectorAll('.nav-group'));
    expect(groups.map((group) => group.getAttribute('data-area'))).toEqual(['analytics', 'manage']);
    for (const group of groups) {
      const area = group.getAttribute('data-area');
      const expected = NAV_ROUTES.filter((route) => route.area === area).map(
        (route) => route.label
      );
      expect(Array.from(group.querySelectorAll('a')).map((link) => link.textContent)).toEqual(
        expected
      );
    }
  });

  // How many state-changing controls each Manage page is expected to have, so the check below can
  // not pass by finding none.
  const expectedMutations: Record<string, number> = {
    'manage/projects': 2,
    'manage/websites': 0,
    'manage/websites/new': 1,
    'manage/websites/s1': 2,
    'manage/websites/s1/edit': 1,
    'manage/websites/s1/install': 0,
    'manage/health': 0
  };

  it.each(manageAddresses.map((address) => [address]))(
    '%s marks every mutating control with a manage capability',
    async (path) => {
      window.location.hash = `#/${path}`;
      render(<App />);
      // The page marks itself once loaded; the connecting screen has a heading of its own.
      await waitFor(() => expect(document.querySelector('main [data-page]')).toBeTruthy());
      const mutating = Array.from(
        document.querySelectorAll('main button:not([role="tab"])')
      ).filter((button) => /create|add|save|delete|disable|enable/i.test(button.textContent ?? ''));
      expect(mutating.length, path).toBeGreaterThanOrEqual(expectedMutations[path]!);
      for (const button of mutating) {
        const capability = capabilityById(button.getAttribute('data-capability') ?? '');
        expect(capability, button.textContent ?? '').toBeTruthy();
        expect(capability?.area).toBe('manage');
        expect(capability?.class).not.toBe('view');
      }
      // Pages that only show things carry no capability tags at all.
      if (expectedMutations[path] === 0)
        expect(document.querySelectorAll('main [data-capability]')).toHaveLength(0);
    }
  );

  it('places every operate or administer capability in the Manage area', () => {
    for (const capability of CAPABILITIES)
      if (capability.class !== 'view') expect(capability.area).toBe('manage');
  });

  it('keeps every route in exactly one area', () => {
    for (const route of ROUTES) expect(routeArea(route.path as RoutePath)).toBe(route.area);
    expect(new Set(ROUTES.map((route) => route.path)).size).toBe(ROUTES.length);
  });
});
