// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { ApiError } from '../src/api/local-operations.js';
import { connectedState, firstRunState } from './fixtures/setup.js';
import { makeOverview } from './fixtures/console.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  getSetupState: vi.fn(),
  connectBackend: vi.fn(),
  disconnectBackend: vi.fn(),
  setRoleHint: vi.fn(),
  createEnvironment: vi.fn(),
  importLegacySetup: vi.fn(),
  listEnvironments: vi.fn(),
  getDeployPreflight: vi.fn(),
  listProjects: vi.fn(),
  listWebsites: vi.fn(),
  getAnalyticsOverview: vi.fn(),
  getThemePreference: vi.fn(),
  putThemePreference: vi.fn()
}));
vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

beforeEach(() => {
  window.location.hash = '';
  api.bootstrapSession.mockResolvedValue(undefined);
  api.getSetupState.mockResolvedValue(firstRunState());
  api.setRoleHint.mockResolvedValue(firstRunState());
  api.createEnvironment.mockResolvedValue({ active: 'prod', environments: [] });
  api.listEnvironments.mockResolvedValue({ active: null, environments: [] });
  api.getDeployPreflight.mockResolvedValue({
    environment: 'prod',
    names: {
      worker: 'prod-vizoalica-worker',
      database: 'prod-vizoalica-db',
      bucket: 'prod-vizoalica-bucket'
    },
    signedIn: true,
    accounts: [],
    existing: { database: false, bucket: false }
  });
  api.listProjects.mockResolvedValue([{ id: 'p1', name: 'Acme' }]);
  api.listWebsites.mockResolvedValue([]);
  api.getAnalyticsOverview.mockResolvedValue(makeOverview());
  api.getThemePreference.mockResolvedValue({ theme: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

describe('first run', () => {
  it('is shown before anything else, with no navigation and no data requests', async () => {
    render(<App />);
    await heading('Welcome to Vizoalica');
    expect(screen.queryByRole('navigation', { name: 'Primary navigation' })).toBeNull();
    expect(api.listProjects).not.toHaveBeenCalled();
    expect(api.getAnalyticsOverview).not.toHaveBeenCalled();
    // The footer is still there.
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });

  it('offers the three roles as cards, each with a short description', async () => {
    render(<App />);
    await heading('Welcome to Vizoalica');
    const group = screen.getByRole('group', { name: /What role will this machine play\?/ });
    expect(within(group).getAllByRole('button')).toHaveLength(3);
    expect(within(group).queryByRole('radio')).toBeNull();
    expect(within(group).getByText('Set up and run the backend')).toBeTruthy();
    expect(within(group).getByText('Connect my websites to Vizoalica')).toBeTruthy();
    expect(within(group).getByText('Just look at the results')).toBeTruthy();
  });

  it('takes an admin with a backend to the address and administrator secret, in three questions or fewer', async () => {
    const user = userEvent.setup();
    render(<App />);
    await heading('Welcome to Vizoalica'); // question 1
    await user.click(screen.getByRole('button', { name: /Admin/ }));
    await heading('Name your environment'); // question 2
    await user.type(screen.getByLabelText('Environment name'), 'prod');
    await user.click(await screen.findByRole('button', { name: /I already have one/ }));
    await heading('Connect your backend'); // question 3: the credential
    expect(screen.getByLabelText('Backend address')).toBeTruthy();
    expect(screen.getByLabelText('Administrator secret').getAttribute('type')).toBe('password');
    expect(api.setRoleHint).toHaveBeenCalledWith('admin');
    expect(api.createEnvironment).toHaveBeenCalledWith('prod');
  });

  it('refuses to continue past naming an environment with an invalid name', async () => {
    const user = userEvent.setup();
    render(<App />);
    await heading('Welcome to Vizoalica');
    await user.click(screen.getByRole('button', { name: /Admin/ }));
    await heading('Name your environment');
    await user.type(screen.getByLabelText('Environment name'), 'Not Valid');
    await user.click(screen.getByRole('button', { name: /I already have one/ }));
    expect(screen.getByRole('alert').textContent).toContain('lowercase');
    expect(api.createEnvironment).not.toHaveBeenCalled();
  });

  it('connects and lands in the console, without sending the credential anywhere else', async () => {
    const user = userEvent.setup();
    api.connectBackend.mockResolvedValue(connectedState());
    render(<App />);
    await heading('Welcome to Vizoalica');
    await user.click(screen.getByRole('button', { name: /Admin/ }));
    await heading('Name your environment');
    await user.type(screen.getByLabelText('Environment name'), 'prod');
    await user.click(screen.getByRole('button', { name: /I already have one/ }));
    await heading('Connect your backend');
    await user.type(screen.getByLabelText('Backend address'), 'https://w.example.workers.dev');
    await user.type(screen.getByLabelText('Administrator secret'), 'the-secret');
    api.getSetupState.mockResolvedValue(connectedState());
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(api.connectBackend).toHaveBeenCalledWith({
      workerUrl: 'https://w.example.workers.dev',
      credential: 'the-secret',
      roleHint: 'admin'
    });
    await screen.findByRole('navigation', { name: 'Primary navigation' });
    expect(document.body.textContent).not.toContain('the-secret');
  });

  it('takes an admin who needs a backend to the deploy wizard', async () => {
    const user = userEvent.setup();
    api.getDeployPreflight.mockResolvedValue({
      environment: 'prod',
      names: {
        worker: 'prod-vizoalica-worker',
        database: 'prod-vizoalica-db',
        bucket: 'prod-vizoalica-bucket'
      },
      signedIn: true,
      accounts: [{ id: 'a'.repeat(32), name: 'Acme' }],
      existing: { database: false, bucket: false }
    });
    render(<App />);
    await heading('Welcome to Vizoalica');
    await user.click(screen.getByRole('button', { name: /Admin/ }));
    await heading('Name your environment');
    await user.type(screen.getByLabelText('Environment name'), 'prod');
    await user.click(await screen.findByRole('button', { name: /I need a backend/ }));
    await heading('Connect to Cloudflare');
    expect(api.createEnvironment).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Paste a Cloudflare API token/)).toBeTruthy();
    await user.type(screen.getByLabelText('API token'), 'cf-token');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await heading('Set up a backend');
    expect(api.createEnvironment).toHaveBeenCalledWith('prod', {
      mode: 'token',
      token: 'cf-token'
    });
    await screen.findByRole('heading', { name: /Deploy this environment/ });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await heading('Name your environment');
  });

  it('says a missing Cloudflare credential is missing, not that the tool is unreachable', async () => {
    const user = userEvent.setup();
    api.getDeployPreflight.mockRejectedValue(
      new ApiError('backend_deploy_unavailable', 409, undefined, {
        code: 'no_credential',
        title: 'This environment has no Cloudflare credential',
        detail: 'None is saved for this environment.',
        steps: ['Save one below.', 'Then check again.'],
        fix: 'credential'
      })
    );
    render(<App />);
    await heading('Welcome to Vizoalica');
    await user.click(screen.getByRole('button', { name: /Admin/ }));
    await heading('Name your environment');
    await user.type(screen.getByLabelText('Environment name'), 'prod');
    await user.click(await screen.findByRole('button', { name: /I need a backend/ }));
    await heading('Connect to Cloudflare');
    await user.click(screen.getByRole('button', { name: /OneCLI/ }));
    await user.type(screen.getByLabelText('OneCLI project'), 'proj');
    await user.type(screen.getByLabelText('OneCLI agent'), 'agent');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(api.createEnvironment).toHaveBeenCalledWith('prod', {
      mode: 'onecli',
      onecli: { project: 'proj', agent: 'agent', gateway: '127.0.0.1:10255' }
    });
    expect(await screen.findByText(/no Cloudflare credential/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('could not be reached');
  });

  it('takes an analyst straight to the address and access key', async () => {
    const user = userEvent.setup();
    render(<App />);
    await heading('Welcome to Vizoalica');
    await user.click(screen.getByRole('button', { name: /Analyst/ }));
    await heading('Connect as analyst');
    expect(screen.getByLabelText('Access key').getAttribute('type')).toBe('password');
    expect(screen.queryByLabelText('Administrator secret')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await heading('Welcome to Vizoalica');
  });

  it('takes a website owner straight to pasting or uploading their setup details', async () => {
    const user = userEvent.setup();
    render(<App />);
    await heading('Welcome to Vizoalica');
    await user.click(screen.getByRole('button', { name: /Website owner/ }));
    await heading('Connect as website owner');
    expect(screen.getByLabelText('Setup details')).toBeTruthy();
    expect(screen.queryByLabelText('Access key')).toBeNull();
    expect(screen.queryByLabelText('Administrator secret')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await heading('Welcome to Vizoalica');
  });

  it('moves focus to each step heading', async () => {
    const user = userEvent.setup();
    render(<App />);
    const first = await heading('Welcome to Vizoalica');
    await waitFor(() => expect(document.activeElement).toBe(first));
    await user.click(screen.getByRole('button', { name: /Admin/ }));
    const second = await heading('Name your environment');
    await waitFor(() => expect(document.activeElement).toBe(second));
  });

  it('is skipped when a connection exists', async () => {
    api.getSetupState.mockResolvedValue(connectedState());
    render(<App />);
    await screen.findByRole('navigation', { name: 'Primary navigation' });
    expect(screen.queryByRole('heading', { name: 'Welcome to Vizoalica' })).toBeNull();
  });

  it('offers a found pre-0.7.0 setup to name and import before the usual questions', async () => {
    const user = userEvent.setup();
    api.getSetupState.mockResolvedValue(
      firstRunState({ legacySetup: { workerHost: 'worker.example.workers.dev', mode: 'file' } })
    );
    api.importLegacySetup.mockResolvedValue(connectedState());
    render(<App />);
    await heading('We found an existing setup');
    expect(screen.getByText(/worker.example.workers.dev/)).toBeTruthy();
    await user.type(screen.getByLabelText('Environment name'), 'prod');
    api.getSetupState.mockResolvedValue(connectedState());
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(api.importLegacySetup).toHaveBeenCalledWith('prod');
    await screen.findByRole('navigation', { name: 'Primary navigation' });
  });

  it('lets the admin set up something else instead of importing the found setup', async () => {
    const user = userEvent.setup();
    api.getSetupState.mockResolvedValue(
      firstRunState({ legacySetup: { workerHost: 'worker.example.workers.dev', mode: 'file' } })
    );
    render(<App />);
    await heading('We found an existing setup');
    await user.click(screen.getByRole('button', { name: 'Set up something else instead' }));
    await heading('Welcome to Vizoalica');
    expect(api.importLegacySetup).not.toHaveBeenCalled();
  });

  it('does not hold up the next step when remembering the choice fails', async () => {
    api.setRoleHint.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<App />);
    await heading('Welcome to Vizoalica');
    await user.click(screen.getByRole('button', { name: /Analyst/ }));
    await heading('Connect as analyst');
  });
});

describe('connecting', () => {
  async function toForm() {
    const user = userEvent.setup();
    render(<App />);
    await heading('Welcome to Vizoalica');
    await user.click(screen.getByRole('button', { name: /Analyst/ }));
    await heading('Connect as analyst');
    await user.type(screen.getByLabelText('Backend address'), 'https://w.example.workers.dev');
    await user.type(screen.getByLabelText('Access key'), 'vzk_key');
    return user;
  }

  it.each([
    [new ApiError('unauthorized', 401), /did not accept that credential/],
    [new ApiError('unreachable', 503), /could not be reached/],
    [new ApiError('invalid_request', 400), /starts with https/],
    [new ApiError('incompatible', 422), /npm update -g vizoalica/],
    [new Error('boom'), /could not be made/]
  ])('announces a failure in words and keeps what was typed', async (failure, message) => {
    api.connectBackend.mockRejectedValue(failure);
    const user = await toForm();
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(message);
    expect((screen.getByLabelText('Backend address') as HTMLInputElement).value).toBe(
      'https://w.example.workers.dev'
    );
  });

  it('cannot be submitted twice while connecting', async () => {
    let finish: (value: unknown) => void = () => undefined;
    api.connectBackend.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = await toForm();
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(screen.getByRole('button', { name: 'Connecting…' })).toBeTruthy();
    expect(api.connectBackend).toHaveBeenCalledTimes(1);
    finish(connectedState('analyst'));
  });
});
