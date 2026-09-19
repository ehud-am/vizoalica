// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { ApiError } from '../src/api/local-operations.js';
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

const project = { id: 'p1', name: 'Acme' };
const website = {
  id: 's1',
  projectId: 'p1',
  name: 'Docs',
  publicSourceKey: 'public',
  allowedOrigins: ['https://docs.test'],
  status: 'active' as const
};

beforeEach(() => {
  api.bootstrapSession.mockResolvedValue(undefined);
  api.listProjects.mockResolvedValue([project]);
  api.createProject.mockResolvedValue({ id: 'p2', name: 'New project' });
  api.deleteProject.mockResolvedValue({ status: 'deleted', audit: 'recorded' });
  api.listWebsites.mockResolvedValue([website]);
  api.createWebsite.mockResolvedValue(website);
  api.updateWebsite.mockResolvedValue(website);
  api.deleteWebsite.mockResolvedValue({ status: 'deleted', audit: 'recorded' });
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
    makeOverview({ totals: { pageViews: 12, uniqueUsers: 5 } })
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const goTo = (path: string) => {
  window.location.hash = `#/${path}`;
};

describe('console startup', () => {
  it('bootstraps a session and loads the analytics overview', async () => {
    render(<App />);
    expect(screen.getByText('Opening your workspace')).toBeTruthy();
    await screen.findByRole('heading', { name: 'Overview' });
    await waitFor(() =>
      expect(api.getAnalyticsOverview).toHaveBeenCalledWith(
        'p1',
        undefined,
        expect.any(String),
        expect.any(String),
        expect.any(AbortSignal)
      )
    );
    expect(await screen.findByText('12')).toBeTruthy();
  });

  it('distinguishes revoked access, offline startup, and empty workspaces', async () => {
    api.bootstrapSession.mockRejectedValueOnce(new ApiError('access_revoked', 401));
    render(<App />);
    expect(await screen.findByText('Authorization required')).toBeTruthy();
    cleanup();
    api.bootstrapSession.mockRejectedValueOnce(new Error('offline'));
    render(<App />);
    expect(await screen.findByText('Workspace unavailable')).toBeTruthy();
    cleanup();
    api.bootstrapSession.mockResolvedValue(undefined);
    api.listProjects.mockResolvedValueOnce([]);
    render(<App />);
    expect(await screen.findByText('Create a project first')).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Create a project' }));
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeTruthy();
  });

  it('shows website and analytics loading failures without retaining stale totals', async () => {
    api.listWebsites.mockRejectedValueOnce(new Error('offline'));
    render(<App />);
    expect(await screen.findByText('Websites could not be loaded.')).toBeTruthy();
    cleanup();
    api.listWebsites.mockResolvedValue([website]);
    api.getAnalyticsOverview.mockRejectedValueOnce(new ApiError('access_revoked', 401));
    render(<App />);
    expect(
      await screen.findByText(
        /The Worker rejected the configured credential. Run pnpm vizoalica status./
      )
    ).toBeTruthy();
    cleanup();
    api.getAnalyticsOverview.mockRejectedValueOnce(new ApiError('session_expired', 401));
    render(<App />);
    expect(await screen.findByText(/Your browser session expired/)).toBeTruthy();
    cleanup();
    api.getAnalyticsOverview.mockRejectedValueOnce(new Error('offline'));
    render(<App />);
    const message = await screen.findByText(/Analytics are unavailable/);
    expect(message).toBeTruthy();
    api.getAnalyticsOverview.mockResolvedValue(
      makeOverview({ totals: { pageViews: 3, uniqueUsers: 1 } })
    );
    await userEvent
      .setup()
      .click(within(message.closest('p')!).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('3')).toBeTruthy();
  });
});

describe('Manage > Health', () => {
  it('shows health and reachability for every website in scope with a next step', async () => {
    api.listWebsites.mockResolvedValue([website, { ...website, id: 's2', name: 'Blog' }]);
    goTo('manage/health');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Docs' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Blog' })).toBeTruthy();
    expect((await screen.findAllByText(/Website reachable/i)).length).toBe(2);
    expect(screen.getAllByText('No action needed.').length).toBe(2);
    expect(api.getStatus).toHaveBeenCalledTimes(2);
  });

  it('shows a specific reason and next step when the configuration endpoint is unreachable', async () => {
    api.getReachability.mockResolvedValue({
      configEndpointReachable: false,
      configEndpointCheckedAt: '2026-01-01T00:00:00.000Z',
      configEndpointError: 'network_error'
    });
    goTo('manage/health');
    render(<App />);
    expect(await screen.findByText(/Website unreachable or misconfigured/i)).toBeTruthy();
    expect(screen.getByText(/could not be reached/i)).toBeTruthy();
    expect(screen.getByText(/configuration endpoint is deployed and reachable/)).toBeTruthy();
  });

  it('reports health details as unavailable, and empty projects', async () => {
    api.getStatus.mockRejectedValue(new Error('offline'));
    goTo('manage/health');
    render(<App />);
    expect(await screen.findByText(/Health details are unavailable/)).toBeTruthy();
    cleanup();
    api.listWebsites.mockResolvedValue([]);
    render(<App />);
    expect(await screen.findByText('No websites yet')).toBeTruthy();
  });
});
