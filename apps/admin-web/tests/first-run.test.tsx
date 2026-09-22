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
    await heading('Who are you?');
    expect(screen.queryByRole('navigation', { name: 'Primary navigation' })).toBeNull();
    expect(api.listProjects).not.toHaveBeenCalled();
    expect(api.getAnalyticsOverview).not.toHaveBeenCalled();
    // The footer is still there.
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });

  it('offers the three roles in a labeled radio group with what each allows', async () => {
    render(<App />);
    await heading('Who are you?');
    const group = screen.getByRole('group', { name: 'Who are you?' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(within(group).getByText(/I look after the backend/)).toBeTruthy();
    expect(within(group).getByText(/I need to make a website send data/)).toBeTruthy();
    expect(within(group).getByText(/I only look at results/)).toBeTruthy();
    expect(within(group).getByText(/Cannot change the backend/)).toBeTruthy();
    expect(within(group).getByText(/Changes nothing/)).toBeTruthy();
    expect((radios[0] as HTMLInputElement).checked).toBe(true);
  });

  it('takes an admin with a backend to the address and administrator secret, in three questions or fewer', async () => {
    const user = userEvent.setup();
    render(<App />);
    await heading('Who are you?'); // question 1
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await heading('Name your environment, and do you have a backend?'); // question 2
    await user.type(screen.getByLabelText('Environment name'), 'prod');
    await user.click(screen.getByRole('radio', { name: /I already have one/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await heading('Connect your backend'); // question 3: the credential
    expect(screen.getByLabelText('Backend address')).toBeTruthy();
    expect(screen.getByLabelText('Administrator secret').getAttribute('type')).toBe('password');
    expect(api.setRoleHint).toHaveBeenCalledWith('admin');
    expect(api.createEnvironment).toHaveBeenCalledWith('prod');
  });

  it('refuses to continue past naming an environment with an invalid name', async () => {
    const user = userEvent.setup();
    render(<App />);
    await heading('Who are you?');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await heading('Name your environment, and do you have a backend?');
    await user.type(screen.getByLabelText('Environment name'), 'Not Valid');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert').textContent).toContain('lowercase');
    expect(api.createEnvironment).not.toHaveBeenCalled();
  });

  it('connects and lands in the console, without sending the credential anywhere else', async () => {
    const user = userEvent.setup();
    api.connectBackend.mockResolvedValue(connectedState());
    render(<App />);
    await heading('Who are you?');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await heading('Name your environment, and do you have a backend?');
    await user.type(screen.getByLabelText('Environment name'), 'prod');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
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

  it('explains that deploying from the console comes later in the release, and where to start now', async () => {
    const user = userEvent.setup();
    render(<App />);
    await heading('Who are you?');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await heading('Name your environment, and do you have a backend?');
    await user.type(screen.getByLabelText('Environment name'), 'prod');
    await user.click(await screen.findByRole('radio', { name: /I need a backend/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await heading('Set up a backend');
    expect(
      within(screen.getByRole('main'))
        .getByRole('link', { name: /getting started guide/ })
        .getAttribute('href')
    ).toBe('https://vizoalica.dev/get-started');
    expect(api.createEnvironment).toHaveBeenCalledWith('prod');
    await user.click(screen.getByRole('button', { name: /I have deployed it/ }));
    await heading('Connect your backend');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await heading('Name your environment, and do you have a backend?');
  });

  it.each([
    ['Website owner', 'Connect as website owner'],
    ['Analyst', 'Connect as analyst']
  ])('takes a %s straight to the address and access key', async (label, title) => {
    const user = userEvent.setup();
    render(<App />);
    await heading('Who are you?');
    await user.click(screen.getByRole('radio', { name: new RegExp(label) }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await heading(title);
    expect(screen.getByLabelText('Access key').getAttribute('type')).toBe('password');
    expect(screen.queryByLabelText('Administrator secret')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await heading('Who are you?');
  });

  it('moves focus to each step heading', async () => {
    const user = userEvent.setup();
    render(<App />);
    const first = await heading('Who are you?');
    await waitFor(() => expect(document.activeElement).toBe(first));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    const second = await heading('Name your environment, and do you have a backend?');
    await waitFor(() => expect(document.activeElement).toBe(second));
  });

  it('is skipped when a connection exists', async () => {
    api.getSetupState.mockResolvedValue(connectedState());
    render(<App />);
    await screen.findByRole('navigation', { name: 'Primary navigation' });
    expect(screen.queryByRole('heading', { name: 'Who are you?' })).toBeNull();
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
    await heading('Who are you?');
    expect(api.importLegacySetup).not.toHaveBeenCalled();
  });

  it('does not hold up the next step when remembering the choice fails', async () => {
    api.setRoleHint.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<App />);
    await heading('Who are you?');
    await user.click(screen.getByRole('radio', { name: /Analyst/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await heading('Connect as analyst');
  });
});

describe('connecting', () => {
  async function toForm() {
    const user = userEvent.setup();
    render(<App />);
    await heading('Who are you?');
    await user.click(screen.getByRole('radio', { name: /Analyst/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
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
