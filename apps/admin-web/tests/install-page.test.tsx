// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { applyApiDefaults, blog, docs } from './fixtures/api.js';
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

const [staticMode, dynamicMode] = primaryIntegration.modes;
const writeText = vi.fn();

beforeEach(() => {
  applyApiDefaults(api, { p1: [docs, blog], p2: [] });
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
});

// user-event installs its own clipboard when it is set up, so ours goes in afterwards.
function setup() {
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  return user;
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openInstall(id = 's1') {
  window.location.hash = `#/manage/websites/${id}/install`;
  const view = render(<App />);
  await screen.findByRole('heading', { level: 1, name: /^Install on/ });
  await screen.findByRole('tablist', { name: 'Deployment path' });
  return view;
}
const tab = (name: string) => screen.getByRole('tab', { name });
const steps = () => within(screen.getByRole('tabpanel', { name: /./ })).getAllByRole('listitem');
const stepTitles = () =>
  Array.from(document.querySelectorAll('.install-step > h3')).map((heading) => heading.textContent);

describe('choosing how the website is deployed', () => {
  it('asks first, as two path cards with plain descriptions, recommending GitHub → Cloudflare Pages', async () => {
    await openInstall();
    expect(
      screen.getByRole('heading', { level: 2, name: 'How is this website deployed?' })
    ).toBeTruthy();
    const tabs = within(screen.getByRole('tablist', { name: 'Deployment path' })).getAllByRole(
      'tab'
    );
    expect(tabs.map((item) => item.getAttribute('aria-label'))).toEqual([
      'GitHub → Cloudflare Pages',
      'Paste a snippet'
    ]);
    expect(tab('GitHub → Cloudflare Pages').getAttribute('aria-selected')).toBe('true');
    expect(within(tab('GitHub → Cloudflare Pages')).getByText('Recommended')).toBeTruthy();
    expect(within(tab('GitHub → Cloudflare Pages')).getByText(/Push to deploy/)).toBeTruthy();
    expect(
      within(tab('GitHub → Cloudflare Pages')).getByText('Uses dynamic configuration')
    ).toBeTruthy();
    expect(within(tab('Paste a snippet')).getByText(/Works with any host/)).toBeTruthy();
    expect(within(tab('Paste a snippet')).getByText('Uses a static snippet')).toBeTruthy();
    // It is a choice of route, not a saved setting: no radio buttons.
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('states the one-path rule up front and never warns only after switching', async () => {
    const user = setup();
    await openInstall();
    expect(
      screen.getByText(/Use one path per website, so analytics starts only once/)
    ).toBeTruthy();
    await user.click(tab('Paste a snippet'));
    expect(
      screen.getByText(/Use one path per website, so analytics starts only once/)
    ).toBeTruthy();
    expect(screen.queryByText(/Remove or disable the other installation path/i)).toBeNull();
  });

  it('switches by mouse and by keyboard, and remembers the choice per website', async () => {
    const user = setup();
    const { unmount } = await openInstall();
    tab('GitHub → Cloudflare Pages').focus();
    await user.keyboard('{ArrowRight}');
    expect(tab('Paste a snippet').getAttribute('aria-selected')).toBe('true');
    expect(window.localStorage.getItem('vizoalica.install.path.s1')).toBe('snippet');
    unmount();
    await openInstall('s1');
    expect(tab('Paste a snippet').getAttribute('aria-selected')).toBe('true');
    cleanup();
    // Another website is not affected.
    await openInstall('s2');
    expect(tab('GitHub → Cloudflare Pages').getAttribute('aria-selected')).toBe('true');
    await user.click(tab('Paste a snippet'));
    await user.click(tab('GitHub → Cloudflare Pages'));
    expect(window.localStorage.getItem('vizoalica.install.path.s2')).toBe('github');
  });

  it('works when browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const user = setup();
    await openInstall();
    expect(tab('GitHub → Cloudflare Pages').getAttribute('aria-selected')).toBe('true');
    await user.click(tab('Paste a snippet'));
    expect(tab('Paste a snippet').getAttribute('aria-selected')).toBe('true');
    vi.restoreAllMocks();
  });

  it('shows the GitHub option as unavailable, and uses the snippet path, when the service offered one mode', async () => {
    api.getSnippet.mockResolvedValue({ ...primaryIntegration, modes: [staticMode] });
    await openInstall();
    const github = tab('GitHub → Cloudflare Pages');
    expect(github.hasAttribute('disabled')).toBe(true);
    expect(within(github).getByText(/Not available/)).toBeTruthy();
    expect(tab('Paste a snippet').getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByText(/Using another host/)).toBeNull();
  });

  it('falls back to the legacy snippet field, then to an explanation, when modes are missing', async () => {
    api.getSnippet.mockResolvedValue({ ...primaryIntegration, modes: undefined });
    await openInstall();
    expect(screen.getByRole('region', { name: 'Snippet' }).textContent).toBe(
      primaryIntegration.html
    );
    cleanup();
    api.getSnippet.mockResolvedValue({ ...primaryIntegration, modes: undefined, html: undefined });
    await openInstall();
    expect(screen.getByRole('region', { name: 'Snippet' }).textContent).toMatch(
      /Snippet unavailable/
    );
  });
});

describe('GitHub → Cloudflare Pages path', () => {
  it('is five numbered steps, each with one action and at most one code block', async () => {
    await openInstall();
    expect(stepTitles()).toEqual([
      'Add the loader to your pages',
      'Add the deploy workflow',
      'Add the settings and secrets to the repository',
      'Push to deploy',
      'Check that it works'
    ]);
    const list = screen.getByRole('list', { name: 'Steps for GitHub and Cloudflare Pages' });
    expect(list.tagName).toBe('OL');
    for (const step of Array.from(document.querySelectorAll('.install-step')))
      expect(step.querySelectorAll('.code-block').length).toBeLessThanOrEqual(1);
    expect(screen.getByRole('region', { name: 'Loader tag' }).textContent).toBe(
      dynamicMode.snippet
    );
    expect(screen.getByRole('region', { name: 'Deploy workflow' }).textContent).toBe(
      dynamicMode.cloudflare.starterWorkflowYaml
    );
    expect(screen.getByText(/replacing/)).toBeTruthy();
  });

  it('offers the same information two ways in one step: GitHub website or the gh command line', async () => {
    const user = setup();
    await openInstall();
    const toggle = screen.getByRole('tablist', { name: 'How to add them' });
    expect(within(toggle).getAllByRole('tab')).toHaveLength(2);
    // In GitHub: public variables, then the account-specific ones, distinguished by kind.
    expect(screen.getByRole('region', { name: 'Repository variables' }).textContent).toContain(
      'VIZOALICA_SOURCE_ID=site-1'
    );
    const others = screen.getByRole('list', { name: 'Other settings to add' });
    const rows = within(others).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('CF_ACCOUNT_ID'),
      expect.stringContaining('CF_PAGES_PROJECT'),
      expect.stringContaining('CF_API_TOKEN'),
      expect.stringContaining('VIZOALICA_TOKEN_SECRET')
    ]);
    expect(rows[0]!.textContent).toContain('Variable');
    expect(rows[2]!.textContent).toContain('Secret');
    expect(rows[2]!.textContent).toContain('Cloudflare Pages: Edit');
    expect(rows[3]!.textContent).toContain('the same one the Worker uses');
    expect(screen.getByText(/Public values are not secrets/)).toBeTruthy();
    // The one-path warning is said once, above the steps, not repeated here.
    expect(
      within(
        screen.getByRole('list', { name: 'Steps for GitHub and Cloudflare Pages' })
      ).queryByText(/Enable only one installation mode/)
    ).toBeNull();

    await user.click(within(toggle).getByRole('tab', { name: 'With the gh command' }));
    expect(screen.getByRole('region', { name: 'gh commands' }).textContent).toContain(
      'gh secret set CF_API_TOKEN'
    );
    expect(screen.queryByRole('list', { name: 'Other settings to add' })).toBeNull();
    expect(screen.getByText(/ask for the value/)).toBeTruthy();
  });

  it('names a secret without ever showing one, and lists identifiers only in a collapsed reference', async () => {
    await openInstall();
    const page = document.querySelector('main')!.textContent!;
    expect(page).not.toMatch(/Bearer|admin-secret|issued JWT/i);
    const reference = screen.getByText('Identifiers for this website').closest('details')!;
    expect(reference.hasAttribute('open')).toBe(false);
    expect(within(reference).getByText('key-s1')).toBeTruthy();
  });

  it('copies each block and says so in place and in a live region', async () => {
    const user = setup();
    await openInstall();
    await user.click(screen.getByRole('button', { name: 'Copy loader tag' }));
    expect(writeText).toHaveBeenLastCalledWith(dynamicMode.snippet);
    expect(screen.getByRole('button', { name: 'Copy loader tag' }).textContent).toContain('Copied');
    expect(screen.getByText('Loader tag copied to clipboard.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Copy workflow file' }));
    expect(writeText).toHaveBeenLastCalledWith(dynamicMode.cloudflare.starterWorkflowYaml);
    await user.click(screen.getByRole('button', { name: 'Copy variable list' }));
    expect(writeText.mock.calls.at(-1)![0]).toContain('VIZOALICA_PROJECT_ID=project-1');
  });
});

