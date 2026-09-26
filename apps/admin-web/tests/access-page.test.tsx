// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { KeyInstructions, suggestedEnvironmentName } from '../src/manage/access/KeyInstructions.js';
import { applyApiDefaults, blog, docs, shop } from './fixtures/api.js';
import { connectedState } from './fixtures/setup.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  getSetupState: vi.fn(),
  listProjects: vi.fn(),
  listWebsites: vi.fn(),
  getAnalyticsOverview: vi.fn(),
  listAccessKeys: vi.fn(),
  issueAccessKey: vi.fn(),
  revokeAccessKey: vi.fn()
}));
vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

const KEY = 'vzk_secret_value_1234567890';
const summary = (over: Record<string, unknown> = {}) => ({
  id: 'k1',
  label: 'Jane, analyst',
  role: 'analyst' as const,
  scope: { projectId: null, sourceId: null },
  createdAt: '2026-09-20T10:00:00.000Z',
  revokedAt: null,
  ...over
});

beforeEach(() => {
  applyApiDefaults(api, { p1: [docs, blog], p2: [shop] });
  api.getSetupState.mockResolvedValue(connectedState('admin'));
  api.listAccessKeys.mockResolvedValue([]);
  api.issueAccessKey.mockImplementation(async (input: { label: string; role: string }) => ({
    ...summary({ label: input.label, role: input.role }),
    key: KEY
  }));
  api.revokeAccessKey.mockResolvedValue({ status: 'revoked' });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function open() {
  window.location.hash = '#/manage/access';
  render(<App />);
  await screen.findByRole('heading', { level: 1, name: 'Access keys' });
  await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
}
/** A dropdown of the issue form (the header has its own Project menu, so search only the form). */
const form = () => document.querySelector('.access-form') as HTMLElement;
const field = (name: string) =>
  within(form()).getByRole('button', { name: new RegExp(`^${name}`) });
/** The panel that shows the new key, not the page-level "how is a key used" copy of it. */
const reveal = () => within(document.querySelector('.key-reveal') as HTMLElement);
async function choose(user: ReturnType<typeof userEvent.setup>, name: string, option: RegExp) {
  await user.click(field(name));
  await user.click(screen.getByRole('menuitemradio', { name: option }));
}

describe('Issue a key', () => {
  it('asks role and access with dropdowns, not radio buttons, each explaining its choice', async () => {
    const user = userEvent.setup();
    await open();
    const form = document.querySelector('.access-form')!;
    expect(form.querySelectorAll('input[type="radio"]')).toHaveLength(0);
    // The chosen role and what it means are visible without opening the list.
    expect(field('Role').textContent).toContain('Analyst');
    expect(field('Role').textContent).toContain('Cannot change anything');
    await user.click(field('Role'));
    const options = within(screen.getByRole('menu', { name: 'Role' })).getAllByRole(
      'menuitemradio'
    );
    expect(options.map((item) => item.querySelector('.menu-item-label')!.textContent)).toEqual([
      'Analyst',
      'Website owner'
    ]);
    expect(options[1]!.textContent).toContain('manage websites and projects');
    await user.click(options[1]!);
    expect(field('Role').textContent).toContain('Website owner');
  });

  it('starts with the least access: one project, the one chosen at the top', async () => {
    await open();
    expect(field('Access').textContent).toContain('One project');
    expect(field('Project').textContent).toContain('Acme');
    expect(within(form()).queryByRole('button', { name: /^Website/ })).toBeNull();
    expect(screen.getByText(/An analyst key for project Acme\./)).toBeTruthy();
  });

  it('follows the project chosen at the top, and drops a website chosen under the old one', async () => {
    const user = userEvent.setup();
    await open();
    await choose(user, 'Access', /One website/);
    await waitFor(() => expect((field('Website') as HTMLButtonElement).disabled).toBe(false));
    await choose(user, 'Website', /Docs/);
    expect(screen.getByText(/An analyst key for Docs in Acme\./)).toBeTruthy();
    // The header's own Project menu, not the form's.
    await user.click(screen.getAllByRole('button', { name: /^Project/ })[0]!);
    await user.click(screen.getByRole('menuitemradio', { name: /Beta/ }));
    expect(field('Project').textContent).toContain('Beta');
    expect(field('Website').textContent).toContain('Choose a website');
    expect(screen.queryByText(/Docs in/)).toBeNull();
  });

  it('shows the websites of the chosen project, and drops a website when the project changes', async () => {
    const user = userEvent.setup();
    await open();
    await choose(user, 'Access', /One website/);
    await waitFor(() => expect((field('Website') as HTMLButtonElement).disabled).toBe(false));
    await user.click(field('Website'));
    const sites = within(screen.getByRole('menu', { name: 'Website' })).getAllByRole(
      'menuitemradio'
    );
    // A person picks a website by name and address, never by typing an id.
    expect(sites.map((item) => item.querySelector('.menu-item-label')!.textContent)).toEqual([
      'Docs',
      'Blog'
    ]);
    expect(sites[0]!.textContent).toContain('https://s1.test');
    await user.click(sites[0]!);
    expect(screen.getByText(/An analyst key for Docs in Acme\./)).toBeTruthy();
    await choose(user, 'Project', /Beta/);
    expect(field('Website').textContent).toContain('Choose a website');
    await waitFor(() => expect((field('Website') as HTMLButtonElement).disabled).toBe(false));
    expect(api.listWebsites).toHaveBeenCalledWith('p2');
  });

  it('says a project without websites has none, and disables the picker', async () => {
    const user = userEvent.setup();
    api.listWebsites.mockImplementation(async (project: string) =>
      project === 'p1' ? [] : [shop]
    );
    await open();
    await choose(user, 'Access', /One website/);
    expect(await screen.findByText(/This project has no websites yet/)).toBeTruthy();
    expect((field('Website') as HTMLButtonElement).disabled).toBe(true);
  });

  it('says so when websites cannot be loaded', async () => {
    const user = userEvent.setup();
    api.listWebsites.mockRejectedValue(new Error('offline'));
    await open();
    await choose(user, 'Access', /One website/);
    expect((await screen.findAllByText(/Websites could not be loaded/)).length).toBeGreaterThan(0);
  });

  it('names each problem next to its field, and sends nothing', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole('button', { name: 'Issue key' }));
    expect(await screen.findByText(/Say who or what this key is for/)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Who is it for?'));
    await user.type(screen.getByLabelText('Who is it for?'), 'Jane');
    await choose(user, 'Access', /One website/);
    await user.click(screen.getByRole('button', { name: 'Issue key' }));
    expect(await screen.findByText('Choose a website.')).toBeTruthy();
    expect(field('Website').getAttribute('aria-invalid')).toBe('true');
    expect(api.issueAccessKey).not.toHaveBeenCalled();
  });

  it('issues for everything, one project, or one website with exactly that scope', async () => {
    const user = userEvent.setup();
    await open();
    await user.type(screen.getByLabelText('Who is it for?'), 'Jane');
    await choose(user, 'Access', /Everything/);
    expect(within(form()).queryByRole('button', { name: /^Project/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Issue key' }));
    await waitFor(() =>
      expect(api.issueAccessKey).toHaveBeenLastCalledWith({ label: 'Jane', role: 'analyst' })
    );
    await user.click(await screen.findByRole('button', { name: 'I have saved it' }));

    await user.type(screen.getByLabelText('Who is it for?'), 'Owner of blog');
    await choose(user, 'Role', /Website owner/);
    await choose(user, 'Access', /One website/);
    await waitFor(() => expect((field('Website') as HTMLButtonElement).disabled).toBe(false));
    await choose(user, 'Website', /Blog/);
    await user.click(screen.getByRole('button', { name: 'Issue key' }));
    await waitFor(() =>
      expect(api.issueAccessKey).toHaveBeenLastCalledWith({
        label: 'Owner of blog',
        role: 'owner',
        projectId: 'p1',
        sourceId: 's2'
      })
    );
  });

  it('explains a failed issue without losing what was typed', async () => {
    const user = userEvent.setup();
    api.issueAccessKey.mockRejectedValueOnce(new Error('offline'));
    await open();
    await user.type(screen.getByLabelText('Who is it for?'), 'Jane');
    await user.click(screen.getByRole('button', { name: 'Issue key' }));
    expect(await screen.findByText(/The key could not be issued/)).toBeTruthy();
    expect((screen.getByLabelText('Who is it for?') as HTMLInputElement).value).toBe('Jane');
  });
});

describe('After the key is issued', () => {
  async function issueOne(user: ReturnType<typeof userEvent.setup>, role: RegExp = /Analyst/) {
    await user.type(screen.getByLabelText('Who is it for?'), 'Jane');
    await choose(user, 'Role', role);
    await user.click(screen.getByRole('button', { name: 'Issue key' }));
    return screen.findByRole('heading', { name: 'Save this key now' });
  }

  it('shows the key once, focuses it, and offers to copy it', async () => {
    const user = userEvent.setup();
    await open();
    const heading = await issueOne(user);
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText(KEY)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Copy access key/ })).toBeTruthy();
    expect(screen.getByText(/only time/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'I have saved it' }));
    expect(screen.queryByText(KEY)).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('Who is it for?'));
  });

  it('says what to do with it: nothing to deploy, and how to add a console environment', async () => {
    const user = userEvent.setup();
    await open();
    await issueOne(user);
    const panel = document.querySelector('.key-instructions')!;
    expect(panel.textContent).toContain('Nothing to deploy');
    expect(panel.textContent).toContain('privately');
    expect(panel.textContent).toContain('npm install -g vizoalica');
    // The default way: a private file.
    const add = within(panel as HTMLElement).getByRole('region', { name: 'Add the environment' });
    expect(add.textContent).toBe(
      'vizoalica env add dev-analyst --connect --url https://w.example.workers.dev --role analyst'
    );
    expect(within(panel as HTMLElement).getByRole('region', { name: 'Check' }).textContent).toBe(
      'vizoalica env check dev-analyst'
    );
    // The key itself is never written into a command.
    expect(panel.textContent).not.toContain(KEY);
  });

  it('gives OneCLI steps: the secret to store, then the environment that points at it', async () => {
    const user = userEvent.setup();
    await open();
    await issueOne(user, /Website owner/);
    await user.click(reveal().getByRole('tab', { name: 'In OneCLI' }));
    const store = reveal().getByRole('region', { name: 'Store the key in OneCLI' });
    expect(store.textContent).toContain('--host-pattern w.example.workers.dev');
    expect(store.textContent).toContain("--value-format 'Bearer {value}'");
    expect(store.textContent).toContain('--file ./key.txt');
    expect(store.textContent).not.toContain(KEY);
    const step = store.closest('li')!;
    expect(step.textContent).toContain('Generic');
    expect(step.textContent).toContain('Authorization');
    const add = reveal().getByRole('region', { name: 'Add the environment' }).textContent!;
    expect(add).toContain('--role owner');
    expect(add).toContain('--secret-onecli');
    expect(add).toContain('--onecli-workspace WORKSPACE --onecli-agent AGENT --onecli-gateway');
    expect(reveal().getByText('onecli-managed')).toBeTruthy();
  });

  it('gives a script version that reads the key from standard input, not the command line', async () => {
    const user = userEvent.setup();
    await open();
    await issueOne(user);
    await user.click(reveal().getByRole('tab', { name: 'From a script' }));
    const add = reveal().getByRole('region', { name: 'Add the environment' }).textContent!;
    expect(add).toContain('read -rs KEY');
    expect(add).toContain('--secret-stdin --no-onecli');
    expect(add).not.toContain(KEY);
  });

  it('keeps the same instructions available on the page, without a key, after it is gone', async () => {
    const user = userEvent.setup();
    await open();
    const more = screen.getByText('How is a key used?').closest('details')!;
    expect(more.hasAttribute('open')).toBe(false);
    await user.click(screen.getByText('How is a key used?'));
    expect(within(more).getByText(/Nothing to deploy/)).toBeTruthy();
  });

  it('shows the new key in the list with its scope and role, newest active first, revoked last', async () => {
    api.listAccessKeys.mockResolvedValue([
      summary({ id: 'old', label: 'Old key', revokedAt: '2026-09-21T10:00:00.000Z' }),
      summary({
        id: 'a',
        label: 'Docs owner',
        role: 'owner',
        scope: { projectId: 'p1', sourceId: 's1' },
        createdAt: '2026-09-22T10:00:00.000Z'
      }),
      summary({ id: 'b', label: 'Whole project', scope: { projectId: 'p2', sourceId: null } })
    ]);
    await open();
    const list = await screen.findByRole('list', { name: 'Access keys' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('strong')!.textContent)).toEqual([
      'Docs owner',
      'Whole project',
      'Old key'
    ]);
    await waitFor(() => expect(rows[0]!.textContent).toContain('Docs (Acme)'));
    expect(rows[0]!.textContent).toContain('Website owner');
    expect(rows[1]!.textContent).toContain('Project Beta');
    expect(rows[2]!.textContent).toContain('Revoked');
    expect(within(rows[2]!).queryByRole('button')).toBeNull();
  });
});

