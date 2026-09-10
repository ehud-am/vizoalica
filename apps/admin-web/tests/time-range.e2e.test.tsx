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
const websites: Website[] = [];

function overview(): AnalyticsOverview {
  return {
    scope: { projectId: 'p1', sourceId: null, label: 'All websites', identityMode: 'project-supplied' },
    range: { startUtc: '2026-01-01T00:00:00.000Z', endUtc: '2026-01-02T00:00:00.000Z', interval: 'hour', timezone: 'UTC' },
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
    availability: { state: 'complete', taxonomyVersions: [1] }
  };
}

beforeEach(() => {
  api.listWebsites.mockResolvedValue(websites);
  api.getAnalyticsOverview.mockResolvedValue(overview());
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('time range selector to local API', () => {
  it.each([
    ['Last 6 hours', 6],
    ['Last 12 hours', 12],
    ['Last 24 hours', 24],
    ['Last 7 days', 24 * 7],
    ['Last 30 days', 24 * 30]
  ])('applies %s and requests exactly that span from the local API', async (label, hours) => {
    const user = userEvent.setup();
    render(<AnalyticsPage projects={projects} projectId="p1" onProjectChange={() => {}} />);
    await waitFor(() => expect(api.getAnalyticsOverview).toHaveBeenCalledTimes(1));
    api.getAnalyticsOverview.mockClear();

    await user.click(await screen.findByRole('button', { name: /^Last/ }));
    await user.click(screen.getByRole('radio', { name: label }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(api.getAnalyticsOverview).toHaveBeenCalledTimes(1));
    const [, , startUtc, endUtc] = api.getAnalyticsOverview.mock.calls[0]!;
    const spanMs = new Date(endUtc).getTime() - new Date(startUtc).getTime();
    expect(spanMs).toBe(hours * 60 * 60 * 1000);
    expect(await screen.findByRole('button', { name: label })).toBeTruthy();
  });

  it('applies one valid custom range and requests exactly its UTC boundaries', async () => {
    const user = userEvent.setup();
    render(<AnalyticsPage projects={projects} projectId="p1" onProjectChange={() => {}} />);
    await waitFor(() => expect(api.getAnalyticsOverview).toHaveBeenCalledTimes(1));
    api.getAnalyticsOverview.mockClear();

    await user.click(await screen.findByRole('button', { name: /^Last/ }));
    await user.click(screen.getByRole('radio', { name: 'Custom' }));
    const from = screen.getByLabelText('From') as HTMLInputElement;
    const to = screen.getByLabelText('To') as HTMLInputElement;
    await user.clear(from);
    await user.type(from, '2026-01-01T00:00');
    await user.clear(to);
    await user.type(to, '2026-01-02T00:00');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(api.getAnalyticsOverview).toHaveBeenCalledTimes(1));
    const [, , startUtc, endUtc] = api.getAnalyticsOverview.mock.calls[0]!;
    expect(new Date(endUtc).getTime() - new Date(startUtc).getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('issues no request for an invalid custom range and keeps the prior applied range active', async () => {
    const user = userEvent.setup();
    render(<AnalyticsPage projects={projects} projectId="p1" onProjectChange={() => {}} />);
    await waitFor(() => expect(api.getAnalyticsOverview).toHaveBeenCalledTimes(1));
    api.getAnalyticsOverview.mockClear();

    await user.click(await screen.findByRole('button', { name: 'Last 24 hours' }));
    await user.click(screen.getByRole('radio', { name: 'Custom' }));
    const from = screen.getByLabelText('From') as HTMLInputElement;
    const to = screen.getByLabelText('To') as HTMLInputElement;
    await user.clear(from);
    await user.type(from, '2026-01-02T00:00');
    await user.clear(to);
    await user.type(to, '2026-01-01T00:00');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(api.getAnalyticsOverview).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Last 24 hours' })).toBeTruthy();
  });
});
