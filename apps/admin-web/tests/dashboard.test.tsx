// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsPage } from '../src/pages/AnalyticsPage.js';
import type { AnalyticsOverview, Project, Website } from '../src/api/local-operations.js';

const api = vi.hoisted(() => ({
  listWebsites: vi.fn(),
  getAnalyticsOverview: vi.fn()
}));
vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

const projects: Project[] = [{ id: 'p1', name: 'Acme' }];
const websites: Website[] = [
  {
    id: 's1',
    projectId: 'p1',
    name: 'Docs',
    publicSourceKey: 'public',
    allowedOrigins: ['https://docs.test'],
    status: 'active'
  }
];

function overview(overrides: Partial<AnalyticsOverview> = {}): AnalyticsOverview {
  return {
    scope: {
      projectId: 'p1',
      sourceId: null,
      label: 'All websites',
      identityMode: 'project-supplied'
    },
    range: {
      startUtc: '2026-01-01T00:00:00.000Z',
      endUtc: '2026-01-02T00:00:00.000Z',
      interval: 'hour',
      timezone: 'UTC'
    },
    totals: { pageViews: 0, uniqueUsers: 0 },
    trend: [],
    rankings: {
      pagePaths: { items: [], otherCount: 0, total: 0 },
      countries: { items: [], otherCount: 0, total: 0 },
      userAgents: { items: [], otherCount: 0, total: 0 },
      referrers: { items: [], otherCount: 0, total: 0 }
    },
    distributions: {
      operatingSystems: { items: [], total: 0 },
      browsers: { items: [], total: 0 },
      devices: { items: [], total: 0 },
      traffic: { items: [], total: 0 }
    },
    availability: { state: 'complete', taxonomyVersions: [1] },
    ...overrides
  };
}

beforeEach(() => {
  api.listWebsites.mockResolvedValue(websites);
  api.getAnalyticsOverview.mockResolvedValue(overview());
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('dashboard overview', () => {
  it('requests the all-websites scope by default and renders totals', async () => {
    render(<AnalyticsPage projects={projects} projectId="p1" onProjectChange={() => {}} />);
    await waitFor(() =>
      expect(api.getAnalyticsOverview).toHaveBeenCalledWith(
        'p1',
        undefined,
        expect.any(String),
        expect.any(String),
        expect.any(AbortSignal)
      )
    );
  });

  it('shows explicit zeros rather than a blank grid for an empty range', async () => {
    render(<AnalyticsPage projects={projects} projectId="p1" onProjectChange={() => {}} />);
    expect(await screen.findByText('Page views')).toBeTruthy();
    const zeros = await screen.findAllByText('0');
    expect(zeros.length).toBeGreaterThan(0);
    expect(screen.getAllByText('No data in this range.').length).toBeGreaterThan(0);
  });

  it('labels a disabled website as history-only rather than hiding it', async () => {
    api.listWebsites.mockResolvedValue([
      ...websites,
      {
        id: 's2',
        projectId: 'p1',
        name: 'Legacy',
        publicSourceKey: 'public-2',
        allowedOrigins: ['https://legacy.test'],
        status: 'disabled'
      }
    ]);
    render(<AnalyticsPage projects={projects} projectId="p1" onProjectChange={() => {}} />);
    expect(await screen.findByText('Legacy (history only, disabled)')).toBeTruthy();
  });

  it('switches scope to a single website and re-requests that source', async () => {
    const user = userEvent.setup();
    render(<AnalyticsPage projects={projects} projectId="p1" onProjectChange={() => {}} />);
    await waitFor(() => expect(api.getAnalyticsOverview).toHaveBeenCalledTimes(1));
    await user.selectOptions(await screen.findByLabelText('Website'), 's1');
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

  it('renders top-ten rankings with an Other remainder row', async () => {
    api.getAnalyticsOverview.mockResolvedValue(
      overview({
        totals: { pageViews: 130, uniqueUsers: 40 },
        rankings: {
          pagePaths: {
            items: [
              { label: '/', count: 100 },
              { label: '/pricing', count: 20 }
            ],
            otherCount: 10,
            total: 130
          },
          countries: { items: [], otherCount: 0, total: 0 },
          userAgents: { items: [], otherCount: 0, total: 0 },
          referrers: { items: [], otherCount: 0, total: 0 }
        }
      })
    );
    render(<AnalyticsPage projects={projects} projectId="p1" onProjectChange={() => {}} />);
    expect(await screen.findByText('/')).toBeTruthy();
    expect(screen.getByText('/pricing')).toBeTruthy();
    expect(screen.getByText('Other')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
  });

  it('shows the incomplete-history notice when the range predates expanded analytics', async () => {
    api.getAnalyticsOverview.mockResolvedValue(
      overview({
        availability: {
          state: 'incomplete',
          availableFromUtc: '2026-01-01T12:00:00.000Z',
          taxonomyVersions: [1]
        }
      })
    );
    render(<AnalyticsPage projects={projects} projectId="p1" onProjectChange={() => {}} />);
    expect(
      await screen.findByText(/starts before expanded analytics were available/)
    ).toBeTruthy();
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
      .mockResolvedValueOnce(overview({ totals: { pageViews: 7, uniqueUsers: 3 } }));
    const user = userEvent.setup();
    render(<AnalyticsPage projects={projects} projectId="p1" onProjectChange={() => {}} />);
    await waitFor(() => expect(api.getAnalyticsOverview).toHaveBeenCalledTimes(1));
    await user.selectOptions(await screen.findByLabelText('Website'), 's1');
    await waitFor(() => expect(api.getAnalyticsOverview).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('7')).toBeTruthy();
    resolveFirst(overview({ totals: { pageViews: 999, uniqueUsers: 999 } }));
    expect(screen.queryByText('999')).toBeNull();
  });
});