describe('Revoking', () => {
  it('asks first, says what it means, then confirms and refreshes', async () => {
    const user = userEvent.setup();
    api.listAccessKeys
      .mockResolvedValueOnce([summary()])
      .mockResolvedValue([summary({ revokedAt: '2026-09-25T10:00:00.000Z' })]);
    await open();
    await user.click(await screen.findByRole('button', { name: 'Revoke Jane, analyst' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Revoke Jane, analyst?' });
    expect(dialog.textContent).toMatch(/stops working immediately/);
    expect(dialog.textContent).toMatch(/any computer/);
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(api.revokeAccessKey).toHaveBeenCalledWith('k1'));
    expect(
      await screen.findByText(/Key Jane, analyst revoked\. It stopped working immediately\./)
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Revoke Jane, analyst' })).toBeNull();
  });

  it('does not revoke when cancelled, and reports a failure', async () => {
    const user = userEvent.setup();
    api.listAccessKeys.mockResolvedValue([summary()]);
    await open();
    await user.click(await screen.findByRole('button', { name: 'Revoke Jane, analyst' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.revokeAccessKey).not.toHaveBeenCalled();
    api.revokeAccessKey.mockRejectedValueOnce(new Error('offline'));
    await user.click(screen.getByRole('button', { name: 'Revoke Jane, analyst' }));
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(await screen.findByText('The key could not be revoked. Try again.')).toBeTruthy();
  });

  it('says how it works when there are no keys, and when keys cannot be loaded', async () => {
    await open();
    expect(await screen.findByText(/No keys yet\. Issue one above/)).toBeTruthy();
    cleanup();
    api.listAccessKeys.mockRejectedValue(new Error('offline'));
    window.location.hash = '#/manage/access';
    render(<App />);
    expect(
      (await screen.findAllByText('Keys could not be loaded. Try again.')).length
    ).toBeGreaterThan(0);
  });
});

describe('KeyInstructions', () => {
  it('names the role and backend in each command, and suggests a name that will not collide', () => {
    expect(suggestedEnvironmentName('prod', 'owner')).toBe('prod-owner');
    expect(suggestedEnvironmentName('', 'analyst')).toBe('backend-analyst');
    render(
      <KeyInstructions
        workerUrl="https://analytics.example.com"
        environment="prod"
        role="owner"
        access="Docs (Acme)"
      />
    );
    expect(screen.getByRole('region', { name: 'Add the environment' }).textContent).toBe(
      'vizoalica env add prod-owner --connect --url https://analytics.example.com --role owner'
    );
    expect(document.body.textContent).toContain('who then reaches Docs (Acme)');
    expect(document.body.textContent).toContain('manage the websites and projects the key reaches');
  });

  it('still gives usable commands when the backend address is not known', () => {
    render(<KeyInstructions workerUrl="" environment="" role="analyst" />);
    expect(screen.getByRole('region', { name: 'Add the environment' }).textContent).toContain(
      '--url https://YOUR_WORKER_ADDRESS'
    );
    expect(document.body.textContent).toContain('see analytics and settings but change nothing');
  });
});
