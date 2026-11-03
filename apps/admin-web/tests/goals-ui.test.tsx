// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { ApiError } from '../src/api/local-operations.js';
import { applyApiDefaults, docs } from './fixtures/api.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  listProjects: vi.fn(),
  listWebsites: vi.fn(),
  updateWebsite: vi.fn(),
  getSnippet: vi.fn(),
  getStatus: vi.fn(),
  getReachability: vi.fn(),
  getAnalyticsOverview: vi.fn(),
  getExcludedHits: vi.fn(),
  getSetupState: vi.fn(),
  getGoalsReport: vi.fn(),
  getGoalsList: vi.fn(),
  createGoal: vi.fn(),
  deleteGoal: vi.fn()
}));
vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

const goal = (id: string, name: string, kind: 'page' | 'action' | 'event', target: string) => ({
  id,
  name,
  kind,
  target,
  createdAt: '2026-01-01T00:00:00.000Z'
});
const report = (goals: unknown[]) => ({
  scope: { projectId: 'p1', sourceId: 's1', label: 'Docs' },
  range: {
    startUtc: '2026-01-01T00:00:00.000Z',
    endUtc: '2026-01-02T00:00:00.000Z',
    interval: 'day'
  },
  totals: { pageViews: 200, visitors: 80 },
  goals,
  availability: { state: 'complete' }
});

beforeEach(() => {
  applyApiDefaults(api, { p1: [docs] });
  api.getSetupState.mockRejectedValue(new Error('offline'));
  api.getExcludedHits.mockResolvedValue({ total: 0, days: [], windowDays: 30 });
  api.getGoalsList.mockResolvedValue([]);
  window.localStorage.setItem(
    'vizoalica.console.scope',
    JSON.stringify({ projectId: 'p1', websiteId: 's1' })
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.location.hash = '';
});

describe('Goals page', () => {
  it('shows conversions, visitors and the rate of each goal', async () => {
    window.location.hash = '#/analytics/goals';
    api.getGoalsReport.mockResolvedValue(
      report([
        {
          goal: goal('g1', 'Signed up', 'event', 'signup'),
          conversions: 12,
          visitors: 8,
          rate: 0.1,
          rateBasis: 'visitors',
          trend: []
        },
        {
          goal: goal('g2', 'Saw pricing', 'page', '/pricing'),
          conversions: 50,
          visitors: null,
          rate: 0.25,
          rateBasis: 'page_views',
          trend: []
        }
      ])
    );
    render(<App />);
    const table = await screen.findByRole('region', { name: 'Goals table' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent)
      )
    ).toEqual([
      ['Event · signup', '12', '8', '10% of visitors'],
      ['Page view · /pricing', '50', '—', '25% of page views']
    ]);
    expect(api.getGoalsReport).toHaveBeenCalledWith(
      'p1',
      's1',
      expect.any(String),
      expect.any(String),
      expect.anything()
    );
    expect(document.querySelector('dl[aria-label="Totals"]')?.textContent).toContain('80');
  });

  it('points to the website page when there are no goals', async () => {
    window.location.hash = '#/analytics/goals';
    api.getGoalsReport.mockResolvedValue(report([]));
    render(<App />);
    const link = await screen.findByRole('link', { name: 'Add a goal' });
    expect(link.getAttribute('href')).toBe('#/manage/websites/:id'.replace(':id', 's1'));
  });

  it('asks for a website when none is chosen, and loads nothing', async () => {
    window.localStorage.setItem(
      'vizoalica.console.scope',
      JSON.stringify({ projectId: 'p1', websiteId: '' })
    );
    window.location.hash = '#/analytics/goals';
    render(<App />);
    expect(await screen.findByText(/Choose a website above/)).toBeTruthy();
    expect(api.getGoalsReport).not.toHaveBeenCalled();
  });

  it('says a backend without goals needs an update', async () => {
    window.location.hash = '#/analytics/goals';
    api.getGoalsReport.mockRejectedValue(new ApiError('not_found', 404));
    render(<App />);
    expect(await screen.findByText(/does not report goals yet/)).toBeTruthy();
  });
});

