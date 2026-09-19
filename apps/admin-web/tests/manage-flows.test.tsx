// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { ApiError } from '../src/api/local-operations.js';
import { IntegrationSnippet } from '../src/components/IntegrationSnippet.js';
import { WebsiteForm } from '../src/components/WebsiteForm.js';
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

describe('Manage > Websites', () => {
  it('creates, edits, disables, and deletes websites with in-console confirmation', async () => {
    goTo('manage/websites');
    const user = userEvent.setup();
    const nativeConfirm = vi.spyOn(window, 'confirm');
    render(<App />);
    await screen.findByRole('heading', { name: 'Websites' });
    const form = screen.getByRole('form', { name: 'Add website' });
    await user.selectOptions(form.querySelector('select')!, 'p1');
    await user.type(within(form).getByLabelText('Website name'), 'Marketing');
    await user.type(within(form).getByLabelText('Allowed origins'), 'https://marketing.test');
    await user.click(within(form).getByRole('button', { name: 'Add website' }));
    await waitFor(() =>
      expect(api.createWebsite).toHaveBeenCalledWith('p1', {
        name: 'Marketing',
        allowedOrigins: ['https://marketing.test']
      })
    );
    expect(await screen.findByText(/Website Docs created in project Acme \(p1\)\./)).toBeTruthy();

    const edit = await screen.findByRole('form', { name: 'Edit website' });
    await user.clear(within(edit).getByLabelText('Website name'));
    await user.type(within(edit).getByLabelText('Website name'), 'Docs v2');
    await user.click(within(edit).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.updateWebsite).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Disable website…' }));
    const disable = screen.getByRole('alertdialog', { name: 'Disable Docs?' });
    expect(within(disable).getByText(/stop collecting new events/)).toBeTruthy();
    await user.click(within(disable).getByRole('button', { name: 'Disable website' }));
    await waitFor(() =>
      expect(api.updateWebsite).toHaveBeenLastCalledWith('p1', 's1', { status: 'disabled' })
    );

    await user.click(screen.getByRole('button', { name: 'Delete website…' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Docs?' });
    expect(within(dialog).getByText(/permanent/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Delete website' }));
    await waitFor(() => expect(api.deleteWebsite).toHaveBeenCalledWith('p1', 's1'));
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it('does not delete a website when the operator cancels, and reports an interrupted change', async () => {
    goTo('manage/websites');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Docs/ }));
    await user.click(await screen.findByRole('button', { name: 'Delete website…' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.deleteWebsite).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    api.updateWebsite.mockRejectedValueOnce(new Error('offline'));
    await user.click(screen.getByRole('button', { name: 'Disable website…' }));
    await user.click(screen.getByRole('button', { name: 'Disable website' }));
    expect(await screen.findByText(/operation was interrupted/i)).toBeTruthy();
  });

  it('offers Enable for a disabled website without a confirmation', async () => {
    api.listWebsites.mockResolvedValue([{ ...website, status: 'disabled' }]);
    goTo('manage/websites');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Docs/ }));
    await user.click(await screen.findByRole('button', { name: 'Enable website' }));
    await waitFor(() =>
      expect(api.updateWebsite).toHaveBeenCalledWith('p1', 's1', { status: 'active' })
    );
    expect(await screen.findByText(/Website Docs enabled/)).toBeTruthy();
  });

  it('creates a website only after confirming a non-current project', async () => {
    const target = { id: 'p2', name: 'Beta' };
    api.listProjects.mockResolvedValue([project, target]);
    api.createWebsite.mockResolvedValue({ ...website, id: 's2', projectId: 'p2', name: 'Launch' });
    goTo('manage/websites');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Websites' });
    const form = screen.getByRole('form', { name: 'Add website' });
    // The project is the first field of the form and is not pre-filled from the current scope.
    expect(form.querySelector('select')!.value).toBe('');
    await user.selectOptions(form.querySelector('select')!, 'p2');
    await user.type(within(form).getByLabelText('Website name'), 'Launch');
    await user.type(within(form).getByLabelText('Allowed origins'), 'https://launch.test');
    await user.click(within(form).getByRole('button', { name: 'Add website' }));

    await waitFor(() =>
      expect(api.createWebsite).toHaveBeenCalledWith('p2', {
        name: 'Launch',
        allowedOrigins: ['https://launch.test']
      })
    );
    expect(await screen.findByText('Website Launch created in project Beta (p2).')).toBeTruthy();
    const scopeBar = screen.getByRole('region', { name: 'Scope' });
    expect((within(scopeBar).getByLabelText('Project') as HTMLSelectElement).value).toBe('p2');
  });

  it('preserves a website draft when the selected project becomes unavailable', async () => {
    const target = { id: 'p2', name: 'Beta' };
    api.listProjects.mockResolvedValue([project, target]);
    api.createWebsite.mockRejectedValueOnce(new ApiError('not_found', 404));
    goTo('manage/websites');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Websites' });
    const form = screen.getByRole('form', { name: 'Add website' });
    await user.selectOptions(form.querySelector('select')!, 'p2');
    await user.type(within(form).getByLabelText('Website name'), 'Retained draft');
    await user.type(within(form).getByLabelText('Allowed origins'), 'https://retained.test');
    await user.click(within(form).getByRole('button', { name: 'Add website' }));

    expect(
      await screen.findByText(
        'The selected project is no longer available. Your entries were preserved.'
      )
    ).toBeTruthy();
    expect((within(form).getByLabelText('Website name') as HTMLInputElement).value).toBe(
      'Retained draft'
    );
  });

  it('reports an interrupted creation that is not a missing project', async () => {
    api.createWebsite.mockRejectedValueOnce(new Error('offline'));
    goTo('manage/websites');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Websites' });
    const form = screen.getByRole('form', { name: 'Add website' });
    await user.selectOptions(form.querySelector('select')!, 'p1');
    await user.type(within(form).getByLabelText('Website name'), 'X');
    await user.type(within(form).getByLabelText('Allowed origins'), 'https://x.test');
    await user.click(within(form).getByRole('button', { name: 'Add website' }));
    expect(
      await screen.findByText('Website creation was interrupted. Your entries were preserved.')
    ).toBeTruthy();
  });

  it('shows an empty project and a prompt to choose a website', async () => {
    api.listWebsites.mockResolvedValue([]);
    goTo('manage/websites');
    render(<App />);
    expect(await screen.findByText('No websites yet')).toBeTruthy();
    expect(
      screen.getByText('Select a website from the list to edit, disable, or delete it.')
    ).toBeTruthy();
  });
});

describe('Manage > Installation and Health', () => {
  it('lists websites to set up when none is in scope, then shows ordered steps and the snippet', async () => {
    goTo('manage/installation');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Set up Docs' }));
    expect(
      await screen.findByText(/Choose the static or dynamic installation option/)
    ).toBeTruthy();
    expect(await screen.findByText('Connect this website')).toBeTruthy();
    expect(api.getSnippet).toHaveBeenCalledWith('p1', 's1');
  });

  it('points to adding a website when the project has none, and recovers from a lookup failure', async () => {
    api.listWebsites.mockResolvedValue([]);
    goTo('manage/installation');
    render(<App />);
    expect(await screen.findByRole('link', { name: 'Add a website' })).toBeTruthy();
    cleanup();
    api.listWebsites.mockResolvedValue([website]);
    api.getSnippet.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Set up Docs' }));
    expect(
      await screen.findByText('Installation details are temporarily unavailable. Try again safely.')
    ).toBeTruthy();
  });

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

describe('clipboard and forms', () => {
  it('announces clipboard success', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) }
    });
    render(<IntegrationSnippet snippet={primaryIntegration} />);
    await user.click(screen.getByRole('button', { name: 'Copy static snippet' }));
    expect(await screen.findByText('Static snippet copied to clipboard.')).toBeTruthy();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('data-endpoint="https://worker.test/v1/events:batch"')
    );
  });

  it('keeps an unavailable snippet uncopyable', () => {
    render(
      <IntegrationSnippet
        snippet={{ ...primaryIntegration, html: undefined, modes: undefined as never }}
      />
    );
    expect(
      (screen.getByRole('button', { name: 'Copy static snippet' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByText(/Snippet unavailable/)).toBeTruthy();
  });

  it('clears a successful create form and restores its button after failure', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<WebsiteForm projects={[project]} onSubmit={submit} />);
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Website name'), { target: { value: 'Site' } });
    fireEvent.change(screen.getByLabelText('Allowed origins'), {
      target: { value: 'https://site.test' }
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Add website' }).closest('form')!);
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        projectId: 'p1',
        name: 'Site',
        allowedOrigins: ['https://site.test']
      })
    );
    await waitFor(() =>
      expect((screen.getByLabelText('Website name') as HTMLInputElement).value).toBe('')
    );
  });
});