describe('Paste a snippet path', () => {
  async function openSnippet() {
    const user = setup();
    await openInstall();
    await user.click(tab('Paste a snippet'));
    return user;
  }

  it('is five numbered steps: snippet, SDK file, token endpoint, deploy, check', async () => {
    await openSnippet();
    expect(stepTitles()).toEqual([
      'Add the snippet to your pages',
      'Save the SDK file on your site',
      'Add a token endpoint',
      'Deploy your website',
      'Check that it works'
    ]);
    expect(screen.getByRole('region', { name: 'Snippet' }).textContent).toBe(staticMode.snippet);
    for (const step of Array.from(document.querySelectorAll('.install-step')))
      expect(step.querySelectorAll('.code-block').length).toBeLessThanOrEqual(1);
  });

  it('says where to get the SDK file and where to save it, with a download that keeps its name', async () => {
    await openSnippet();
    const step = screen
      .getByRole('heading', { name: 'Save the SDK file on your site' })
      .closest('li')!;
    const download = within(step).getByRole('link', { name: 'Download vizoalica.js' });
    expect(download.getAttribute('href')).toBe('/api/sdk/vizoalica.js');
    expect(download.getAttribute('download')).toBe('vizoalica.js');
    expect(step.textContent).toContain('root folder');
    expect(step.textContent).toContain('/vizoalica.js');
  });

  it('gives the generic loader its own download and destination in the disclosure', async () => {
    await openSnippet();
    const more = screen
      .getByText(/Using another host, or keeping settings out of your pages/)
      .closest('details')!;
    const download = within(more).getByRole('link', { name: 'Download vizoalica-loader.js' });
    expect(download.getAttribute('href')).toBe('/api/sdk/vizoalica-loader.js');
    expect(more.textContent).toContain('/vizoalica-loader.js');
  });

  it('states the token endpoint requirement and the secret rule, with identifiers to copy and the guide', async () => {
    const user = await openSnippet();
    expect(screen.getByText(/VIZOALICA_TOKEN_SECRET/)).toBeTruthy();
    expect(screen.getByText(/Keep it on the server; never put it in a page/)).toBeTruthy();
    for (const label of ['Project ID', 'Website ID (source ID)', 'Public source key'])
      expect(screen.getByText(label)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Copy website ID' }));
    expect(writeText).toHaveBeenLastCalledWith('s1');
    const guide = screen.getByRole('link', { name: 'full activation guide' });
    expect(guide.getAttribute('href')).toContain('docs/operations/pages.md');
    expect(guide.getAttribute('rel')).toContain('noopener');
    // The identifiers are needed by this step, so there is no separate reference section.
    expect(screen.queryByText('Identifiers for this website')).toBeNull();
  });

  it('keeps the generic loader and its configuration document in a disclosure', async () => {
    const user = await openSnippet();
    const more = screen
      .getByText(/Using another host, or keeping settings out of your pages/)
      .closest('details')!;
    expect(more.hasAttribute('open')).toBe(false);
    expect(within(more).getByRole('region', { name: 'Generic loader tag' }).textContent).toBe(
      dynamicMode.snippet
    );
    const config = within(more).getByRole('region', { name: /Configuration document/ });
    expect(JSON.parse(config.textContent!)).toEqual(dynamicMode.config);
    await user.click(within(more).getByRole('button', { name: 'Copy configuration document' }));
    expect(JSON.parse(writeText.mock.calls.at(-1)![0])).toEqual(dynamicMode.config);
    expect(within(more).getByText(/not both/)).toBeTruthy();
  });

  it('says when copying is not available', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const user = await openSnippet();
    await user.click(screen.getByRole('button', { name: 'Copy snippet' }));
    expect(
      await screen.findByText('Copying is not available here. Select the text and copy it.')
    ).toBeTruthy();
  });
});

