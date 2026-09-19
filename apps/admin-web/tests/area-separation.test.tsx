// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { CAPABILITIES, capabilityById } from '../src/capabilities.js';
import { ROUTES, routeArea, type RoutePath } from '../src/router.js';
import { makeOverview, primaryIntegration } from './fixtures/console.js';

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
  getAnalyticsOverview: vi.fn()
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
const manageRoutes = ROUTES.filter((route) => route.area === 'manage');

describe('view and manage separation', () => {
  it.each(analyticsRoutes.map((route) => [route.path]))(
    '%s has no state-changing control and issues no state-changing request',
    async (path) => {
      window.location.hash = `#/${path}`;
      render(<App />);
      await screen.findByRole('heading', { level: 1 });
      await waitFor(() => expect(api.getAnalyticsOverview).toHaveBeenCalled());
      await waitFor(() =>
        expect(document.querySelector('.dashboard-card:not(.skeleton)')).toBeTruthy()
      );
      expect(document.querySelectorAll('[data-capability]')).toHaveLength(0);
      const buttons = Array.from(document.querySelectorAll('main button')).map(
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
      const expected = ROUTES.filter((route) => route.area === area).map((route) => route.label);
      expect(Array.from(group.querySelectorAll('a')).map((link) => link.textContent)).toEqual(
        expected
      );
    }
  });

  it.each(manageRoutes.map((route) => [route.path]))(
    '%s marks every mutating control with a manage capability',
    async (path) => {
      window.location.hash = `#/${path}`;
      const user = userEvent.setup();
      render(<App />);
      await screen.findByRole('heading', { level: 1 });
      if (path === 'manage/websites')
        await user.click(await screen.findByRole('button', { name: /Docs/ }));
      await waitFor(() => expect(document.querySelector('main')).toBeTruthy());
      const mutating = Array.from(document.querySelectorAll('main button')).filter((button) =>
        /create|add|save|delete|disable|enable/i.test(button.textContent ?? '')
      );
      for (const button of mutating) {
        const capability = capabilityById(button.getAttribute('data-capability') ?? '');
        expect(capability, button.textContent ?? '').toBeTruthy();
        expect(capability?.area).toBe('manage');
        expect(capability?.class).not.toBe('view');
      }
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
