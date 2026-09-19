// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { ApiError } from '../src/api/local-operations.js';
import { acme, applyApiDefaults, beta, blog, docs, shop, site } from './fixtures/api.js';
import { makeOverview } from './fixtures/console.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  listProjects: vi.fn(),
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

let sites: Record<string, unknown[]>;

beforeEach(() => {
  sites = { p1: [docs, blog], p2: [shop] };
  applyApiDefaults(api, sites);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const go = (path: string) => {
  window.location.hash = `#/${path}`;
};
const main = () => document.querySelector('main')!;
const scopeBar = () => screen.queryByRole('region', { name: 'Scope' });
const navLink = (name: string) =>
  within(screen.getByRole('navigation', { name: 'Primary navigation' })).getByRole('link', {
    name
  });
const pageAlert = () => waitFor(() => within(main()).getByRole('alert'));

describe('websites list', () => {
  it('shows each website as one card with its name, first origin, and status, and no form', async () => {
    sites.p1 = [
      docs,
      site('s2', 'p1', 'Blog', {
        status: 'disabled',
        allowedOrigins: ['https://blog.test', 'https://www.blog.test']
      })
    ];
    go('manage/websites');
    render(<App />);
    const list = await screen.findByRole('list', { name: 'Websites' });
    const cards = within(list).getAllByRole('link');
    expect(cards).toHaveLength(2);
    expect(cards[0]!.textContent).toContain('Docs');
    expect(cards[0]!.textContent).toContain('https://s1.test');
    expect(cards[0]!.textContent).toContain('active');
    expect(cards[1]!.textContent).toContain('+1 more');
    expect(cards[1]!.textContent).toContain('disabled');
    expect(cards[0]!.getAttribute('href')).toBe('#/manage/websites/s1');
    expect(main().querySelectorAll('input, select, textarea')).toHaveLength(0);
    expect(screen.getByRole('link', { name: /Add website/ }).getAttribute('href')).toBe(
      '#/manage/websites/new'
    );
    // Only the project selector belongs to this page in the shell; there is no website selector.
    expect(within(scopeBar()!).getByLabelText('Project')).toBeTruthy();
    expect(within(scopeBar()!).queryByLabelText('Website')).toBeNull();
    expect(navLink('Websites').getAttribute('aria-current')).toBe('page');
  });

  it('follows the project chosen in the shell', async () => {
    go('manage/websites');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Docs');
    await user.selectOptions(within(scopeBar()!).getByLabelText('Project'), 'p2');
    expect(await screen.findByText('Shop')).toBeTruthy();
    expect(screen.queryByText('Docs')).toBeNull();
  });

  it('explains an empty project and offers to add the first website', async () => {
    sites.p1 = [];
    go('manage/websites');
    render(<App />);
    expect(await screen.findByText('No websites yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Add your first website' })).toBeTruthy();
  });

  it('shows a busy state while loading and recovers from a failed load', async () => {
    api.listWebsites.mockRejectedValueOnce(new Error('offline'));
    go('manage/websites');
    const user = userEvent.setup();
    render(<App />);
    await pageAlert();
    const alert = within(main()).getByRole('alert');
    expect(alert.textContent).toContain('Websites could not be loaded');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Docs')).toBeTruthy();
  });

  it('shows a loading placeholder before the list arrives', async () => {
    let release: (value: unknown[]) => void = () => undefined;
    api.listWebsites.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    go('manage/websites');
    render(<App />);
    expect(await screen.findByLabelText('Loading websites')).toBeTruthy();
    release([docs]);
    expect(await screen.findByText('Docs')).toBeTruthy();
  });

  it('points to Projects when there is no project', async () => {
    api.listProjects.mockResolvedValue([]);
    go('manage/websites');
    render(<App />);
    expect(await screen.findByRole('link', { name: 'Create a project' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Add website/ })).toBeNull();
  });
});

describe('website page', () => {
  it('opens from its card, by address, and after a reload, without a website selector', async () => {
    go('manage/websites');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('link', { name: /Docs/ }));
    expect(await screen.findByRole('heading', { level: 1, name: /Docs/ })).toBeTruthy();
    expect(window.location.hash).toBe('#/manage/websites/s1');
    expect(scopeBar()).toBeNull();
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(trail.textContent).toContain('Acme');
    expect(within(trail).getByRole('link', { name: 'Websites' })).toBeTruthy();
    expect(navLink('Websites').getAttribute('aria-current')).toBe('true');
    cleanup();
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: /Docs/ })).toBeTruthy();
    // Back to the list by the breadcrumb.
    await user.click(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', {
        name: 'Websites'
      })
    );
    expect(await screen.findByRole('list', { name: 'Websites' })).toBeTruthy();
  });

  it('shows details, identifiers with copy controls, status, and the three actions', async () => {
    go('manage/websites/s1');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /Docs/ });
    expect(screen.getByText('https://s1.test')).toBeTruthy();
    expect(screen.getByText('Project ID')).toBeTruthy();
    expect(screen.getByText('p1')).toBeTruthy();
    expect(screen.getByText('key-s1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy public source key' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
      '#/manage/websites/s1/edit'
    );
    expect(screen.getByRole('link', { name: 'Install' }).getAttribute('href')).toBe(
      '#/manage/websites/s1/install'
    );
    expect(screen.getByRole('link', { name: 'View analytics' })).toBeTruthy();
    expect(await screen.findByText('No action needed.')).toBeTruthy();
    expect(screen.getByText('Operational status')).toBeTruthy();
    expect(screen.getByText(/Website reachable/)).toBeTruthy();
    expect(api.getStatus).toHaveBeenCalledWith('p1', 's1');
  });

  it('says so while status is loading and when it cannot be read', async () => {
    api.getStatus.mockRejectedValueOnce(new Error('offline'));
    go('manage/websites/s1');
    render(<App />);
    expect(await screen.findByText(/Status is unavailable/)).toBeTruthy();
  });

  it('shows a not-found state for an unknown website or one from another project', async () => {
    go('manage/websites/nope');
    render(<App />);
    expect(await screen.findByText('Website not found')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to websites' }).getAttribute('href')).toBe(
      '#/manage/websites'
    );
    expect(screen.queryByText('Docs')).toBeNull();
    cleanup();
    go('manage/websites/s3');
    render(<App />);
    expect(await screen.findByText('Website not found')).toBeTruthy();
    expect(screen.queryByText('Shop')).toBeNull();
    cleanup();
    go('manage/websites/nope/edit');
    render(<App />);
    expect(await screen.findByText('Website not found')).toBeTruthy();
  });

  it('shows a busy state, then an error with retry, when the list cannot load', async () => {
    api.listWebsites.mockRejectedValueOnce(new Error('offline'));
    go('manage/websites/s1');
    const user = userEvent.setup();
    render(<App />);
    await pageAlert();
    const alert = within(main()).getByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Docs/ })).toBeTruthy();
  });

  it('points to creating a project when there is none', async () => {
    api.listProjects.mockResolvedValue([]);
    go('manage/websites/s1');
    render(<App />);
    expect(await screen.findByRole('link', { name: 'Create a project' })).toBeTruthy();
  });

  it('opens Analytics with this website as the scope', async () => {
    go('manage/websites/s1');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('link', { name: 'View analytics' }));
    await waitFor(() =>
      expect(api.getAnalyticsOverview).toHaveBeenLastCalledWith(
        'p1',
        's1',
        expect.any(String),
        expect.any(String),
        expect.any(AbortSignal)
      )
    );
    expect(
      (
        within(await screen.findByRole('region', { name: 'Scope' })).getByLabelText(
          'Website'
        ) as HTMLSelectElement
      ).value
    ).toBe('s1');
  });

  it('offers Enable for a disabled website without a confirmation, and says it is disabled', async () => {
    go('manage/websites/s2');
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText(/This website is disabled/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Disable website…' })).toBeNull();
    api.updateWebsite.mockImplementationOnce(async () => {
      sites.p1 = [docs, { ...blog, status: 'active' }];
      return blog;
    });
    await user.click(screen.getByRole('button', { name: 'Enable website' }));
    await waitFor(() =>
      expect(api.updateWebsite).toHaveBeenCalledWith('p1', 's2', { status: 'active' })
    );
    expect(await screen.findByText(/Website Blog enabled and audit recorded/)).toBeTruthy();
    expect(screen.queryByText(/This website is disabled/)).toBeNull();
  });

  it('disables a website only after a named confirmation, and can be cancelled', async () => {
    go('manage/websites/s1');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Disable website…' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.updateWebsite).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Disable website…' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Disable Docs?' });
    expect(within(dialog).getByText(/stop collecting new events/)).toBeTruthy();
    api.updateWebsite.mockImplementationOnce(async () => {
      sites.p1 = [{ ...docs, status: 'disabled' }, blog];
      return docs;
    });
    await user.click(within(dialog).getByRole('button', { name: 'Disable website' }));
    await waitFor(() =>
      expect(api.updateWebsite).toHaveBeenCalledWith('p1', 's1', { status: 'disabled' })
    );
    expect(await screen.findByText(/Website Docs disabled and audit recorded/)).toBeTruthy();
    expect(await screen.findByText(/This website is disabled/)).toBeTruthy();
  });

  it('deletes only after a named confirmation, then lands on the list with a confirmation', async () => {
    go('manage/websites/s1');
    const user = userEvent.setup();
    const nativeConfirm = vi.spyOn(window, 'confirm');
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Delete website…' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Docs?' });
    expect(within(dialog).getByText(/permanent/)).toBeTruthy();
    api.deleteWebsite.mockImplementationOnce(async () => {
      sites.p1 = [blog];
      return { status: 'deleted', audit: 'recorded' };
    });
    await user.click(within(dialog).getByRole('button', { name: 'Delete website' }));
    await waitFor(() => expect(api.deleteWebsite).toHaveBeenCalledWith('p1', 's1'));
    expect(await screen.findByRole('list', { name: 'Websites' })).toBeTruthy();
    expect(await screen.findByText(/Website Docs deleted/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Docs/ })).toBeNull();
    expect(nativeConfirm).not.toHaveBeenCalled();
    // The confirmation is shown once: moving on clears it.
    await user.click(navLink('Projects'));
    await screen.findByRole('heading', { level: 1, name: 'Projects' });
    expect(screen.queryByText(/Website Docs deleted/)).toBeNull();
  });

  it('reports an interrupted change and keeps the page', async () => {
    go('manage/websites/s1');
    const user = userEvent.setup();
    render(<App />);
    api.deleteWebsite.mockRejectedValueOnce(new Error('offline'));
    await user.click(await screen.findByRole('button', { name: 'Delete website…' }));
    await user.click(screen.getByRole('button', { name: 'Delete website' }));
    expect(await screen.findByText(/operation was interrupted/i)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: /Docs/ })).toBeTruthy();
  });
});

