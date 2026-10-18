// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { ApiError } from '../src/api/local-operations.js';
import { makeCampaignsReport, makeOverview } from './fixtures/console.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  listProjects: vi.fn(),
  listWebsites: vi.fn(),
  getAnalyticsOverview: vi.fn(),
  getAnalyticsCampaigns: vi.fn()
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
  api.getAnalyticsCampaigns.mockResolvedValue(makeCampaignsReport());
  window.location.hash = '#/analytics/campaigns';
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.location.hash = '';
});

async function openPage() {
  render(<App />);
  return screen.findByRole('heading', { level: 1, name: 'Campaigns' });
}
const rowsOf = (table: HTMLElement) => within(table).getAllByRole('row').slice(1);
const cellsOf = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent);

describe('Campaigns page', () => {
  it('shows the totals and the share of all page views', async () => {
    await openPage();
    await screen.findByRole('region', { name: 'Sources table' });
    const totals = document.querySelector('dl[aria-label="Totals"]');
    expect(totals?.textContent).toContain('30');
    expect(totals?.textContent).toContain('18');
    expect(totals?.textContent).toContain('25%');
    expect(api.getAnalyticsOverview).not.toHaveBeenCalled();
  });

  it('ranks sources, mediums and campaigns, writing an unset label as (not set)', async () => {
    await openPage();
    const sources = await screen.findByRole('region', { name: 'Sources table' });
    expect(
      within(sources)
        .getAllByRole('columnheader')
        .map((header) => header.textContent)
    ).toEqual(['Source', 'Page views', 'Visitors']);
    expect(cellsOf(rowsOf(sources)[0]!)).toEqual(['22', '12']);
    const campaigns = screen.getByRole('region', { name: 'Campaigns table' });
    const [first, unset, other] = rowsOf(campaigns);
    expect(first!.textContent).toContain('spring-sale');
    expect(unset!.textContent).toContain('(not set)');
    expect(within(unset!).queryByRole('link')).toBeNull();
    expect(other!.textContent).toContain('Other');
  });

  it('lists the top combinations with the rest as Other', async () => {
    await openPage();
    const table = await screen.findByRole('region', { name: 'Top combinations table' });
    const [first, second, other] = rowsOf(table);
    expect(first!.textContent).toContain('newsletter');
    expect(first!.textContent).toContain('email');
    expect(first!.textContent).toContain('spring-sale');
    expect(second!.textContent).toContain('(not set)');
    expect(other!.textContent).toContain('4 more combinations');
  });

  it('links each label so the selection is kept in the address', async () => {
    await openPage();
    const sources = await screen.findByRole('region', { name: 'Sources table' });
    expect(within(sources).getByRole('link', { name: 'newsletter' }).getAttribute('href')).toBe(
      '#/analytics/campaigns?source=newsletter'
    );
    const mediums = screen.getByRole('region', { name: 'Mediums table' });
    expect(within(mediums).getByRole('link', { name: 'social' }).getAttribute('href')).toBe(
      '#/analytics/campaigns?medium=social'
    );
  });

  it('asks the backend for the selection and offers a way to remove each filter', async () => {
    window.location.hash = '#/analytics/campaigns?source=newsletter&campaign=spring-sale';
    await openPage();
    await waitFor(() =>
      expect(api.getAnalyticsCampaigns).toHaveBeenCalledWith(
        'p1',
        undefined,
        expect.any(String),
        expect.any(String),
        { source: 'newsletter', campaign: 'spring-sale' },
        expect.anything()
      )
    );
    const chips = await screen.findByRole('list', { name: 'Current selection' });
    expect(
      within(chips).getByRole('link', { name: 'Remove source filter' }).getAttribute('href')
    ).toBe('#/analytics/campaigns?campaign=spring-sale');
    expect(
      within(chips).getByRole('link', { name: 'Remove campaign filter' }).getAttribute('href')
    ).toBe('#/analytics/campaigns?source=newsletter');
  });

  it('shows how to tag a link when there is none, and a way out when a selection is empty', async () => {
    const empty = makeCampaignsReport({
      totals: { pageViews: 0, uniqueUsers: 0, allPageViews: 10 },
      rows: [],
      sources: { items: [], otherCount: 0 },
      mediums: { items: [], otherCount: 0 },
      campaigns: { items: [], otherCount: 0 },
      other: { rows: 0, count: 0 }
    });
    api.getAnalyticsCampaigns.mockResolvedValue(empty);
    await openPage();
    expect(await screen.findByText(/No page views from tagged links/)).toBeTruthy();
    expect(
      document.querySelector('a[href="https://vizoalica.dev/operations/campaigns"]')
    ).toBeTruthy();
    cleanup();
    window.location.hash = '#/analytics/campaigns?source=nothing';
    await openPage();
    expect(await screen.findByRole('link', { name: 'Show all campaigns' })).toBeTruthy();
  });

  it('says when the range starts before campaign reports began', async () => {
    api.getAnalyticsCampaigns.mockResolvedValue(
      makeCampaignsReport({
        availability: {
          state: 'incomplete',
          availableFromUtc: '2026-01-01T01:00:00.000Z',
          taxonomyVersions: [1]
        }
      })
    );
    await openPage();
    expect(
      (await screen.findByText(/Earlier page views in this range are not included/)).textContent
    ).toContain('Campaign reports began');
  });

  it('shows an error with a retry', async () => {
    api.getAnalyticsCampaigns.mockRejectedValueOnce(new Error('unavailable'));
    await openPage();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Try again');
  });

  it('tells the owner to update a backend that predates the report', async () => {
    api.getAnalyticsCampaigns.mockRejectedValueOnce(new ApiError('not_found', 404));
    await openPage();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('does not report campaigns yet');
    expect(alert.textContent).toContain('vizoalica deploy <name> --update');
  });

  it('does not break on a label the address cannot carry', async () => {
    api.getAnalyticsCampaigns.mockResolvedValue(
      makeCampaignsReport({
        sources: { items: [{ label: 'bad\ud840', count: 3, visitors: 1 }], otherCount: 0 }
      })
    );
    await openPage();
    const table = await screen.findByRole('region', { name: 'Sources table' });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
  });
});
