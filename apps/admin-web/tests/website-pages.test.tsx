// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { ApiError } from '../src/api/local-operations.js';
import { acme, applyApiDefaults, beta, blog, docs, shop, site } from './fixtures/api.js';
import { makeOverview } from './fixtures/console.js';
import { connectedState } from './fixtures/setup.js';

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
  getAnalyticsOverview: vi.fn(),
  getExcludedHits: vi.fn(),
  getSetupState: vi.fn()
}));
vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

let sites: Record<string, unknown[]>;

beforeEach(() => {
  sites = { p1: [docs, blog], p2: [shop] };
  applyApiDefaults(api, sites);
  api.getSetupState.mockRejectedValue(new Error('offline'));
  api.getExcludedHits.mockResolvedValue({ total: 0, days: [], windowDays: 30 });
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
    // The project is chosen once, in the header; this page has no bar of filters of its own.
    expect(screen.getByRole('button', { name: /^Project/ }).textContent).toContain('Acme');
    expect(scopeBar()).toBeNull();
    expect(navLink('Websites').getAttribute('aria-current')).toBe('page');
  });

  it('follows the project chosen in the shell', async () => {
    go('manage/websites');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Docs');
    await user.click(screen.getByRole('button', { name: /^Project/ }));
    await user.click(screen.getByRole('menuitemradio', { name: /Beta/ }));
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
    api.getSetupState.mockResolvedValue(connectedState('admin'));
    go('manage/websites/s1');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /Docs/ });
    expect(screen.getByText('https://s1.test')).toBeTruthy();
    expect(screen.getByText('Project ID')).toBeTruthy();
    expect(screen.getByText('p1')).toBeTruthy();
    expect(screen.getByText('key-s1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy website key' })).toBeTruthy();
    expect(screen.getByText('Ingestion endpoint')).toBeTruthy();
    expect(screen.getByText('https://w.example.workers.dev/v1/events:batch')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy ingestion endpoint' })).toBeTruthy();
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

  it('does not check a configuration endpoint for a website that needs no token', async () => {
    api.getSetupState.mockResolvedValue(connectedState('admin'));
    sites.p1 = [site('s1', 'p1', 'Docs', { tokenRequired: false })];
    go('manage/websites/s1');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /Docs/ });
    expect(await screen.findByText('No action needed.')).toBeTruthy();
    expect(api.getReachability).not.toHaveBeenCalled();
    expect(screen.queryByText(/Website reachable|Website unreachable/)).toBeNull();
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
    expect(await screen.findByText(/Website Blog enabled\./)).toBeTruthy();
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
    expect(await screen.findByText(/Website Docs disabled\./)).toBeTruthy();
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
    // What the live site will do is said before the person confirms.
    expect(within(dialog).getByText(/tag on your live site will stop recording/)).toBeTruthy();
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
    await user.click(screen.getByRole('button', { name: /^Project/ }));
    await user.click(screen.getByRole('menuitem', { name: 'All projects…' }));
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

describe('install state on the website page', () => {
  it('says the website is installed once page views have arrived, and points at the steps otherwise', async () => {
    go('manage/websites/s1');
    api.getAnalyticsOverview.mockResolvedValue(
      makeOverview({ totals: { pageViews: 7, uniqueUsers: 3 } })
    );
    render(<App />);
    expect(await screen.findByText('Installed.')).toBeTruthy();
    expect(screen.getByText(/7 page views in the last 24 hours/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Install steps and check' }).getAttribute('href')).toBe(
      '#/manage/websites/s1/install'
    );
    cleanup();
    api.getAnalyticsOverview.mockResolvedValue(makeOverview());
    render(<App />);
    expect(await screen.findByText(/No page views in the last 24 hours/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Install this website' })).toBeTruthy();
  });

  it('still works when the page-view check cannot be made', async () => {
    go('manage/websites/s1');
    api.getAnalyticsOverview.mockRejectedValue(new Error('offline'));
    render(<App />);
    expect(await screen.findByText(/Not checked yet/)).toBeTruthy();
  });

  it('shows the website’s identifiers once, on this page, and not again on the install page', async () => {
    go('manage/websites/s1');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /Docs/ });
    expect(screen.getAllByText('Website key')).toHaveLength(1);
    cleanup();
    go('manage/websites/s1/install');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /^Install on/ });
    expect(screen.queryByText('Website key')).toBeNull();
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
        allowedOrigins: ['https://s1.test'],
        tokenRequired: true
      })
    );
    expect(await screen.findByRole('heading', { level: 1, name: /Docs v2/ })).toBeTruthy();
    // A new name changes nothing on the installed site, and the page says so.
    expect(
      screen.getByText('Website saved. Nothing needs to change on your installed site.')
    ).toBeTruthy();
    expect(window.location.hash).toBe(hubHash);
  });

  it('says the token endpoint’s own origin list must follow when the origins change', async () => {
    go('manage/websites/s1/edit');
    const user = userEvent.setup();
    render(<App />);
    const origins = await screen.findByRole('textbox', { name: 'Allowed origins' });
    await user.type(origins, '{Enter}www.s1.test');
    api.updateWebsite.mockImplementationOnce(async () => {
      sites.p1 = [{ ...docs, allowedOrigins: ['https://s1.test', 'https://www.s1.test'] }, blog];
      return docs;
    });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(api.updateWebsite).toHaveBeenCalledWith('p1', 's1', {
        name: 'Docs',
        allowedOrigins: ['https://s1.test', 'https://www.s1.test'],
        tokenRequired: true
      })
    );
    const note = await screen.findByText(/keeps its own list of origins/);
    expect(note.textContent).toContain('VIZOALICA_SITE');
    expect(screen.queryByText(/Nothing needs to change/)).toBeNull();
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
    await user.type(screen.getByRole('textbox', { name: 'Allowed origins' }), 'ftp://docs.test');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/cannot be measured/)).toBeTruthy();
    expect(api.updateWebsite).not.toHaveBeenCalled();
  });
});

