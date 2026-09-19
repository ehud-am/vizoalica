// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { ROUTES, scopeControls } from '../src/router.js';
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

const concrete = ROUTES.map((route) => ({
  address: route.path.replace(':id', 's1'),
  controls: scopeControls(route.path)
}));

describe('single scope control', () => {
  it.each(concrete.map((route) => [route.address, route.controls]))(
    '%s shows scope controls in the shell only as its route declares (%s)',
    async (address, controls) => {
      window.location.hash = `#/${address}`;
      render(<App />);
      await screen.findByRole('heading', { level: 1 });
      const bar = screen.queryByRole('region', { name: 'Scope' });
      if (controls === 'none') expect(bar).toBeNull();
      else {
        const shell = bar!;
        expect(within(shell).getAllByLabelText('Project')).toHaveLength(1);
        expect(within(shell).queryAllByLabelText('Website')).toHaveLength(
          controls === 'project-website' ? 1 : 0
        );
      }
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
    await screen.findByRole('heading', { level: 1, name: 'Projects' });
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

  it('offers a path to create a project from every screen that needs one when none exists', async () => {
    api.listProjects.mockResolvedValue([]);
    for (const route of concrete.filter((item) => item.address !== 'manage/projects')) {
      window.location.hash = `#/${route.address}`;
      render(<App />);
      const link = await screen.findByRole('link', { name: 'Create a project' });
      expect(link.getAttribute('href')).toBe('#/manage/projects');
      if (route.controls !== 'none') expect(screen.getByText('No project yet')).toBeTruthy();
      cleanup();
    }
  });

  it('starts on Overview for an unknown route and marks the current destination', async () => {
    window.location.hash = '#/somewhere/else';
    render(<App />);
    const overview = await screen.findByRole('link', { name: 'Overview' });
    expect(overview.getAttribute('aria-current')).toBe('page');
  });

  it('reaches installation from a website: list, website page, Install', async () => {
    window.location.hash = '#/manage/websites';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('link', { name: /Blog/ }));
    await user.click(await screen.findByRole('link', { name: 'Install' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Install on Blog' })).toBeTruthy();
    // There is no top-level Installation destination.
    expect(screen.queryByRole('link', { name: 'Installation' })).toBeNull();
  });

  it('sends the no-page-views hint to the selected website’s Install page, or to the list', async () => {
    const user = userEvent.setup();
    render(<App />);
    const hint = await screen.findByText(/No page views in this range yet/);
    expect(
      within(hint.closest('p')!)
        .getByRole('link', { name: 'check the installation' })
        .getAttribute('href')
    ).toBe('#/manage/websites');
    await within(await scopeBar()).findByRole('option', { name: 'Docs' });
    await user.selectOptions(within(await scopeBar()).getByLabelText('Website'), 's1');
    const forSite = await screen.findByText(/No page views from Docs in this range yet/);
    expect(
      within(forSite.closest('p')!)
        .getByRole('link', { name: 'check the installation' })
        .getAttribute('href')
    ).toBe('#/manage/websites/s1/install');
  });
});
