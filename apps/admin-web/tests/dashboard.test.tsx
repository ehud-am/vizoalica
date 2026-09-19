// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import type { AnalyticsOverview } from '../src/api/local-operations.js';
import { makeOverview } from './fixtures/console.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  listProjects: vi.fn(),
  listWebsites: vi.fn(),
  getAnalyticsOverview: vi.fn()
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

beforeEach(() => {
  api.bootstrapSession.mockResolvedValue(undefined);
  api.listProjects.mockResolvedValue([{ id: 'p1', name: 'Acme' }]);
  api.listWebsites.mockResolvedValue([website]);
  api.getAnalyticsOverview.mockResolvedValue(makeOverview());
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('analytics overview', () => {
  it('requests the all-websites scope by default, for the range and the range before it', async () => {
    render(<App />);
    await waitFor(() => expect(api.getAnalyticsOverview).toHaveBeenCalledTimes(2));
    const [current, previous] = api.getAnalyticsOverview.mock.calls as string[][];
    expect(current!.slice(0, 2)).toEqual(['p1', undefined]);
    // The comparison range ends exactly where the selected range starts and has the same length.
    expect(previous![3]).toBe(current![2]);
    expect(Date.parse(current![3]!) - Date.parse(current![2]!)).toBe(
      Date.parse(previous![3]!) - Date.parse(previous![2]!)
    );
  });

  it('shows explicit zeros and a no-page-views hint rather than a blank page', async () => {
    render(<App />);
    expect(await screen.findByText('Page views')).toBeTruthy();
    expect((await screen.findAllByText('0')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('No data in this range.').length).toBeGreaterThan(0);
    const hint = await screen.findByText(/No page views in this range yet/);
    expect(
      within(hint.closest('p')!).getByRole('link', { name: 'check the installation' })
    ).toBeTruthy();
  });

  it('names the website in the no-events hint when one is selected', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('option', { name: 'Docs' });
    await user.selectOptions(screen.getByLabelText('Website'), 's1');
    expect(await screen.findByText(/No page views from Docs in this range yet/)).toBeTruthy();
  });

  it('labels a disabled website as history-only rather than hiding it', async () => {
    api.listWebsites.mockResolvedValue([
      website,
      { ...website, id: 's2', name: 'Legacy', status: 'disabled' as const }
    ]);
    render(<App />);
    expect(await screen.findByText('Legacy (history only, disabled)')).toBeTruthy();
  });

  it('never offers a deleted website', async () => {
    api.listWebsites.mockResolvedValue([
      website,
      { ...website, id: 's3', name: 'Gone', status: 'deleted' as const }
    ]);
    render(<App />);
    await screen.findByText('Docs');
    expect(screen.queryByText('Gone')).toBeNull();
  });

  it('switches scope to a single website and re-requests that source', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(api.getAnalyticsOverview).toHaveBeenCalledTimes(2));
    await screen.findByRole('option', { name: 'Docs' });
    await user.selectOptions(screen.getByLabelText('Website'), 's1');
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

  it('shows the top five with a link to the full list, and Show all on the dedicated view', async () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      label: `/page-${index}`,
      count: 100 - index
    }));
    api.getAnalyticsOverview.mockResolvedValue(
      makeOverview({
        totals: { pageViews: 1000, uniqueUsers: 40 },
        rankings: {
          pagePaths: { items, otherCount: 30, total: 1000 },
          countries: { items: [], otherCount: 0, total: 0 },
          userAgents: { items: [], otherCount: 0, total: 0 },
          referrers: { items: [], otherCount: 0, total: 0 }
        }
      })
    );
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText('/page-0')).toBeTruthy();
    expect(screen.queryByText('/page-5')).toBeNull();
    await user.click(screen.getByRole('link', { name: 'All pages' }));
    expect(await screen.findByRole('heading', { name: 'Pages' })).toBeTruthy();
    expect(screen.getByText('/page-9')).toBeTruthy();
    expect(screen.queryByText('/page-10')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Show all 12/ }));
    expect(screen.getByText('/page-11')).toBeTruthy();
    expect(screen.getByText('Other')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show top 10' }));
    expect(screen.queryByText('/page-11')).toBeNull();
  });

  it('shows the incomplete-history notice when the range predates expanded analytics', async () => {
    api.getAnalyticsOverview.mockResolvedValue(
      makeOverview({
        availability: {
          state: 'incomplete',
          availableFromUtc: '2026-01-01T12:00:00.000Z',
          taxonomyVersions: [1]
        }
      })
    );
    render(<App />);
    expect(await screen.findByText(/starts before expanded analytics were available/)).toBeTruthy();
  });

  it('discards a stale in-flight response when the scope changes again before it resolves', async () => {
    let resolveFirst: (value: AnalyticsOverview) => void = () => {};
    api.getAnalyticsOverview
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce(makeOverview()) // the first comparison request
      .mockResolvedValue(makeOverview({ totals: { pageViews: 7, uniqueUsers: 3 } }));
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(api.getAnalyticsOverview).toHaveBeenCalledTimes(2));
    await screen.findByRole('option', { name: 'Docs' });
    await user.selectOptions(screen.getByLabelText('Website'), 's1');
    expect(await screen.findByText('7')).toBeTruthy();
    resolveFirst(makeOverview({ totals: { pageViews: 999, uniqueUsers: 999 } }));
    expect(screen.queryByText('999')).toBeNull();
  });

  it('shows headline metrics with the change against the previous period', async () => {
    api.getAnalyticsOverview
      .mockResolvedValueOnce(
        makeOverview({
          totals: { pageViews: 150, uniqueUsers: 40 },
          trend: [
            { startUtc: '2026-01-01T00:00:00.000Z', pageViews: 60, uniqueUsers: 20 },
            { startUtc: '2026-01-01T01:00:00.000Z', pageViews: 90, uniqueUsers: 20 }
          ]
        })
      )
      .mockResolvedValueOnce(makeOverview({ totals: { pageViews: 100, uniqueUsers: 40 } }));
    render(<App />);
    expect(await screen.findByText('150')).toBeTruthy();
    expect(await screen.findByText('Up 50%')).toBeTruthy();
    expect(screen.getByText('No change')).toBeTruthy();
    expect(screen.getAllByText(/vs 100 in the previous 24 hours/).length).toBe(1);
  });

  it('says so when the previous period cannot be compared', async () => {
    api.getAnalyticsOverview
      .mockResolvedValueOnce(makeOverview({ totals: { pageViews: 5, uniqueUsers: 2 } }))
      .mockRejectedValueOnce(new Error('out of range'));
    render(<App />);
    expect((await screen.findAllByText('Comparison unavailable')).length).toBe(2);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('says so when earlier data was not available', async () => {
    api.getAnalyticsOverview
      .mockResolvedValueOnce(makeOverview({ totals: { pageViews: 5, uniqueUsers: 2 } }))
      .mockResolvedValueOnce(
        makeOverview({ availability: { state: 'incomplete', taxonomyVersions: [1] } })
      );
    render(<App />);
    expect((await screen.findAllByText('No earlier data to compare')).length).toBe(2);
  });

  it('keeps headings in place while loading and never shows numbers from the previous scope', async () => {
    let resolveSecond: (value: AnalyticsOverview) => void = () => {};
    api.getAnalyticsOverview
      .mockResolvedValueOnce(makeOverview({ totals: { pageViews: 111, uniqueUsers: 1 } }))
      .mockResolvedValueOnce(makeOverview())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          })
      )
      .mockResolvedValue(makeOverview());
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText('111')).toBeTruthy();
    await screen.findByRole('option', { name: 'Docs' });
    await user.selectOptions(screen.getByLabelText('Website'), 's1');
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeTruthy();
    expect(screen.queryByText('111')).toBeNull();
    resolveSecond(makeOverview({ totals: { pageViews: 222, uniqueUsers: 2 } }));
    expect(await screen.findByText('222')).toBeTruthy();
  });
});