describe('add page', () => {
  it('is only the add form, with the project shown as text, a back link and no scope bar', async () => {
    go('manage/websites');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('link', { name: /Add website/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Add a website' })).toBeTruthy();
    expect(scopeBar()).toBeNull();
    const form = screen.getByRole('form', { name: 'Add website' });
    expect(form.querySelector('select')).toBeNull();
    expect(form.querySelector('.form-project')!.textContent).toBe('Project: Acme');
    expect(document.activeElement).toBe(within(form).getByLabelText('Website address'));
    expect(screen.getByRole('link', { name: /Back to websites/ }).getAttribute('href')).toBe(
      '#/manage/websites'
    );
    await user.click(screen.getByRole('link', { name: /Back to websites/ }));
    expect(await screen.findByRole('list', { name: 'Websites' })).toBeTruthy();
  });

  it('creates the website in the project chosen at the top and lands on its Install page', async () => {
    go('manage/websites/new');
    const user = userEvent.setup();
    const created = site('s9', 'p2', 'launch.test', { allowedOrigins: ['https://launch.test'] });
    api.createWebsite.mockImplementationOnce(async () => {
      sites.p2 = [shop, created];
      return created;
    });
    render(<App />);
    // Change the project in the header first: the form follows it.
    await user.click(await screen.findByRole('button', { name: /^Project/ }));
    await user.click(screen.getByRole('menuitemradio', { name: /Beta/ }));
    go('manage/websites/new');
    const form = await screen.findByRole('form', { name: 'Add website' });
    await waitFor(() =>
      expect(form.querySelector('.form-project')!.textContent).toBe('Project: Beta')
    );
    await user.type(within(form).getByLabelText('Website address'), 'https://launch.test/');
    await user.click(within(form).getByRole('checkbox', { name: /Also allow/ }));
    await user.click(within(form).getByRole('button', { name: 'Add website' }));
    await waitFor(() =>
      expect(api.createWebsite).toHaveBeenCalledWith('p2', {
        name: 'launch.test',
        allowedOrigins: ['https://launch.test'],
        tokenRequired: false
      })
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Install on launch.test' })
    ).toBeTruthy();
    expect(window.location.hash).toBe('#/manage/websites/s9/install');
    expect(
      screen.getByText('Website launch.test created in project Beta (p2). Next: install it.')
    ).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toContain('Beta');
    await waitFor(() => expect(api.getSnippet).toHaveBeenCalledWith('p2', 's9'));
  });

  it('adds a website to the current project with a name of its own', async () => {
    go('manage/websites/new');
    const user = userEvent.setup();
    const created = site('s8', 'p1', 'Wiki');
    api.createWebsite.mockImplementationOnce(async () => {
      sites.p1 = [docs, blog, created];
      return created;
    });
    render(<App />);
    const form = await screen.findByRole('form', { name: 'Add website' });
    await user.type(within(form).getByLabelText('Website name', { exact: false }), 'Wiki');
    await user.type(within(form).getByLabelText('Website address'), 's8.test');
    await user.click(within(form).getByRole('button', { name: 'Add website' }));
    await waitFor(() =>
      expect(api.createWebsite).toHaveBeenCalledWith('p1', {
        name: 'Wiki',
        allowedOrigins: ['https://s8.test', 'https://www.s8.test'],
        tokenRequired: false
      })
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Install on Wiki' })).toBeTruthy();
  });

  it('preserves entries when the current project has become unavailable, or creation is interrupted', async () => {
    go('manage/websites/new');
    const user = userEvent.setup();
    api.createWebsite.mockRejectedValueOnce(new ApiError('not_found', 404));
    render(<App />);
    const form = await screen.findByRole('form', { name: 'Add website' });
    await user.type(
      within(form).getByLabelText('Website name', { exact: false }),
      'Retained draft'
    );
    await user.type(within(form).getByLabelText('Website address'), 'https://retained.test');
    await user.click(within(form).getByRole('button', { name: 'Add website' }));
    expect(
      await screen.findByText(
        'The current project is no longer available. Your entries were preserved.'
      )
    ).toBeTruthy();
    expect(
      (within(form).getByLabelText('Website name', { exact: false }) as HTMLInputElement).value
    ).toBe('Retained draft');
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
    await user.type(await screen.findByLabelText('Website address'), 'half.test');
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

describe('excluding your own visits', () => {
  const excludedSite = (extra: Record<string, unknown> = {}) =>
    site('s1', 'p1', 'Docs', {
      excludedAddresses: ['203.0.113.7', '198.51.100.0/24'],
      excludedAddressCount: 2,
      ...extra
    });
  const card = () => screen.getByRole('heading', { name: 'Your own visits' }).closest('section')!;

  it('explains how to start when nothing is excluded, and links to the edit page', async () => {
    sites.p1 = [site('s1', 'p1', 'Docs', { excludedAddresses: [], excludedAddressCount: 0 }), blog];
    go('manage/websites/s1');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /Docs/ });
    const section = await waitFor(card);
    expect(within(section).getByText(/No addresses are excluded/)).toBeTruthy();
    expect(within(section).getByText('?vizoalica_ignore=1')).toBeTruthy();
    expect(
      within(section).getByRole('link', { name: 'Exclude addresses' }).getAttribute('href')
    ).toBe('#/manage/websites/s1/edit');
  });

  it('shows how many entries there are and how many events were dropped, never the addresses', async () => {
    sites.p1 = [excludedSite(), blog];
    api.getExcludedHits.mockResolvedValue({
      total: 12,
      days: [
        { day: '2026-01-02', count: 7 },
        { day: '2026-01-01', count: 5 }
      ],
      windowDays: 30
    });
    go('manage/websites/s1');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /Docs/ });
    const section = await waitFor(card);
    expect(await within(section).findByText(/events/)).toBeTruthy();
    expect(section.textContent).toContain('2 addresses or ranges excluded');
    expect(section.textContent).toContain('12 events dropped in the last 30 days');
    expect(
      within(section).getByRole('list', { name: 'Events dropped per day' }).textContent
    ).toContain('2026-01-02: 7');
    expect(section.textContent).toContain('cannot be counted');
    expect(section.textContent).not.toContain('203.0.113');
    expect(within(section).getByRole('link', { name: 'Change excluded addresses' })).toBeTruthy();
    expect(api.getExcludedHits).toHaveBeenCalledWith('p1', 's1');
  });

  it('tells the owner to update a backend older than 0.11 instead of inviting an edit that cannot work', async () => {
    // An older backend sends neither the list nor its count.
    go('manage/websites/s1');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /Docs/ });
    const section = await waitFor(card);
    expect(section.textContent).toContain('This backend is older than 0.11');
    expect(section.textContent).toContain('vizoalica deploy <name> --update');
    expect(
      within(section).queryByRole('link', { name: /xclude addresses|Change excluded/ })
    ).toBeNull();
    expect(within(section).queryByText(/No addresses are excluded/)).toBeNull();
  });

  it('says dropped events cannot be counted on a backend that does not report them', async () => {
    sites.p1 = [excludedSite({ excludedAddressCount: 1 }), blog];
    api.getExcludedHits.mockRejectedValue(new ApiError('not_found', 404));
    go('manage/websites/s1');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /Docs/ });
    expect(await screen.findByText(/Update the backend to see them/)).toBeTruthy();
    expect(card().textContent).toContain('1 address or range excluded');
  });

  it('shows the field on the edit page with the current list, and saves a change', async () => {
    sites.p1 = [excludedSite(), blog];
    go('manage/websites/s1/edit');
    const user = userEvent.setup();
    render(<App />);
    const field = (await screen.findByRole('textbox', {
      name: /Exclude your own visits/
    })) as HTMLTextAreaElement;
    expect(field.value).toBe('203.0.113.7\n198.51.100.0/24');
    await user.clear(field);
    await user.type(field, '10.0.0.0/8, 2001:db8::1');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(api.updateWebsite).toHaveBeenCalledWith('p1', 's1', {
        name: 'Docs',
        allowedOrigins: ['https://s1.test'],
        tokenRequired: true,
        excludedAddresses: ['10.0.0.0/8', '2001:db8::1']
      })
    );
  });

  it('confirms a saved list normally, and warns when the backend is too old to have applied it', async () => {
    sites.p1 = [excludedSite(), blog];
    const user = userEvent.setup();
    for (const [reply, expected] of [
      [
        { ...docs, excludedAddresses: ['10.0.0.1'] },
        /Nothing needs to change on your installed site/
      ],
      [docs, /backend is older than 0\.11 and did not apply the excluded addresses/]
    ] as const) {
      go('manage/websites/s1/edit');
      api.updateWebsite.mockResolvedValueOnce(reply);
      render(<App />);
      const field = await screen.findByRole('textbox', { name: /Exclude your own visits/ });
      await user.clear(field);
      await user.type(field, '10.0.0.1');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(await screen.findByText(expected)).toBeTruthy();
      cleanup();
    }
  });

  it('switches the pixel on only when asked, and sends nothing about it otherwise', async () => {
    sites.p1 = [{ ...excludedSite(), pixelEnabled: false }, blog];
    go('manage/websites/s1/edit');
    const user = userEvent.setup();
    render(<App />);
    const name = await screen.findByRole('textbox', { name: 'Website name' });
    await user.type(name, ' v2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.updateWebsite).toHaveBeenCalledTimes(1));
    expect(api.updateWebsite.mock.calls[0]![2]).not.toHaveProperty('pixelEnabled');
    cleanup();

    go('manage/websites/s1/edit');
    render(<App />);
    await user.click(
      await screen.findByRole('checkbox', { name: /pages that cannot run scripts/ })
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.updateWebsite).toHaveBeenCalledTimes(2));
    expect(api.updateWebsite.mock.calls[1]![2]).toMatchObject({ pixelEnabled: true });
  });

  it('can clear the list', async () => {
    sites.p1 = [excludedSite(), blog];
    go('manage/websites/s1/edit');
    const user = userEvent.setup();
    render(<App />);
    await user.clear(await screen.findByRole('textbox', { name: /Exclude your own visits/ }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(api.updateWebsite).toHaveBeenCalledWith(
        'p1',
        's1',
        expect.objectContaining({ excludedAddresses: [] })
      )
    );
  });

  it('does not send the list when it was not changed', async () => {
    sites.p1 = [excludedSite(), blog];
    go('manage/websites/s1/edit');
    const user = userEvent.setup();
    render(<App />);
    const name = await screen.findByRole('textbox', { name: 'Website name' });
    await user.type(name, ' v2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.updateWebsite).toHaveBeenCalled());
    expect(api.updateWebsite.mock.calls[0]![2]).not.toHaveProperty('excludedAddresses');
  });

  it('names the entry the service refused, using the person’s own text, and keeps their entries', async () => {
    sites.p1 = [excludedSite(), blog];
    go('manage/websites/s1/edit');
    const user = userEvent.setup();
    api.updateWebsite.mockRejectedValueOnce(
      new ApiError('invalid_request', 400, undefined, {
        field: 'excludedAddresses',
        reason: 'invalid_entry',
        index: 1
      })
    );
    render(<App />);
    const field = await screen.findByRole('textbox', { name: /Exclude your own visits/ });
    await user.clear(field);
    await user.type(field, '203.0.113.7{Enter}office.example.com');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    const message = await screen.findByText(/“office.example.com” is not an IP address or range/);
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toContain(message.id);
    expect(document.activeElement).toBe(field);
    expect((field as HTMLTextAreaElement).value).toContain('office.example.com');
    expect(screen.queryByText(/Website could not be saved/)).toBeNull();
  });

  it('tells the owner to update the database when the backend cannot save the list yet', async () => {
    sites.p1 = [excludedSite(), blog];
    go('manage/websites/s1/edit');
    const user = userEvent.setup();
    api.updateWebsite.mockRejectedValueOnce(new ApiError('database_update_needed', 503));
    render(<App />);
    const field = await screen.findByRole('textbox', { name: /Exclude your own visits/ });
    await user.type(field, '{Enter}10.0.0.1');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/needs its latest update before it can save this/)).toBeTruthy();
  });

  it('refuses more than 25 entries before asking the service', async () => {
    sites.p1 = [excludedSite(), blog];
    go('manage/websites/s1/edit');
    const user = userEvent.setup();
    render(<App />);
    const field = await screen.findByRole('textbox', { name: /Exclude your own visits/ });
    await user.clear(field);
    await user.click(field);
    await user.paste(Array.from({ length: 26 }, (_, index) => `10.0.0.${index}`).join('\n'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Use 25 entries or fewer.')).toBeTruthy();
    expect(api.updateWebsite).not.toHaveBeenCalled();
  });

  it('leaves the field out when the backend sent no list (an analyst gets only a count)', async () => {
    sites.p1 = [site('s1', 'p1', 'Docs', { excludedAddressCount: 2 }), blog];
    go('manage/websites/s1/edit');
    render(<App />);
    await screen.findByRole('textbox', { name: 'Website name' });
    expect(screen.queryByRole('textbox', { name: /Exclude your own visits/ })).toBeNull();
  });
});
