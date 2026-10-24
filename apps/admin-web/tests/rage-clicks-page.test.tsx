// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { ApiError } from '../src/api/local-operations.js';
import { makeOverview, makeRageClicksReport } from './fixtures/console.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  listProjects: vi.fn(),
  listWebsites: vi.fn(),
  getAnalyticsOverview: vi.fn(),
  getAnalyticsRageClicks: vi.fn()
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
  api.getAnalyticsRageClicks.mockResolvedValue(makeRageClicksReport());
  window.location.hash = '#/analytics/rage-clicks';
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.location.hash = '';
});

async function openPage() {
  render(<App />);
  return screen.findByRole('heading', { level: 1, name: 'Rage clicks' });
}
const rowsOf = (table: HTMLElement) => within(table).getAllByRole('row').slice(1);
const cellsOf = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent);

describe('Rage clicks page', () => {
  it('shows the totals and does not load the overview', async () => {
    await openPage();
    await screen.findByRole('region', { name: 'Controls with rage clicks table' });
    const totals = document.querySelector('dl[aria-label="Totals"]');
    expect(totals?.textContent).toContain('14');
    expect(totals?.textContent).toContain('120');
    expect(api.getAnalyticsOverview).not.toHaveBeenCalled();
  });

  it('lists controls with bursts, clicks and the rate, and the rest as Other', async () => {
    await openPage();
    const table = await screen.findByRole('region', { name: 'Controls with rage clicks table' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent)
    ).toEqual(['Control', 'Page', 'Bursts', 'Clicks', 'Bursts per click']);
    const [first, second, other] = rowsOf(table);
    expect(first!.textContent).toContain('Pay now');
    expect(cellsOf(first!)).toEqual(['/checkout', '9', '60', '15%']);
    // No ordinary clicks were recorded for the link, so no rate can be given.
    expect(cellsOf(second!)).toEqual(['/pricing', '3', '0', '—']);
    expect(other!.textContent).toContain('2 more controls');
  });

  it('links each control to its row in the Actions report', async () => {
    await openPage();
    const table = await screen.findByRole('region', { name: 'Controls with rage clicks table' });
    expect(within(table).getByRole('link', { name: 'Pay now' }).getAttribute('href')).toBe(
      '#/analytics/actions?page=%2Fcheckout&action=Pay%20now'
    );
  });

  it('explains what counts when there are none', async () => {
    api.getAnalyticsRageClicks.mockResolvedValue(
      makeRageClicksReport({
        totals: { bursts: 0, clicks: 10 },
        rows: [],
        other: { rows: 0, count: 0 }
      })
    );
    await openPage();
    expect(await screen.findByText(/No rage clicks in this range/)).toBeTruthy();
    expect(
      document.querySelector('a[href="https://vizoalica.dev/operations/rage-clicks"]')
    ).toBeTruthy();
  });

  it('says when the range starts before rage click reports began', async () => {
    api.getAnalyticsRageClicks.mockResolvedValue(
      makeRageClicksReport({
        availability: {
          state: 'incomplete',
          availableFromUtc: '2026-01-01T01:00:00.000Z',
          taxonomyVersions: [1]
        }
      })
    );
    await openPage();
    expect(
      (await screen.findByText(/Earlier clicks in this range are not included/)).textContent
    ).toContain('Rage click reports began');
  });

  it('shows an error with a retry', async () => {
    api.getAnalyticsRageClicks.mockRejectedValueOnce(new Error('unavailable'));
    await openPage();
    expect((await screen.findByRole('alert')).textContent).toContain('Try again');
  });

  it('tells the owner to update a backend that predates the report', async () => {
    api.getAnalyticsRageClicks.mockRejectedValueOnce(new ApiError('not_found', 404));
    await openPage();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('does not report rage clicks yet');
    expect(alert.textContent).toContain('vizoalica deploy <name> --update');
  });

  it('says the database needs its update when the backend answers so', async () => {
    api.getAnalyticsRageClicks.mockRejectedValueOnce(new ApiError('database_update_needed', 503));
    await openPage();
    expect((await screen.findByRole('alert')).textContent).toContain('needs its latest update');
  });
});