describe('checking that it works', () => {
  const clickCheck = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: /^Check (now|again)/ }));

  it('reports data received in the last 24 hours, and configuration reachability, on the GitHub path', async () => {
    api.getAnalyticsOverview.mockResolvedValue(
      makeOverview({ totals: { pageViews: 12, uniqueUsers: 4 } })
    );
    const user = setup();
    await openInstall();
    await clickCheck(user);
    expect(await screen.findByText('Receiving data.')).toBeTruthy();
    expect(screen.getByText(/12 page views from Docs in the last 24 hours/)).toBeTruthy();
    expect(screen.getByText('Configuration file reachable.')).toBeTruthy();
    const [projectId, websiteId, start, end] = api.getAnalyticsOverview.mock.calls[0]!;
    expect([projectId, websiteId]).toEqual(['p1', 's1']);
    expect(Date.parse(end) - Date.parse(start)).toBe(24 * 60 * 60 * 1000);
    expect(api.getReachability).toHaveBeenCalledWith('p1', 's1');
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'View analytics' }));
    await waitFor(() =>
      expect(api.getAnalyticsOverview).toHaveBeenLastCalledWith(
        'p1',
        's1',
        expect.any(String),
        expect.any(String),
        expect.any(AbortSignal)
      )
    );
  });

  it('uses the singular for one page view', async () => {
    api.getAnalyticsOverview.mockResolvedValue(
      makeOverview({ totals: { pageViews: 1, uniqueUsers: 1 } })
    );
    const user = setup();
    await openInstall();
    await clickCheck(user);
    expect(await screen.findByText(/1 page view from Docs/)).toBeTruthy();
  });

  it('says what to do when nothing has arrived yet, without calling it a failure', async () => {
    const user = setup();
    await openInstall();
    await clickCheck(user);
    expect(await screen.findByText('No page views yet')).toBeTruthy();
    expect(screen.getByText(/allow\s+analytics, wait a minute or two/)).toBeTruthy();
    expect(
      within(document.querySelector('.check-result')!).getByRole('link', { name: 'Health' })
    ).toBeTruthy();
    expect(screen.queryByText(/could not be made/)).toBeNull();
  });

  it('says the check could not be made, instead of claiming nothing arrived', async () => {
    api.getAnalyticsOverview.mockRejectedValue(new Error('offline'));
    api.getReachability.mockRejectedValue(new Error('offline'));
    const user = setup();
    await openInstall();
    await clickCheck(user);
    expect(await screen.findByText(/The check could not be made/)).toBeTruthy();
    expect(screen.queryByText('No page views yet')).toBeNull();
    expect(screen.getByText('The configuration file could not be checked.')).toBeTruthy();
  });

  it('explains an unreachable configuration file, with the reason', async () => {
    api.getReachability.mockResolvedValue({
      configEndpointReachable: false,
      configEndpointCheckedAt: '2026-01-01T00:00:00.000Z',
      configEndpointError: 'network_error'
    });
    const user = setup();
    await openInstall();
    await clickCheck(user);
    expect(
      await screen.findByText(/Configuration file not reachable: the website could not be reached/)
    ).toBeTruthy();
    api.getReachability.mockResolvedValue({
      configEndpointReachable: false,
      configEndpointCheckedAt: '2026-01-01T00:00:00.000Z',
      configEndpointError: null
    });
    await clickCheck(user);
    expect(
      await screen.findByText(/Configuration file not reachable\. Check that the deploy finished/)
    ).toBeTruthy();
  });

  it('does not check the configuration file on the snippet path', async () => {
    const user = setup();
    await openInstall();
    await user.click(tab('Paste a snippet'));
    await clickCheck(user);
    await screen.findByText('No page views yet');
    expect(api.getReachability).not.toHaveBeenCalled();
    expect(screen.queryByText(/Configuration file/)).toBeNull();
  });

  it('shows a busy state while checking, and points at the website to open', async () => {
    let release: (value: unknown) => void = () => undefined;
    api.getAnalyticsOverview.mockImplementation(
      () => new Promise((resolve) => (release = resolve))
    );
    const user = setup();
    await openInstall();
    const link = screen.getByRole('link', { name: 'https://s1.test' });
    expect(link.getAttribute('target')).toBe('_blank');
    await clickCheck(user);
    expect(await screen.findByRole('button', { name: 'Checking…' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Checking…' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    await act(async () => release(makeOverview({ totals: { pageViews: 2, uniqueUsers: 1 } })));
    expect(await screen.findByText('Receiving data.')).toBeTruthy();
  });

  it('warns that a disabled website will not collect', async () => {
    await openInstall('s2');
    expect(screen.getAllByText(/disabled/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('link', { name: 'its page' }).getAttribute('href')).toBe(
      '#/manage/websites/s2'
    );
  });
});

describe('loading the guidance', () => {
  it('shows an error with a retry, not a blank page', async () => {
    api.getSnippet.mockRejectedValueOnce(new Error('offline'));
    const user = setup();
    window.location.hash = '#/manage/websites/s1/install';
    render(<App />);
    const alert = await screen.findByText(/Installation details are temporarily unavailable/);
    await user.click(within(alert.closest('p')!).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('tablist', { name: 'Deployment path' })).toBeTruthy();
  });

  it('has a way back to the website from the header', async () => {
    const user = setup();
    await openInstall();
    await user.click(screen.getByRole('link', { name: /Back to Docs/ }));
    expect(await screen.findByRole('heading', { level: 1, name: /Docs/ })).toBeTruthy();
    expect(window.location.hash).toBe('#/manage/websites/s1');
  });

  it('is reachable from a website page in one action', async () => {
    window.location.hash = '#/manage/websites/s1';
    const user = setup();
    render(<App />);
    await user.click(await screen.findByRole('link', { name: 'Install' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Install on Docs' })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'Escape' });
  });
});
