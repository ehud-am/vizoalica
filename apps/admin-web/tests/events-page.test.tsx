// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { makeCustomEventsReport, makeOverview } from './fixtures/console.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  listProjects: vi.fn(),
  listWebsites: vi.fn(),
  getAnalyticsOverview: vi.fn(),
  getAnalyticsCustomEvents: vi.fn()
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
  api.getAnalyticsCustomEvents.mockResolvedValue(makeCustomEventsReport());
  window.location.hash = '#/analytics/events';
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.location.hash = '';
});

async function openPage() {
  render(<App />);
  return screen.findByRole('heading', { level: 1, name: 'Events' });
}
const rowsOf = (table: HTMLElement) => within(table).getAllByRole('row').slice(1);

describe('Events page', () => {
  it('lists events with count, visitors, and pages, and the rest as Other', async () => {
    await openPage();
    const table = await screen.findByRole('region', { name: 'Events table' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent)
    ).toEqual(['Event', 'Count', 'Visitors', 'Pages']);
    const [first, second, , other] = rowsOf(table);
    expect(
      within(first!)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual(['12', '7', '2']);
    expect(first!.textContent).toContain('signup');
    expect(second!.textContent).toContain('file_download');
    expect(other!.textContent).toContain('Other');
    expect(other!.textContent).toContain('4 more events');
    expect(api.getAnalyticsOverview).not.toHaveBeenCalled();
  });

  it('links each event and page so the selection is kept in the address', async () => {
    await openPage();
    const table = await screen.findByRole('region', { name: 'Events table' });
    expect(within(table).getByRole('link', { name: 'signup' }).getAttribute('href')).toBe(
      '#/analytics/events?event=signup'
    );
    const pages = screen.getByRole('region', { name: 'Top pages table' });
    expect(within(pages).getByRole('link', { name: '/pricing' }).getAttribute('href')).toBe(
      '#/analytics/events?page=%2Fpricing'
    );
    expect(screen.getByText(/2 events were sent without a page/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Property values table' })).toBeNull();
  });

  it('asks the backend for the selection and shows property values for one event', async () => {
    window.location.hash = '#/analytics/events?event=signup&page=%2Fpricing';
    await openPage();
    await waitFor(() =>
      expect(api.getAnalyticsCustomEvents).toHaveBeenCalledWith(
        'p1',
        undefined,
        expect.any(String),
        expect.any(String),
        { event: 'signup', page: '/pricing' },
        expect.anything()
      )
    );
    const properties = await screen.findByRole('region', { name: 'Property values table' });
    expect(properties.textContent).toContain('plan');
    expect(properties.textContent).toContain('pro');
    const chips = screen.getByRole('list', { name: 'Current selection' });
    expect(
      within(chips).getByRole('link', { name: 'Remove event filter' }).getAttribute('href')
    ).toBe('#/analytics/events?page=%2Fpricing');
    expect(
      within(chips).getByRole('link', { name: 'Remove page filter' }).getAttribute('href')
    ).toBe('#/analytics/events?event=signup');
  });

  it('shows how to send an event when there is none, and a way out when a selection is empty', async () => {
    api.getAnalyticsCustomEvents.mockResolvedValue(
      makeCustomEventsReport({
        totals: { events: 0, uniqueUsers: 0 },
        events: [],
        other: { events: 0, count: 0 },
        pages: [],
        withoutPage: 0
      })
    );
    await openPage();
    expect(await screen.findByText(/No events in this range yet/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Custom events' }).getAttribute('href')).toBe(
      'https://vizoalica.dev/operations/custom-events'
    );
    cleanup();
    window.location.hash = '#/analytics/events?event=nothing';
    await openPage();
    expect(await screen.findByRole('link', { name: 'Show all events' })).toBeTruthy();
  });

  it('says when the range starts before event reports began', async () => {
    api.getAnalyticsCustomEvents.mockResolvedValue(
      makeCustomEventsReport({
        availability: {
          state: 'incomplete',
          availableFromUtc: '2026-01-01T01:00:00.000Z',
          taxonomyVersions: [1]
        }
      })
    );
    await openPage();
    expect(
      (await screen.findByText(/Earlier events in this range are not included/)).textContent
    ).toContain('Event reports began');
  });

  it('shows an error with a retry', async () => {
    api.getAnalyticsCustomEvents.mockRejectedValueOnce(new Error('unavailable'));
    await openPage();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Try again');
  });
});
