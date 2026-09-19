// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { ROUTES } from '../src/router.js';
import { makeOverview, primaryIntegration } from './fixtures/console.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  listProjects: vi.fn(),
  listWebsites: vi.fn(),
  getSnippet: vi.fn(),
  getStatus: vi.fn(),
  getReachability: vi.fn(),
  getAnalyticsOverview: vi.fn()
}));
vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

const acme = { id: 'p1', name: 'Acme' };
const beta = { id: 'p2', name: 'Beta' };
const site = (id: string, projectId: string, name: string) => ({
  id,
  projectId,
  name,
  publicSourceKey: `key-${id}`,
  allowedOrigins: [`https://${id}.test`],
  status: 'active' as const
});

beforeEach(() => {
  api.bootstrapSession.mockResolvedValue(undefined);
  api.listProjects.mockResolvedValue([acme, beta]);
  api.listWebsites.mockImplementation(async (projectId: string) =>
    projectId === 'p1'
      ? [site('s1', 'p1', 'Docs'), site('s2', 'p1', 'Blog')]
      : [site('s3', 'p2', 'Shop')]
  );
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
  api.getAnalyticsOverview.mockResolvedValue(makeOverview());
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const scopeBar = () => screen.findByRole('region', { name: 'Scope' });

describe('single scope control', () => {
  it.each(ROUTES.filter((route) => route.path !== 'manage/projects').map((route) => [route.path]))(
    '%s shows exactly one project and one website control, both in the shell',
    async (path) => {
      window.location.hash = `#/${path}`;
      render(<App />);
      const bar = await scopeBar();
      expect(within(bar).getAllByLabelText('Project')).toHaveLength(1);
      expect(within(bar).getAllByLabelText('Website')).toHaveLength(1);
      // Outside the shell there is at most the add-website form's explicit project field.
      const outside = Array.from(document.querySelectorAll('main select')).filter(
        (select) => !select.closest('form[aria-label="Add website"]')
      );
      expect(outside).toHaveLength(0);
    }
  );

  it('hides the project controls on Projects and the time range outside Analytics', async () => {
    window.location.hash = '#/manage/projects';
    render(<App />);
    await screen.findByRole('heading', { name: 'Projects' });
    expect(screen.queryByRole('region', { name: 'Scope' })).toBeNull();
    window.location.hash = '#/manage/websites';
    const bar = await scopeBar();
    expect(within(bar).queryByRole('button', { name: /^Last/ })).toBeNull();
    window.location.hash = '#/analytics/overview';
    expect(await within(await scopeBar()).findByRole('button', { name: /^Last/ })).toBeTruthy();
  });

  it('keeps the scope across screens and restores it after a reload', async () => {
    const user = userEvent.setup();
    render(<App />);
    const bar = await scopeBar();
    await user.selectOptions(within(bar).getByLabelText('Project'), 'p2');
    await within(bar).findByRole('option', { name: 'Shop' });
    await user.selectOptions(within(bar).getByLabelText('Website'), 's3');
    await user.click(screen.getByRole('link', { name: 'Health' }));
    expect(await screen.findByRole('heading', { name: 'Shop' })).toBeTruthy();
    expect((within(bar).getByLabelText('Project') as HTMLSelectElement).value).toBe('p2');
    await user.click(screen.getByRole('link', { name: 'Geography' }));
    await waitFor(() =>
      expect(api.getAnalyticsOverview).toHaveBeenLastCalledWith(
        'p2',
        's3',
        expect.any(String),
        expect.any(String),
        expect.any(AbortSignal)
      )
    );
    cleanup();

    render(<App />);
    const restored = await scopeBar();
    await within(restored).findByRole('option', { name: 'Shop' });
    await waitFor(() =>
      expect((within(restored).getByLabelText('Website') as HTMLSelectElement).value).toBe('s3')
    );
    expect((within(restored).getByLabelText('Project') as HTMLSelectElement).value).toBe('p2');
  });

  it('does not refetch analytics when moving between Analytics views in the same scope', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(api.getAnalyticsOverview).toHaveBeenCalledTimes(2));
    await user.click(await screen.findByRole('link', { name: 'Technology' }));
    await screen.findByRole('heading', { name: 'Technology' });
    await user.click(screen.getByRole('link', { name: 'Traffic quality' }));
    await screen.findByRole('heading', { name: 'Traffic quality' });
    expect(api.getAnalyticsOverview).toHaveBeenCalledTimes(2);
  });

  it('explains what changed when a remembered project no longer exists', async () => {
    window.localStorage.setItem(
      'vizoalica.console.scope',
      JSON.stringify({ projectId: 'gone', websiteId: '' })
    );
    render(<App />);
    expect(await screen.findByText(/Your previous project is no longer available/)).toBeTruthy();
  });

  it('offers a path to create a project from every scope-bound screen when none exists', async () => {
    api.listProjects.mockResolvedValue([]);
    for (const route of ROUTES.filter((item) => item.path !== 'manage/projects')) {
      window.location.hash = `#/${route.path}`;
      render(<App />);
      const link = await screen.findByRole('link', { name: 'Create a project' });
      expect(link.getAttribute('href')).toBe('#/manage/projects');
      expect(screen.getByText('No project yet')).toBeTruthy();
      cleanup();
    }
  });

  it('starts on Overview for an unknown route and marks the current destination', async () => {
    window.location.hash = '#/somewhere/else';
    render(<App />);
    const overview = await screen.findByRole('link', { name: 'Overview' });
    expect(overview.getAttribute('aria-current')).toBe('page');
  });

  it('offers a link to set up a website when installing with no website in scope', async () => {
    window.location.hash = '#/manage/installation';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Set up Blog' }));
    expect(await screen.findByText(/Add the snippet or public configuration to Blog/)).toBeTruthy();
    expect((within(await scopeBar()).getByLabelText('Website') as HTMLSelectElement).value).toBe(
      's2'
    );
  });
});
