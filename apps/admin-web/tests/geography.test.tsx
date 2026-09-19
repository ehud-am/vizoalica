// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import type { CountItem } from '../src/api/local-operations.js';
import { COUNTRIES } from '../src/geo/countries.js';
import { stepFor } from '../src/analytics/geo/WorldMap.js';
import { continentTotals, toLocationData } from '../src/analytics/geo/locations.js';
import { makeOverview } from './fixtures/console.js';

const api = vi.hoisted(() => ({
  bootstrapSession: vi.fn(),
  listProjects: vi.fn(),
  listWebsites: vi.fn(),
  getAnalyticsOverview: vi.fn()
}));
vi.mock('../src/api/local-operations.js', async (load) => ({ ...(await load()), ...api }));

const fetchSpy = vi.fn();

function countries(items: CountItem[], otherCount = 0) {
  const total = items.reduce((sum, item) => sum + item.count, 0) + otherCount;
  return makeOverview({
    totals: { pageViews: total, uniqueUsers: 1 },
    rankings: {
      pagePaths: { items: [], otherCount: 0, total: 0 },
      countries: { items, otherCount, total },
      userAgents: { items: [], otherCount: 0, total: 0 },
      referrers: { items: [], otherCount: 0, total: 0 }
    }
  });
}

beforeEach(() => {
  window.location.hash = '#/analytics/geography';
  vi.stubGlobal('fetch', fetchSpy);
  api.bootstrapSession.mockResolvedValue(undefined);
  api.listProjects.mockResolvedValue([{ id: 'p1', name: 'Acme' }]);
  api.listWebsites.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const table = () => screen.findByRole('region', { name: 'Locations table' });

describe('Geography view', () => {
  it('lists every country (not only ten) with full names and never a raw code as the label', async () => {
    const items = COUNTRIES.slice(0, 25).map((country, index) => ({
      label: country.code,
      count: 1000 - index
    }));
    api.getAnalyticsOverview.mockResolvedValue(countries(items));
    render(<App />);
    const rows = within(await table())
      .getAllByRole('row')
      .slice(1);
    expect(rows).toHaveLength(25);
    for (const [index, row] of rows.entries()) {
      const label = within(row).getByRole('rowheader');
      expect(label.textContent).toContain(COUNTRIES[index]!.name);
    }
  });

  it('shows full names, the code as secondary text, and labels Tor and unknown traffic', async () => {
    api.getAnalyticsOverview.mockResolvedValue(
      countries([
        { label: 'DE', count: 50 },
        { label: 'US', count: 30 },
        { label: 'T1', count: 10 },
        { label: 'Unknown', count: 5 },
        { label: 'XX', count: 5 }
      ])
    );
    render(<App />);
    const locations = await table();
    expect(within(locations).getByRole('rowheader', { name: 'Germany DE' })).toBeTruthy();
    expect(within(locations).getByRole('rowheader', { name: 'United States US' })).toBeTruthy();
    expect(within(locations).getByRole('rowheader', { name: 'Tor network' })).toBeTruthy();
    // 'Unknown' and 'XX' mean the same thing and are merged into one row.
    const unknown = within(locations).getByRole('rowheader', { name: 'Unknown location' });
    expect(unknown.closest('tr')!.textContent).toContain('10');
    expect(locations.textContent).not.toMatch(/\bT1\b|\bXX\b/);
  });

  it('shows continent totals that add up to the range total, with an Unlocated row', async () => {
    api.getAnalyticsOverview.mockResolvedValue(
      countries([
        { label: 'DE', count: 50 },
        { label: 'FR', count: 20 },
        { label: 'BR', count: 20 },
        { label: 'T1', count: 10 }
      ])
    );
    render(<App />);
    const continents = await screen.findByRole('region', { name: 'Continents table' });
    const rows = within(continents).getAllByRole('row').slice(1);
    const read = (name: string) =>
      Array.from(rows.find((row) => within(row).queryByRole('rowheader', { name }))!.cells).map(
        (cell) => cell.textContent
      );
    expect(read('Europe')).toEqual(['Europe', '70', '70%', '2']);
    expect(read('South America')).toEqual(['South America', '20', '20%', '1']);
    expect(read('Unlocated')).toEqual(['Unlocated', '10', '10%', '—']);
    const sum = rows.reduce(
      (total, row) => total + Number((row.cells[1] as HTMLElement).textContent),
      0
    );
    expect(sum).toBe(100);
  });

  it('draws a map with an accessible name per country with traffic, and no other requests', async () => {
    api.getAnalyticsOverview.mockResolvedValue(
      countries([
        { label: 'DE', count: 75 },
        { label: 'US', count: 25 }
      ])
    );
    render(<App />);
    const map = await screen.findByRole('group', { name: 'World map of page views by country' });
    const named = within(map).getAllByRole('img');
    expect(named.map((shape) => shape.getAttribute('aria-label')).sort()).toEqual([
      'Germany: 75 page views, 75%',
      'United States: 25 page views, 25%'
    ]);
    for (const shape of named) expect(shape.getAttribute('tabindex')).toBe('0');
    // Countries without traffic are drawn, distinct, and neither focusable nor announced.
    const empty = map.querySelectorAll('.map-country.none');
    expect(empty.length).toBeGreaterThan(100);
    for (const shape of Array.from(empty)) expect(shape.getAttribute('tabindex')).toBeNull();
    // The only requests are same-origin calls to the local API (for example the theme preference).
    for (const [target] of fetchSpy.mock.calls) expect(String(target)).toMatch(/^\/api\//);
    expect(document.querySelectorAll('iframe, script[src], link[href]')).toHaveLength(0);
    for (const image of Array.from(document.querySelectorAll('img')))
      expect(image.closest('.brand')).toBeTruthy();
  });

  it('reads out the hovered or focused country, and clears it again', async () => {
    api.getAnalyticsOverview.mockResolvedValue(countries([{ label: 'DE', count: 40 }]));
    const user = userEvent.setup();
    render(<App />);
    const germany = await screen.findByRole('img', { name: /^Germany/ });
    const readout = document.querySelector('.map-readout')!;
    expect(readout.textContent).toMatch(/Hover or focus/);
    await user.hover(germany);
    expect(readout.textContent).toBe('Germany: 40 page views (100%)');
    await user.unhover(germany);
    expect(readout.textContent).toMatch(/Hover or focus/);
    germany.focus();
    expect(await screen.findByText('Germany: 40 page views (100%)')).toBeTruthy();
    germany.blur();
    await waitFor(() => expect(readout.textContent).toMatch(/Hover or focus/));
  });

  it('sorts by location and by page views, toggling direction, and announces the sort', async () => {
    api.getAnalyticsOverview.mockResolvedValue(
      countries([
        { label: 'FR', count: 30 },
        { label: 'DE', count: 50 },
        { label: 'BR', count: 20 }
      ])
    );
    const user = userEvent.setup();
    render(<App />);
    const locations = await table();
    const names = () =>
      within(locations)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent!.replace(/ [A-Z]{2}$/, ''));
    expect(names()).toEqual(['Germany', 'France', 'Brazil']);
    const nameHeader = within(locations).getByRole('columnheader', { name: /Location/ });
    const countHeader = within(locations).getByRole('columnheader', { name: /Page views/ });
    expect(countHeader.getAttribute('aria-sort')).toBe('descending');
    await user.click(within(nameHeader).getByRole('button'));
    expect(names()).toEqual(['Brazil', 'France', 'Germany']);
    expect(nameHeader.getAttribute('aria-sort')).toBe('ascending');
    await user.click(within(nameHeader).getByRole('button'));
    expect(names()).toEqual(['Germany', 'France', 'Brazil']);
    await user.click(within(countHeader).getByRole('button'));
    expect(names()).toEqual(['Germany', 'France', 'Brazil']);
    expect(countHeader.getAttribute('aria-sort')).toBe('descending');
    await user.click(within(countHeader).getByRole('button'));
    expect(names()).toEqual(['Brazil', 'France', 'Germany']);
    expect(countHeader.getAttribute('aria-sort')).toBe('ascending');
  });

  it('still renders full names for the older Worker shape that only itemizes ten countries', async () => {
    api.getAnalyticsOverview.mockResolvedValue(
      countries(
        COUNTRIES.slice(0, 10).map((country, index) => ({
          label: country.code,
          count: 100 - index
        })),
        60
      )
    );
    render(<App />);
    const locations = await table();
    expect(within(locations).getAllByRole('row')).toHaveLength(12);
    expect(within(locations).getByRole('rowheader', { name: 'Other (not itemized)' })).toBeTruthy();
    const continents = await screen.findByRole('region', { name: 'Continents table' });
    expect(within(continents).getByRole('rowheader', { name: 'Not itemized' })).toBeTruthy();
  });

  it('renders an unrecognized code as text and keeps working', async () => {
    api.getAnalyticsOverview.mockResolvedValue(
      countries([
        { label: '<b>ZZ</b>', count: 5 },
        { label: 'DE', count: 5 }
      ])
    );
    render(<App />);
    const locations = await table();
    expect(
      within(locations).getByRole('rowheader', { name: '<b>ZZ</b> (unrecognized)' })
    ).toBeTruthy();
    expect(locations.querySelector('b')).toBeNull();
  });

  it('shows an empty state when there is no location data, and a single country cleanly', async () => {
    api.getAnalyticsOverview.mockResolvedValue(countries([]));
    render(<App />);
    expect(await screen.findByText('No location data in this range.')).toBeTruthy();
    cleanup();
    api.getAnalyticsOverview.mockResolvedValue(countries([{ label: 'JP', count: 9 }]));
    render(<App />);
    expect(await screen.findByRole('img', { name: /^Japan: 9 page views, 100%/ })).toBeTruthy();
  });
});

describe('location helpers', () => {
  it('scales map classes on a square-root scale between the smallest and largest value', () => {
    expect(stepFor(0, 1, 100)).toBe(0);
    expect(stepFor(5, 1, 0)).toBe(0);
    expect(stepFor(5, 5, 5)).toBe(7);
    expect(stepFor(1, 1, 10000)).toBe(1);
    expect(stepFor(10000, 1, 10000)).toBe(7);
    expect(stepFor(2500, 1, 10000)).toBe(3);
    // Values that are close together still land in different classes.
    expect(stepFor(300, 280, 1000)).toBeLessThan(stepFor(900, 280, 1000));
  });

  it('merges labels that mean the same place and orders continents by traffic', () => {
    const data = toLocationData({
      items: [
        { label: 'us', count: 4 },
        { label: 'US', count: 6 },
        { label: 'FR', count: 10 },
        { label: 'T1', count: 1 }
      ],
      otherCount: 0,
      total: 21
    });
    expect(data.rows.map((row) => [row.key, row.count])).toEqual([
      ['FR', 10],
      ['US', 10],
      ['tor', 1]
    ]);
    expect(continentTotals(data).map((row) => row.name)).toEqual([
      'Europe',
      'North America',
      'Unlocated'
    ]);
  });
});