describe('edit page', () => {
  const hubHash = '#/manage/websites/s1';

  it('is only the form, with the name focused, a back link, and Save unavailable until changed', async () => {
    go('manage/websites/s1');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('link', { name: 'Edit' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Edit Docs' })).toBeTruthy();
    expect(window.location.hash).toBe('#/manage/websites/s1/edit');
    expect(scopeBar()).toBeNull();
    expect(screen.getAllByRole('form')).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Website name' }));
    expect((screen.getByRole('textbox', { name: 'Website name' }) as HTMLInputElement).value).toBe(
      'Docs'
    );
    expect(
      (screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByRole('link', { name: /Back to Docs/ }).getAttribute('href')).toBe(hubHash);
    expect(navLink('Websites').getAttribute('aria-current')).toBe('true');
    // Nothing changed, so leaving is immediate.
    await user.click(screen.getByRole('link', { name: /Back to Docs/ }));
    expect(await screen.findByRole('heading', { level: 1, name: /Docs/ })).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('asks before discarding changes from the back link and from Cancel, defaulting to keep editing', async () => {
    go('manage/websites/s1/edit');
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByRole('textbox', { name: 'Website name' }), ' v2');
    await user.click(screen.getByRole('link', { name: /Back to Docs/ }));
    let dialog = screen.getByRole('alertdialog', { name: 'Discard your changes?' });
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: 'Keep editing' })
    );
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(window.location.hash).toBe('#/manage/websites/s1/edit');
    expect((screen.getByRole('textbox', { name: 'Website name' }) as HTMLInputElement).value).toBe(
      'Docs v2'
    );
    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    dialog = screen.getByRole('alertdialog', { name: 'Discard your changes?' });
    await user.click(within(dialog).getByRole('button', { name: 'Discard changes' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Docs/ })).toBeTruthy();
    expect(window.location.hash).toBe(hubHash);
  });

  it('saves, returns to the website page, and confirms once', async () => {
    go('manage/websites/s1/edit');
    const user = userEvent.setup();
    render(<App />);
    const name = await screen.findByRole('textbox', { name: 'Website name' });
    await user.clear(name);
    await user.type(name, 'Docs v2');
    api.updateWebsite.mockImplementationOnce(async () => {
      sites.p1 = [{ ...docs, name: 'Docs v2' }, blog];
      return docs;
    });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(api.updateWebsite).toHaveBeenCalledWith('p1', 's1', {
        name: 'Docs v2',
        allowedOrigins: ['https://s1.test']
      })
    );
    expect(await screen.findByRole('heading', { level: 1, name: /Docs v2/ })).toBeTruthy();
    expect(screen.getByText('Website updated and audit recorded.')).toBeTruthy();
    expect(window.location.hash).toBe(hubHash);
  });

  it('keeps the operator on the page with entries preserved when saving fails', async () => {
    go('manage/websites/s1/edit');
    const user = userEvent.setup();
    api.updateWebsite.mockRejectedValueOnce(new ApiError('remote_unavailable', 503));
    render(<App />);
    await user.type(await screen.findByRole('textbox', { name: 'Website name' }), ' v2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Website could not be saved/)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Edit Docs' })).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Website name' }) as HTMLInputElement).value).toBe(
      'Docs v2'
    );
  });

  it('reports invalid entries next to the field and sends nothing', async () => {
    go('manage/websites/s1/edit');
    const user = userEvent.setup();
    render(<App />);
    const name = await screen.findByRole('textbox', { name: 'Website name' });
    await user.clear(name);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Enter a name for this website.')).toBeTruthy();
    await user.type(name, 'Docs');
    await user.clear(screen.getByRole('textbox', { name: 'Allowed origins' }));
    await user.type(screen.getByRole('textbox', { name: 'Allowed origins' }), 'docs.test');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/is not an exact origin/)).toBeTruthy();
    expect(api.updateWebsite).not.toHaveBeenCalled();
  });
});

