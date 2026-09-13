// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { ApiError } from '../src/api/local-operations.js';
import { IntegrationSnippet } from '../src/components/IntegrationSnippet.js';
import { WebsiteForm } from '../src/components/WebsiteForm.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  listProjects: vi.fn(),
  createProject: vi.fn(),
  listWebsites: vi.fn(),
  createWebsite: vi.fn(),
  updateWebsite: vi.fn(),
  deleteWebsite: vi.fn(),
  getSnippet: vi.fn(),
  getStatus: vi.fn(),
  getAnalytics: vi.fn(),
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
  api.listWebsites.mockResolvedValue([website]);
  api.createWebsite.mockResolvedValue(website);
  api.updateWebsite.mockResolvedValue(website);
  api.deleteWebsite.mockResolvedValue({ status: 'deleted', audit: 'recorded' });
  api.getSnippet.mockResolvedValue({
    publicSourceKey: 'public',
    allowedOrigins: ['https://docs.test'],
    tokenIssuer: 'website-owned'
  });
  api.getStatus.mockResolvedValue({
    collection: 'healthy',
    aggregation: 'available',
    configuration: 'healthy',
    dataAccess: 'available'
  });
  api.getAnalytics.mockResolvedValue({
    projectId: 'p1',
    websiteId: 's1',
    window: '24h',
    startUtc: '2026-01-01',
    endUtc: '2026-01-02',
    pageViews: 12,
    uniqueUsers: 5,
    availability: 'complete'
  });
  api.getAnalyticsOverview.mockResolvedValue({
    scope: {
      projectId: 'p1',
      sourceId: null,
      label: 'All websites',
      identityMode: 'project-supplied'
    },
    range: {
      startUtc: '2026-01-01T00:00:00.000Z',
      endUtc: '2026-01-02T00:00:00.000Z',
      interval: 'hour',
      timezone: 'UTC'
    },
    totals: { pageViews: 12, uniqueUsers: 5 },
    trend: [],
    rankings: {
      pagePaths: { items: [], otherCount: 0, total: 0 },
      countries: { items: [], otherCount: 0, total: 0 },
      userAgents: { items: [], otherCount: 0, total: 0 },
      referrers: { items: [], otherCount: 0, total: 0 }
    },
    distributions: {
      operatingSystems: { items: [], total: 0 },
      browsers: { items: [], total: 0 },
      devices: { items: [], total: 0 },
      traffic: { items: [], total: 0 }
    },
    availability: { state: 'complete', taxonomyVersions: [1] }
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('interactive console', () => {
  it('bootstraps a session and loads the analytics overview', async () => {
    render(<App />);
    expect(screen.getByText('Opening your workspace')).toBeTruthy();
    await screen.findByText('Understand what’s happening.');
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

  it('creates, edits, disables, and soft-deletes websites with recovery messaging', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Websites' }));
    await screen.findByText('Operational status');
    await user.click(screen.getByText('Add a website'));
    const names = screen.getAllByLabelText('Website name');
    const origins = screen.getAllByLabelText('Allowed origins');
    await user.type(names[0]!, 'Marketing');
    await user.type(origins[0]!, 'https://marketing.test');
    await user.click(screen.getByRole('button', { name: 'Add website' }));
    await waitFor(() => expect(api.createWebsite).toHaveBeenCalled());
    await user.click(screen.getByText('Edit website'));
    await user.clear(screen.getAllByLabelText('Website name').at(-1)!);
    await user.type(screen.getAllByLabelText('Website name').at(-1)!, 'Docs v2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.updateWebsite).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Disable' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Soft delete' }));
    await waitFor(() => expect(api.deleteWebsite).toHaveBeenCalledWith('p1', 's1'));
    api.updateWebsite.mockRejectedValueOnce(new Error('offline'));
    await user.click(screen.getByRole('button', { name: 'Disable' }));
    expect(await screen.findByText(/operation was interrupted/i)).toBeTruthy();
  });

  it('announces clipboard success', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) }
    });
    render(
      <IntegrationSnippet
        snippet={{
          publicSourceKey: 'public',
          allowedOrigins: ['https://docs.test'],
          tokenIssuer: 'website-owned',
          projectId: 'p1',
          sourceId: 's1',
          html: '<script async src="/vizoalica.js" data-endpoint="https://worker.test/v1/events:batch" data-project="p1" data-source="public" data-token-url="/vizoalica/ingest-token" data-consent="unknown"></script>'
        }}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Copy snippet' }));
    expect(await screen.findByText('Copied to clipboard.')).toBeTruthy();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('data-endpoint="https://worker.test/v1/events:batch"')
    );
    expect(screen.getByText('s1')).toBeTruthy();
  });

  it('reconciles unavailable projects before loading project-bound views', async () => {
    const user = userEvent.setup();
    const secondProject = { id: 'p2', name: 'Beta' };
    api.listProjects
      .mockResolvedValueOnce([project, secondProject])
      .mockResolvedValueOnce([project]);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Projects' }));
    await user.click(screen.getByRole('button', { name: 'Select Beta (p2)' }));
    await user.click(screen.getByRole('button', { name: 'Refresh projects' }));

    expect(await screen.findByText('Project list refreshed.')).toBeTruthy();
    expect(screen.queryByText('Beta')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open websites for Acme (p1)' }));
    await waitFor(() => expect(api.listWebsites).toHaveBeenLastCalledWith('p1'));
    expect(api.listWebsites).not.toHaveBeenCalledWith('p2');
  });

  it('keeps an unavailable snippet uncopyable', () => {
    render(
      <IntegrationSnippet
        snippet={{
          publicSourceKey: 'public',
          allowedOrigins: ['https://site.test'],
          tokenIssuer: 'website-owned'
        }}
      />
    );
    expect(
      (screen.getByRole('button', { name: 'Copy snippet' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByText(/Snippet unavailable/)).toBeTruthy();
  });

  it('clears a successful create form and restores its button after failure', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<WebsiteForm onSubmit={submit} />);
    fireEvent.change(screen.getByLabelText('Website name'), { target: { value: 'Site' } });
    fireEvent.change(screen.getByLabelText('Allowed origins'), {
      target: { value: 'https://site.test' }
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Add website' }).closest('form')!);
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({ name: 'Site', allowedOrigins: ['https://site.test'] })
    );
    await waitFor(() =>
      expect((screen.getByLabelText('Website name') as HTMLInputElement).value).toBe('')
    );
  });

  it('distinguishes revoked access, offline startup, and empty workspaces', async () => {
    api.bootstrapSession.mockRejectedValueOnce(new ApiError('access_revoked', 401));
    const { rerender } = render(<App />);
    expect(await screen.findByText('Authorization required')).toBeTruthy();
    cleanup();
    api.bootstrapSession.mockRejectedValueOnce(new Error('offline'));
    render(<App />);
    expect(await screen.findByText('Workspace unavailable')).toBeTruthy();
    cleanup();
    api.bootstrapSession.mockResolvedValue(undefined);
    api.listProjects.mockResolvedValueOnce([]);
    render(<App />);
    expect(await screen.findByText('Choose a project to view analytics.')).toBeTruthy();
    expect(rerender).toBeTypeOf('function');
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
      await screen.findByText('Access expired. Reauthorize the local workspace.')
    ).toBeTruthy();
    cleanup();
    api.getAnalyticsOverview.mockRejectedValueOnce(new Error('offline'));
    render(<App />);
    expect(
      await screen.findByText('Analytics are unavailable. No stale results are shown.')
    ).toBeTruthy();
  });

  it('shows empty website management and detail lookup recovery states', async () => {
    const user = userEvent.setup();
    api.listWebsites.mockResolvedValue([]);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Websites' }));
    expect(await screen.findByText('No websites yet')).toBeTruthy();
    cleanup();
    api.listWebsites.mockResolvedValue([website]);
    api.getSnippet.mockRejectedValueOnce(new Error('offline'));
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Websites' }));
    expect(
      await screen.findByText('Details are temporarily unavailable. Try again safely.')
    ).toBeTruthy();
  });
});
