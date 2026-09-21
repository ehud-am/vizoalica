// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import type { ActionsReport } from '../src/api/local-operations.js';
import { makeActionsReport, makeOverview } from './fixtures/console.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  listProjects: vi.fn(),
  listWebsites: vi.fn(),
  getAnalyticsOverview: vi.fn(),
  getAnalyticsActions: vi.fn()
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
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
  api.bootstrapSession.mockResolvedValue(undefined);
  api.listProjects.mockResolvedValue([{ id: 'p1', name: 'Acme' }]);
  api.listWebsites.mockResolvedValue([website]);
  api.getAnalyticsOverview.mockResolvedValue(makeOverview());
  api.getAnalyticsActions.mockResolvedValue(makeActionsReport());
  window.location.hash = '#/analytics/actions';
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.location.hash = '';
});

async function openPage() {
  render(<App />);
  return screen.findByRole('heading', { level: 1, name: 'Actions' });
}
const rowsOf = (table: HTMLElement) => within(table).getAllByRole('row').slice(1);

describe('Actions page', () => {
  it('lists page-and-action rows with kind, destination, visitors, and actions per page view', async () => {
    await openPage();
    const table = await screen.findByRole('region', { name: 'Actions on pages table' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual([
      'Page',
      'Action',
      'Kind',
      'Actions',
      'Visitors',
      'Actions per page view'
    ]);
    const [first, second, third, fourth, other] = rowsOf(table);
    expect(first!.textContent).toContain('/pricing');
    expect(first!.textContent).toContain('Start free trial');
    expect(first!.textContent).toContain('to https://app.example.com/signup');
    expect(first!.textContent).toContain('Link');
    expect(
      within(first!)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
        .slice(-3)
    ).toEqual(['12', '8', '30%']);
    // One page view can produce several clicks, so the rate can pass 100%.
    expect(second!.textContent).toContain('200%');
    expect(third!.textContent).toContain('10%');
    // A page with no recorded views shows a dash with an accessible explanation.
    expect(within(fourth!).getByLabelText('No page views recorded for this page').textContent).toBe(
      '—'
    );
    expect(other!.textContent).toContain('Other');
    expect(other!.textContent).toContain('3 more page and action pairs');
  });

  it('shows each action summed across the pages it appears on', async () => {
    await openPage();
    const table = await screen.findByRole('region', {
      name: 'Most used actions across pages table'
    });
    const [first, , third] = rowsOf(table);
    expect(first!.textContent).toContain('Start free trial');
    expect(third!.textContent).toContain('Contact sales');
    expect(
      within(third!)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual(['Button', '5', '5', '2']);
  });

  it('links pages and actions to narrowed addresses that keep the other selection', async () => {
    window.location.hash = '#/analytics/actions?action=Contact%20sales';
    await openPage();
    const table = await screen.findByRole('region', { name: 'Actions on pages table' });
    const pageLink = within(table).getAllByRole('link', { name: '/pricing' })[0]!;
    expect(pageLink.getAttribute('href')).toBe(
      '#/analytics/actions?page=%2Fpricing&action=Contact%20sales'
    );
    const actionLink = within(table).getByRole('link', { name: 'Download invoice' });
    expect(actionLink.getAttribute('href')).toBe('#/analytics/actions?action=Download%20invoice');
  });

  it('never fetches the overview, and asks for the report for the shared scope and range', async () => {
    await openPage();
    await screen.findByRole('region', { name: 'Actions on pages table' });
    expect(api.getAnalyticsOverview).not.toHaveBeenCalled();
    const [projectId, websiteId, start, end, filters] = api.getAnalyticsActions.mock.calls[0]!;
    expect([projectId, websiteId, filters]).toEqual(['p1', undefined, {}]);
    expect(Date.parse(end) - Date.parse(start)).toBeGreaterThan(0);
  });

  it('shows placeholders while loading, then the content, and never a stale report', async () => {
    let resolve!: (value: ActionsReport) => void;
    api.getAnalyticsActions.mockReturnValueOnce(new Promise((next) => (resolve = next)));
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Actions' });
    expect(document.querySelector('.skeleton')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Actions on pages table' })).toBeNull();
    await act(async () => resolve(makeActionsReport()));
    expect(await screen.findByRole('region', { name: 'Actions on pages table' })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
  });

  it('shows an error with a retry, and loads again when retried', async () => {
    api.getAnalyticsActions.mockRejectedValueOnce(new Error('down'));
    await openPage();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Analytics are unavailable');
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Actions on pages table' })).toBeTruthy();
    expect(api.getAnalyticsActions).toHaveBeenCalledTimes(2);
  });

  it('warns when the range starts before the data was available', async () => {
    api.getAnalyticsActions.mockResolvedValue(
      makeActionsReport({
        availability: {
          state: 'incomplete',
          availableFromUtc: '2026-01-01T12:00:00.000Z',
          taxonomyVersions: [1]
        }
      })
    );
    await openPage();
    expect((await screen.findByText(/starts before expanded analytics/)).textContent).toContain(
      'Available results are shown'
    );
  });

  it('explains what an action is and where to check the setup when there are none', async () => {
    api.getAnalyticsActions.mockResolvedValue(
      makeActionsReport({
        totals: { actions: 0, uniqueUsers: 0 },
        rows: [],
        actions: [],
        other: { rows: 0, count: 0 }
      })
    );
    await openPage();
    const empty = await screen.findByText(/No actions in this range yet/);
    const text = empty.closest('p')!;
    expect(text.textContent).toContain('An action is a click on a button, a link');
    expect(text.textContent).toContain('updated SDK');
    expect(within(text).getByRole('link', { name: 'check the installation' })).toBeTruthy();
    expect(within(text).getByRole('link', { name: 'website health' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Actions on pages table' })).toBeNull();
  });

  it('offers a way back when a selection matches nothing', async () => {
    window.location.hash = '#/analytics/actions?page=%2Fnowhere';
    api.getAnalyticsActions.mockResolvedValue(
      makeActionsReport({
        totals: { actions: 0, uniqueUsers: 0 },
        rows: [],
        actions: [],
        other: { rows: 0, count: 0 },
        selection: { page: { path: '/nowhere', views: 0, actions: 0 } }
      })
    );
    await openPage();
    expect(await screen.findByText(/No actions match this selection/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Show all actions' }).getAttribute('href')).toBe(
      '#/analytics/actions'
    );
  });
});

describe('Actions page selection', () => {
  it('requests the report for the selection in the address and summarizes the selected page', async () => {
    window.location.hash = '#/analytics/actions?page=%2Fpricing';
    api.getAnalyticsActions.mockResolvedValue(
      makeActionsReport({
        totals: { actions: 16, uniqueUsers: 10 },
        selection: { page: { path: '/pricing', views: 40, actions: 16 } }
      })
    );
    await openPage();
    const summary = await screen.findByLabelText('Selected page');
    expect(summary.textContent).toContain('Page views');
    expect(summary.textContent).toContain('40');
    expect(summary.textContent).toContain('Actions on this page');
    expect(summary.textContent).toContain('16');
    expect(summary.textContent).toContain('40%');
    expect(api.getAnalyticsActions.mock.calls[0]![4]).toEqual({ page: '/pricing' });
    expect(screen.getByText('Showing 16 actions for the current selection.')).toBeTruthy();
  });

  it('shows removable filters that restore the wider report', async () => {
    window.location.hash = '#/analytics/actions?page=%2Fpricing&action=Contact%20sales';
    await openPage();
    const chips = await screen.findByRole('list', { name: 'Current selection' });
    expect(within(chips).getByText('/pricing')).toBeTruthy();
    expect(within(chips).getByText('Contact sales')).toBeTruthy();
    expect(
      within(chips).getByRole('link', { name: 'Remove page filter' }).getAttribute('href')
    ).toBe('#/analytics/actions?action=Contact%20sales');
    expect(
      within(chips).getByRole('link', { name: 'Remove action filter' }).getAttribute('href')
    ).toBe('#/analytics/actions?page=%2Fpricing');
    await userEvent.click(within(chips).getByRole('link', { name: 'Remove page filter' }));
    await act(settle);
    await waitFor(() =>
      expect(api.getAnalyticsActions.mock.calls.at(-1)![4]).toEqual({ action: 'Contact sales' })
    );
    await userEvent.click(await screen.findByRole('link', { name: 'Remove action filter' }));
    await act(settle);
    await waitFor(() => expect(api.getAnalyticsActions.mock.calls.at(-1)![4]).toEqual({}));
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Current selection' })).toBeNull()
    );
  });

  it('refetches when the selection changes and aborts the earlier request', async () => {
    await openPage();
    await screen.findByRole('region', { name: 'Actions on pages table' });
    const firstSignal = api.getAnalyticsActions.mock.calls[0]![5] as AbortSignal;
    expect(firstSignal.aborted).toBe(false);
    await act(async () => {
      window.location.hash = '#/analytics/actions?action=Go';
      await settle();
    });
    await waitFor(() => expect(api.getAnalyticsActions).toHaveBeenCalledTimes(2));
    expect(firstSignal.aborted).toBe(true);
    expect(api.getAnalyticsActions.mock.calls[1]![4]).toEqual({ action: 'Go' });
  });

  it('announces the number of actions shown to assistive technology', async () => {
    await openPage();
    await screen.findByRole('region', { name: 'Actions on pages table' });
    expect(screen.getByText('Showing 30 actions across all pages.')).toBeTruthy();
  });
});