describe('add page', () => {
  it('is only the add form, project first and empty, with a back link and no scope bar', async () => {
    go('manage/websites');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('link', { name: /Add website/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Add a website' })).toBeTruthy();
    expect(scopeBar()).toBeNull();
    const form = screen.getByRole('form', { name: 'Add website' });
    expect(form.querySelector('select, input, textarea')!.tagName).toBe('SELECT');
    expect((within(form).getByLabelText('Project') as HTMLSelectElement).value).toBe('');
    expect(document.activeElement).toBe(within(form).getByLabelText('Project'));
    expect(screen.getByRole('link', { name: /Back to websites/ }).getAttribute('href')).toBe(
      '#/manage/websites'
    );
    await user.click(screen.getByRole('link', { name: /Back to websites/ }));
    expect(await screen.findByRole('list', { name: 'Websites' })).toBeTruthy();
  });

  it('creates the website in exactly the chosen project and lands on its Install page', async () => {
    go('manage/websites/new');
    const user = userEvent.setup();
    const created = site('s9', 'p2', 'Launch', { allowedOrigins: ['https://launch.test'] });
    api.createWebsite.mockImplementationOnce(async () => {
      sites.p2 = [shop, created];
      return created;
    });
    render(<App />);
    const form = await screen.findByRole('form', { name: 'Add website' });
    await user.selectOptions(within(form).getByLabelText('Project'), 'p2');
    await user.type(within(form).getByLabelText('Website name'), 'Launch');
    await user.type(within(form).getByLabelText('Allowed origins'), 'https://launch.test');
    await user.click(within(form).getByRole('button', { name: 'Add website' }));
    await waitFor(() =>
      expect(api.createWebsite).toHaveBeenCalledWith('p2', {
        name: 'Launch',
        allowedOrigins: ['https://launch.test']
      })
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Install on Launch' })
    ).toBeTruthy();
    expect(window.location.hash).toBe('#/manage/websites/s9/install');
    expect(
      screen.getByText('Website Launch created in project Beta (p2). Next: install it.')
    ).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toContain('Beta');
    await waitFor(() => expect(api.getSnippet).toHaveBeenCalledWith('p2', 's9'));
  });

  it('creates in the current project and lands on the new website', async () => {
    go('manage/websites/new');
    const user = userEvent.setup();
    const created = site('s8', 'p1', 'Wiki');
    api.createWebsite.mockImplementationOnce(async () => {
      sites.p1 = [docs, blog, created];
      return created;
    });
    render(<App />);
    const form = await screen.findByRole('form', { name: 'Add website' });
    await user.selectOptions(within(form).getByLabelText('Project'), 'p1');
    await user.type(within(form).getByLabelText('Website name'), 'Wiki');
    await user.type(within(form).getByLabelText('Allowed origins'), 'https://s8.test');
    await user.click(within(form).getByRole('button', { name: 'Add website' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Install on Wiki' })).toBeTruthy();
  });

  it('preserves entries when the chosen project has become unavailable, or creation is interrupted', async () => {
    go('manage/websites/new');
    const user = userEvent.setup();
    api.createWebsite.mockRejectedValueOnce(new ApiError('not_found', 404));
    render(<App />);
    const form = await screen.findByRole('form', { name: 'Add website' });
    await user.selectOptions(within(form).getByLabelText('Project'), 'p2');
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
    api.createWebsite.mockRejectedValueOnce(new Error('offline'));
    await user.click(within(form).getByRole('button', { name: 'Add website' }));
    expect(
      await screen.findByText('Website creation was interrupted. Your entries were preserved.')
    ).toBeTruthy();
  });

  it('asks before losing entries when leaving by the back link or Cancel', async () => {
    go('manage/websites/new');
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('Website name'), 'Half done');
    await user.click(screen.getByRole('link', { name: /Back to websites/ }));
    expect(screen.getByRole('alertdialog', { name: 'Discard your changes?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(await screen.findByRole('list', { name: 'Websites' })).toBeTruthy();
  });

  it('is unavailable without a project, with a path to create one', async () => {
    api.listProjects.mockResolvedValue([]);
    go('manage/websites/new');
    render(<App />);
    expect(await screen.findByRole('link', { name: 'Create a project' })).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Add website' })).toBeNull();
  });

  it('never leaves a stale overview around: the analytics call for the new scope is separate', () => {
    expect(makeOverview().totals.pageViews).toBe(0);
    expect([acme.id, beta.id]).toEqual(['p1', 'p2']);
  });
});
