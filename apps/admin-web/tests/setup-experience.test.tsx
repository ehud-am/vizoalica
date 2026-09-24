// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import type { SetupState, ViewRole } from '../src/api/local-operations.js';
import { makeActionsReport, makeOverview, primaryIntegration } from './fixtures/console.js';
import { connectedState, stages } from './fixtures/setup.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  getSetupState: vi.fn(),
  connectBackend: vi.fn(),
  disconnectBackend: vi.fn(),
  setRoleHint: vi.fn(),
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
  getAnalyticsActions: vi.fn(),
  getThemePreference: vi.fn(),
  putThemePreference: vi.fn()
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
  window.location.hash = '';
  api.bootstrapSession.mockResolvedValue(undefined);
  api.getSetupState.mockResolvedValue(connectedState());
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
  api.getAnalyticsOverview.mockResolvedValue(makeOverview());
  api.getThemePreference.mockResolvedValue({ theme: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const serve = (state: SetupState) => api.getSetupState.mockResolvedValue(state);
const at = (address: string) => {
  window.location.hash = `#/${address}`;
  return render(<App />);
};
const withScope = (role: ViewRole, projectId: string | null, sourceId: string | null) => {
  const state = connectedState(role);
  return { ...state, principal: { ...state.principal!, scope: { projectId, sourceId } } };
};

/** Every control that would change something, for a screen that has finished loading. */
const mutating = () => Array.from(document.querySelectorAll<HTMLElement>('main [data-capability]'));

describe('an analyst', () => {
  const manage = [
    'manage/projects',
    'manage/websites',
    'manage/websites/new',
    'manage/websites/s1',
    'manage/websites/s1/edit'
  ];

  it.each(manage.map((address) => [address]))(
    '%s shows every change control unavailable, explained, focusable, and inert',
    async (address) => {
      serve(connectedState('analyst'));
      at(address);
      await waitFor(() => expect(document.querySelector('main [data-page]')).toBeTruthy());
      await screen.findAllByText(/Your access is read-only\./);
      const controls = mutating();
      expect(controls.length).toBeGreaterThan(0);
      const user = userEvent.setup();
      for (const control of controls) {
        expect(control.getAttribute('aria-disabled'), control.textContent ?? '').toBe('true');
        expect((control as HTMLButtonElement).disabled).toBe(false);
        const reason = document.getElementById(control.getAttribute('aria-describedby') ?? '');
        expect(reason?.textContent).toContain('Your access is read-only.');
        control.focus();
        expect(document.activeElement).toBe(control);
        await user.click(control);
        await user.keyboard('{Enter}');
        await user.keyboard(' ');
      }
      for (const mutation of MUTATIONS) expect(mutation).not.toHaveBeenCalled();
    }
  );

  it('cannot create a project by pressing Enter in the name field', async () => {
    serve(connectedState('analyst'));
    at('manage/projects');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Project name'), 'Sneaky{Enter}');
    expect(api.createProject).not.toHaveBeenCalled();
  });

  it('can still read everything', async () => {
    serve(connectedState('analyst'));
    at('manage/websites/s1/install');
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(api.getSnippet).toHaveBeenCalled());
    cleanup();
    at('analytics/overview');
    await waitFor(() => expect(api.getAnalyticsOverview).toHaveBeenCalled());
  });
});

describe('a website owner', () => {
  it('cannot create a project or website outside a one-website scope, but can manage that website', async () => {
    serve(withScope('owner', 'p1', 's1'));
    at('manage/projects');
    await screen.findByLabelText('Project name');
    const create = screen.getByRole('button', { name: /Create project/ });
    expect(create.getAttribute('aria-disabled')).toBe('true');
    expect(
      document.getElementById(create.getAttribute('aria-describedby')!)?.textContent
    ).toContain('Your access does not allow creating this here.');
    cleanup();
    at('manage/websites/s1');
    const disable = await screen.findByRole('button', { name: /Disable website/ });
    expect(disable.getAttribute('aria-disabled')).toBeNull();
    expect(
      screen.getByRole('button', { name: /Delete website/ }).getAttribute('aria-disabled')
    ).toBeNull();
    expect(screen.getByRole('link', { name: 'Edit' })).toBeTruthy();
  });

  it('can create projects with a key that covers everything', async () => {
    serve(withScope('owner', null, null));
    api.createProject.mockResolvedValue({ id: 'p2', name: 'New' });
    at('manage/projects');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Project name'), 'New');
    await user.click(screen.getByRole('button', { name: /Create project/ }));
    await waitFor(() => expect(api.createProject).toHaveBeenCalledWith('New'));
  });
});

describe('an admin', () => {
  it('asks the backend again after creating a project, so the journey moves on', async () => {
    api.createProject.mockResolvedValue({ id: 'p2', name: 'New' });
    at('manage/projects');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Project name'), 'New');
    const before = api.getSetupState.mock.calls.length;
    await user.click(screen.getByRole('button', { name: /Create project/ }));
    await waitFor(() => expect(api.getSetupState.mock.calls.length).toBeGreaterThan(before));
  });

  it('sees no explanation on controls that work', async () => {
    at('manage/projects');
    await screen.findByLabelText('Project name');
    expect(document.querySelector('.control-reason')).toBeNull();
  });
});

describe('when the backend is not answering', () => {
  const unreachable = (): SetupState => ({
    ...connectedState(),
    connection: { status: 'unreachable', workerHost: 'w.example.workers.dev', mode: 'file' },
    stages: stages(['done', 'blocked', 'blocked', 'blocked'], {
      id: 'check-backend',
      label: 'The backend is not answering. Check it and retry.',
      href: '#/setup'
    })
  });

  it('says so on every screen, marks the stages blocked, and holds back changes', async () => {
    serve(unreachable());
    at('manage/projects');
    await screen.findByLabelText('Project name');
    const alert = screen
      .getAllByRole('alert')
      .find((item) => /not answering/.test(item.textContent ?? ''));
    expect(alert).toBeTruthy();
    expect(screen.getAllByText('Blocked').length).toBe(3);
    const create = screen.getByRole('button', { name: /Create project/ });
    expect(
      document.getElementById(create.getAttribute('aria-describedby')!)?.textContent
    ).toContain('The backend is not answering. Check it and retry.');
  });

  it('asks again when told to try again', async () => {
    serve(unreachable());
    at('manage/projects');
    const user = userEvent.setup();
    const alert = (await screen.findAllByRole('alert')).find((item) =>
      /not answering/.test(item.textContent ?? '')
    )!;
    serve(connectedState());
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(
        screen.queryByText(/The backend is not answering\. Your websites keep collecting/)
      ).toBeNull()
    );
  });

  it('shows the offline screen, with the connection below it, when the data cannot be read', async () => {
    serve(unreachable());
    api.listProjects.mockRejectedValue(new Error('offline'));
    at('analytics/overview');
    expect(await screen.findByText('Workspace unavailable')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Connection' })).toBeTruthy();
    expect(screen.getByText('The backend is not answering')).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });
});

describe('a saved credential the backend rejects', () => {
  it('shows authorization required with the way to reconnect, and no stale data', async () => {
    serve({
      ...connectedState(),
      connection: { status: 'revoked', workerHost: 'w.example.workers.dev', mode: 'file' },
      stages: stages(['done', 'current', 'todo', 'todo'], { id: 'reconnect', label: 'x' })
    });
    at('analytics/overview');
    expect(await screen.findByText('Authorization required')).toBeTruthy();
    expect(screen.getByLabelText('Backend address')).toBeTruthy();
    expect(api.listProjects).not.toHaveBeenCalled();
    expect(api.getAnalyticsOverview).not.toHaveBeenCalled();
  });
});

describe('a backend this console cannot work with', () => {
  it('explains what to do and offers the connection screen instead of the console', async () => {
    serve({
      ...connectedState(),
      connection: { status: 'incompatible', workerHost: 'w.example.workers.dev', mode: 'file' },
      backend: {
        ...connectedState().backend!,
        message:
          'The database schema (3) is newer than this console expects (1). Update the console: npm update -g vizoalica'
      }
    });
    at('analytics/overview');
    expect(await screen.findByRole('heading', { level: 1, name: 'Connection' })).toBeTruthy();
    expect(screen.getByText(/npm update -g vizoalica/)).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Primary navigation' })).toBeNull();
    expect(api.listProjects).not.toHaveBeenCalled();
  });
});

describe('the Connection screen', () => {
  it('shows who is connected and to what', async () => {
    serve(connectedState('owner'));
    at('setup');
    expect(await screen.findByRole('heading', { level: 1, name: 'Connection' })).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByText('w.example.workers.dev')).toBeTruthy();
    expect(screen.getByText('Website owner (Jane)')).toBeTruthy();
    expect(screen.getByText(/Worker 0\.6\.3 · Console 0\.6\.3/)).toBeTruthy();
  });

  it('changes only the remembered role', async () => {
    serve(connectedState());
    api.setRoleHint.mockResolvedValue(connectedState());
    at('setup');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /Analyst/ }));
    expect(api.setRoleHint).toHaveBeenCalledWith('analyst');
  });

  it('says when the role could not be saved', async () => {
    serve(connectedState());
    api.setRoleHint.mockRejectedValue(new Error('nope'));
    at('setup');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /Analyst/ }));
    expect((await screen.findByText(/role could not be saved/)).getAttribute('role')).toBe('alert');
  });

  it('disconnects after a confirmation and returns to first run', async () => {
    serve(connectedState());
    api.disconnectBackend.mockImplementation(async () => {
      const state = {
        ...connectedState(),
        needsFirstRun: true,
        connection: { status: 'none' as const },
        principal: undefined,
        stages: stages(['done', 'current', 'todo', 'todo'], { id: 'connect-backend', label: 'x' })
      };
      api.getSetupState.mockResolvedValue(state);
      return state;
    });
    at('setup');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Disconnect…' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Your backend and your data are not touched');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.disconnectBackend).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Disconnect…' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Disconnect' })
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome to Vizoalica' })).toBeTruthy();
  });

  it('says when disconnecting failed', async () => {
    serve(connectedState());
    api.disconnectBackend.mockRejectedValue(new Error('nope'));
    at('setup');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Disconnect…' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Disconnect' })
    );
    expect(await screen.findByText(/could not be removed/)).toBeTruthy();
  });

  it('replaces the connection with a new one', async () => {
    serve(connectedState());
    api.connectBackend.mockResolvedValue(connectedState());
    at('setup');
    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText('Backend address'),
      'https://other.example.workers.dev'
    );
    await user.type(screen.getByLabelText('Administrator secret'), 'new-secret');
    await user.click(screen.getByRole('button', { name: 'Replace connection' }));
    await waitFor(() =>
      expect(api.connectBackend).toHaveBeenCalledWith({
        workerUrl: 'https://other.example.workers.dev',
        credential: 'new-secret',
        roleHint: 'admin'
      })
    );
  });

  it('keeps a OneCLI secret out of reach and hides the form', async () => {
    const state = connectedState();
    serve({ ...state, connection: { ...state.connection, mode: 'onecli' } });
    at('setup');
    expect(await screen.findByText(/keeps the administrator secret in OneCLI/)).toBeTruthy();
    expect(screen.queryByLabelText('Administrator secret')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disconnect…' })).toBeNull();
  });

  it('explains a state it cannot reach the backend in', async () => {
    serve({
      ...connectedState(),
      connection: { status: 'unreachable', workerHost: 'w.example.workers.dev', mode: 'file' },
      stages: stages(['done', 'blocked', 'blocked', 'blocked'], { id: 'x', label: 'x' })
    });
    at('setup');
    expect((await screen.findAllByText(/Your websites keep collecting/)).length).toBeGreaterThan(0);
  });
});

describe('a console that could not ask how far along it is', () => {
  it('carries on as before, holding nothing back and showing no journey', async () => {
    api.getSetupState.mockRejectedValue(new Error('older service'));
    at('manage/projects');
    await screen.findByLabelText('Project name');
    expect(document.querySelector('.journey')).toBeNull();
    expect(document.querySelector('.control-reason')).toBeNull();
  });
});

describe('analytics screens', () => {
  it('explain what is missing when there is nothing to show yet', async () => {
    serve(
      connectedState('admin', {
        stages: stages(['done', 'done', 'done', 'current'], {
          id: 'install-website',
          label: 'Follow the install steps, then check',
          href: '#/manage/websites/s1/install'
        })
      })
    );
    at('analytics/overview');
    await waitFor(() =>
      expect(document.querySelector('.dashboard-card:not(.skeleton)')).toBeTruthy()
    );
    const hint = await screen.findByText(/no data has arrived/);
    expect(hint.closest('.notice')?.getAttribute('role')).toBe('status');
    expect(
      within(hint.closest('.notice') as HTMLElement).getByRole('link', { name: /install steps/ })
    ).toBeTruthy();
  });
});
