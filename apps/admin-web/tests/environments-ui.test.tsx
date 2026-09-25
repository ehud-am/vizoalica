// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import type { EnvironmentsList } from '../src/api/local-operations.js';
import { EnvironmentPicker } from '../src/setup/EnvironmentPicker.js';
import { Welcome } from '../src/setup/Welcome.js';
import { DEFAULT_ENVIRONMENTS } from './setup.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  listEnvironments: vi.fn(),
  recheckEnvironments: vi.fn(),
  selectEnvironment: vi.fn(),
  getSetupState: vi.fn(),
  listProjects: vi.fn(),
  listWebsites: vi.fn(),
  getAnalyticsOverview: vi.fn()
}));
vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

const list = (overrides: Partial<EnvironmentsList> = {}): EnvironmentsList => ({
  ...(DEFAULT_ENVIRONMENTS as EnvironmentsList),
  ...overrides
});
const environment = (
  name: string,
  usable = true,
  problem = 'The Worker rejected this secret.'
) => ({
  name,
  role: 'admin' as const,
  cloudflare: 'none' as const,
  usable,
  problems: usable ? [] : [{ code: 'unauthorized', message: problem }]
});

beforeEach(() => {
  api.bootstrapSession.mockResolvedValue(undefined);
  api.listEnvironments.mockResolvedValue(list());
  api.getSetupState.mockRejectedValue(new Error('offline'));
  api.listProjects.mockResolvedValue([]);
  api.listWebsites.mockResolvedValue([]);
  api.getAnalyticsOverview.mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Welcome', () => {
  it('explains that no environment exists and names the command to add one', () => {
    render(
      <Welcome
        list={list({ environments: [], selected: null })}
        checking={false}
        onRecheck={() => undefined}
      />
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome to Vizoalica' })).toBeTruthy();
    expect(screen.getByText('No environments are set up yet.')).toBeTruthy();
    expect(screen.getByText('vizoalica env add <name>')).toBeTruthy();
  });

  it('says what is wrong with each environment and how to fix it', () => {
    render(
      <Welcome
        list={list({
          environments: [
            environment('prod', false),
            environment('dev', false, 'It did not answer.')
          ],
          selected: null
        })}
        checking={false}
        onRecheck={() => undefined}
      />
    );
    const items = screen.getAllByRole('listitem').filter((item) => item.querySelector('strong'));
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('The Worker rejected this secret.')).toBeTruthy();
    expect(screen.getByText('vizoalica env update prod')).toBeTruthy();
    expect(screen.getByText('vizoalica env update dev')).toBeTruthy();
  });

  it('says a broken file is broken, with its path and reason', () => {
    render(
      <Welcome
        list={list({
          file: {
            status: 'broken',
            path: '/h/environments.json',
            reason: 'The file is not valid JSON.'
          },
          environments: [],
          selected: null
        })}
        checking={false}
        onRecheck={() => undefined}
      />
    );
    expect(screen.getByRole('alert').textContent).toContain('The file is not valid JSON.');
    expect(screen.getByText('/h/environments.json')).toBeTruthy();
  });

  it('checks again on request, and is disabled while checking', async () => {
    const onRecheck = vi.fn();
    const { rerender } = render(
      <Welcome
        list={list({ environments: [], selected: null })}
        checking={false}
        onRecheck={onRecheck}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(onRecheck).toHaveBeenCalledTimes(1);
    rerender(<Welcome list={undefined} checking onRecheck={onRecheck} />);
    expect((screen.getByRole('button', { name: 'Checking…' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('offers no way to create, edit, or delete an environment', () => {
    render(
      <Welcome
        list={list({ environments: [], selected: null })}
        checking={false}
        onRecheck={() => undefined}
      />
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('EnvironmentPicker', () => {
  it('shows nothing without a selection, and a plain label for a single environment', () => {
    const { container, rerender } = render(
      <EnvironmentPicker list={undefined} onChanged={() => undefined} />
    );
    expect(container.textContent).toBe('');
    rerender(<EnvironmentPicker list={list()} onChanged={() => undefined} />);
    expect(screen.getByText('dev')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('lists every environment, disables unusable ones with their reason, and selects the chosen one', async () => {
    api.selectEnvironment.mockResolvedValue({});
    const onChanged = vi.fn();
    render(
      <EnvironmentPicker
        list={list({
          environments: [environment('dev'), environment('prod'), environment('stage', false)],
          selected: 'dev'
        })}
        onChanged={onChanged}
      />
    );
    const select = screen.getByRole('combobox', { name: 'Environment' }) as HTMLSelectElement;
    expect(select.value).toBe('dev');
    const options = within(select).getAllByRole('option') as HTMLOptionElement[];
    expect(options.map((option) => option.disabled)).toEqual([false, false, true]);
    expect(options[2]!.textContent).toContain('The Worker rejected this secret.');
    await userEvent.selectOptions(select, 'prod');
    expect(api.selectEnvironment).toHaveBeenCalledWith('prod');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('says so when a selection is refused', async () => {
    api.selectEnvironment.mockRejectedValue(new Error('refused'));
    render(
      <EnvironmentPicker
        list={list({ environments: [environment('dev'), environment('prod')], selected: 'dev' })}
        onChanged={() => undefined}
      />
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), 'prod');
    expect((await screen.findByRole('alert')).textContent).toContain('could not be selected');
  });
});

describe('App with environments', () => {
  it('shows the welcome page, and no console, when no environment is usable', async () => {
    api.listEnvironments.mockResolvedValue(
      list({ environments: [environment('prod', false)], selected: null })
    );
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Welcome to Vizoalica' })).toBeTruthy();
    expect(api.listProjects).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Primary navigation' })).toBeNull();
  });

  it('opens the console on the selected environment, with the picker in the top bar', async () => {
    api.listEnvironments.mockResolvedValue(
      list({ environments: [environment('dev'), environment('prod')], selected: 'prod' })
    );
    render(<App />);
    const select = (await screen.findByRole('combobox', {
      name: 'Environment'
    })) as HTMLSelectElement;
    expect(select.value).toBe('prod');
    expect(api.listProjects).toHaveBeenCalled();
  });

  it('leaves the welcome page once a re-check finds a usable environment', async () => {
    api.listEnvironments.mockResolvedValueOnce(
      list({ environments: [environment('dev', false)], selected: null })
    );
    api.recheckEnvironments.mockResolvedValue(list());
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(api.listProjects).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: 'Welcome to Vizoalica' })).toBeNull();
  });

  it('reloads everything after another environment is selected', async () => {
    api.listEnvironments.mockResolvedValue(
      list({ environments: [environment('dev'), environment('prod')], selected: 'dev' })
    );
    api.selectEnvironment.mockResolvedValue({});
    render(<App />);
    const select = await screen.findByRole('combobox', { name: 'Environment' });
    await waitFor(() => expect(api.listProjects).toHaveBeenCalledTimes(1));
    api.listEnvironments.mockResolvedValue(
      list({ environments: [environment('dev'), environment('prod')], selected: 'prod' })
    );
    await userEvent.selectOptions(select, 'prod');
    await waitFor(() => expect(api.listProjects).toHaveBeenCalledTimes(2));
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('prod');
  });

  it('never offers environment management, first-run questions, or deploy actions in the console', async () => {
    render(<App />);
    await screen.findByRole('main');
    await waitFor(() => expect(api.listProjects).toHaveBeenCalled());
    for (const text of [/first run/i, /deploy/i, /add environment/i, /new environment/i])
      expect(screen.queryByText(text)).toBeNull();
  });
});