describe('Goals on the website page', () => {
  it('lists, adds and deletes goals', async () => {
    window.location.hash = '#/manage/websites/s1';
    const user = userEvent.setup();
    api.getGoalsList.mockResolvedValue([goal('g1', 'Signed up', 'event', 'signup')]);
    api.createGoal.mockResolvedValue(goal('g2', 'Saw pricing', 'page', '/pricing'));
    api.deleteGoal.mockResolvedValue({ status: 'deleted' });
    render(<App />);
    const list = await screen.findByRole('list', { name: 'Goals' });
    expect(within(list).getByText('Signed up')).toBeTruthy();

    await user.type(screen.getByLabelText('Goal name'), 'Saw pricing');
    await user.selectOptions(screen.getByLabelText('Counts'), 'page');
    await user.type(screen.getByLabelText('What to count'), '/pricing');
    await user.click(screen.getByRole('button', { name: 'Add goal' }));
    await waitFor(() =>
      expect(api.createGoal).toHaveBeenCalledWith('p1', 's1', {
        name: 'Saw pricing',
        kind: 'page',
        target: '/pricing'
      })
    );
    expect(
      await within(screen.getByRole('list', { name: 'Goals' })).findByText('Saw pricing')
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Delete goal Signed up' }));
    await waitFor(() => expect(api.deleteGoal).toHaveBeenCalledWith('p1', 's1', 'g1'));
    await waitFor(() => expect(screen.queryByText('Signed up')).toBeNull());
  });

  it('refuses an empty goal before asking the backend, and explains an old backend', async () => {
    window.location.hash = '#/manage/websites/s1';
    const user = userEvent.setup();
    render(<App />);
    await screen.findByLabelText('Goal name');
    await user.click(screen.getByRole('button', { name: 'Add goal' }));
    expect(await screen.findByText('Enter a name and what to count.')).toBeTruthy();
    expect(api.createGoal).not.toHaveBeenCalled();
  });

  it('explains a page goal without a slash, a backend that needs an update, and a failed delete', async () => {
    window.location.hash = '#/manage/websites/s1';
    const user = userEvent.setup();
    api.getGoalsList.mockResolvedValue([goal('g1', 'Signed up', 'event', 'signup')]);
    render(<App />);
    await screen.findByRole('list', { name: 'Goals' });
    await user.type(screen.getByLabelText('Goal name'), 'Thanks');
    await user.selectOptions(screen.getByLabelText('Counts'), 'page');
    await user.type(screen.getByLabelText('What to count'), 'thanks');
    api.createGoal.mockRejectedValueOnce(new ApiError('invalid_request', 400));
    await user.click(screen.getByRole('button', { name: 'Add goal' }));
    expect(await screen.findByText('A page goal starts with /, such as /thanks.')).toBeTruthy();

    await user.selectOptions(screen.getByLabelText('Counts'), 'event');
    api.createGoal.mockRejectedValueOnce(new ApiError('database_update_needed', 503));
    await user.click(screen.getByRole('button', { name: 'Add goal' }));
    expect(await screen.findByText(/needs its latest update/)).toBeTruthy();

    api.createGoal.mockRejectedValueOnce(new ApiError('invalid_request', 400));
    await user.click(screen.getByRole('button', { name: 'Add goal' }));
    expect(await screen.findByText(/could not be added/)).toBeTruthy();

    api.deleteGoal.mockRejectedValueOnce(new ApiError('remote_unavailable', 502));
    await user.click(screen.getByRole('button', { name: 'Delete goal Signed up' }));
    expect(await screen.findByText('The goal could not be deleted. Try again.')).toBeTruthy();
  });

  it('hides the form once the website has twenty goals', async () => {
    window.location.hash = '#/manage/websites/s1';
    api.getGoalsList.mockResolvedValue(
      Array.from({ length: 20 }, (_, n) => goal(`g${n}`, `Goal ${n}`, 'event', `e${n}`))
    );
    render(<App />);
    await screen.findByRole('list', { name: 'Goals' });
    expect(screen.queryByRole('form', { name: 'Add a goal' })).toBeNull();
  });

  it('says an older backend cannot count goals', async () => {
    window.location.hash = '#/manage/websites/s1';
    api.getGoalsList.mockRejectedValue(new ApiError('not_found', 404));
    render(<App />);
    expect(await screen.findByText(/older than 0.14/)).toBeTruthy();
  });
});

describe('Group pages field on the edit page', () => {
  it('saves rules written one per line', async () => {
    window.location.hash = '#/manage/websites/s1/edit';
    api.listWebsites.mockResolvedValue([{ ...docs, groupingRules: [] }]);
    const user = userEvent.setup();
    render(<App />);
    const field = await screen.findByLabelText(/Group pages/);
    await user.type(field, '/blog/* => /blog/:post');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(api.updateWebsite).toHaveBeenCalledWith(
        'p1',
        's1',
        expect.objectContaining({ groupingRules: [{ pattern: '/blog/*', key: '/blog/:post' }] })
      )
    );
  });

  it('names the line that is not a rule and sends nothing', async () => {
    window.location.hash = '#/manage/websites/s1/edit';
    api.listWebsites.mockResolvedValue([{ ...docs, groupingRules: [] }]);
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText(/Group pages/), 'blog => /x');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Line 1:/)).toBeTruthy();
    expect(api.updateWebsite).not.toHaveBeenCalled();
  });

  it('is left out for a backend that does not send rules', async () => {
    window.location.hash = '#/manage/websites/s1/edit';
    render(<App />);
    await screen.findByRole('textbox', { name: 'Website name' });
    expect(screen.queryByLabelText(/Group pages/)).toBeNull();
  });
});
