// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { compareMetric } from '../src/analytics/comparison.js';
import { DistributionBars } from '../src/components/DistributionBars.js';
import { MetricCard } from '../src/components/MetricCard.js';
import { RankedList } from '../src/components/RankedList.js';
import { nextStep } from '../src/manage/HealthPage.js';

afterEach(cleanup);

const website = {
  id: 's1',
  projectId: 'p1',
  name: 'Docs',
  publicSourceKey: 'k',
  allowedOrigins: ['https://docs.test'],
  status: 'active' as const
};
const healthy = {
  collection: 'healthy' as const,
  aggregation: 'available' as const,
  configuration: 'healthy' as const,
  dataAccess: 'available' as const
};
const reachable = {
  configEndpointReachable: true,
  configEndpointCheckedAt: '2026-01-01T00:00:00.000Z',
  configEndpointError: null
};

describe('DistributionBars', () => {
  const result = {
    items: [
      { label: 'Chrome', count: 60 },
      { label: 'Safari', count: 30 },
      { label: 'Other', count: 10 }
    ],
    total: 100
  };

  it('switches between bars and an exact-value table', async () => {
    const user = userEvent.setup();
    render(<DistributionBars title="Browsers" result={result} />);
    expect(screen.getByText('60% · 60')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'View as table' }));
    const table = screen.getByRole('region', { name: 'Browsers table' });
    expect(within(table).getByRole('rowheader', { name: 'Safari' })).toBeTruthy();
    expect(within(table).getByRole('columnheader', { name: 'Page views' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show bars' }));
    expect(screen.queryByRole('region', { name: 'Browsers table' })).toBeNull();
  });
});

describe('RankedList', () => {
  const items = Array.from({ length: 4 }, (_, index) => ({
    label: `/p${index}`,
    count: 10 - index
  }));

  it('can show every row from the start and describes labels with secondary text', () => {
    render(
      <RankedList
        title="Places"
        countLabel="Page views"
        showAll
        initialLimit={2}
        result={{ items, otherCount: 5, total: 40 }}
        describe={(label) => ({ name: label.toUpperCase(), secondary: 'x' })}
      />
    );
    expect(screen.getByText('/P3')).toBeTruthy();
    expect(screen.getByText('Other')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Show/ })).toBeNull();
  });

  it('folds hidden rows into Other when collapsed and links to the full list when asked', () => {
    render(
      <RankedList
        title="Pages"
        countLabel="Page views"
        initialLimit={2}
        result={{ items, otherCount: 0, total: 34 }}
        moreLink={{ href: '#/analytics/pages', label: 'All pages' }}
      />
    );
    expect(screen.queryByText('/p2')).toBeNull();
    expect(within(screen.getByText('Other').closest('tr')!).getByText('15')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'All pages' }).getAttribute('href')).toBe(
      '#/analytics/pages'
    );
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });
});

describe('MetricCard', () => {
  it('shows a downward change in words, and a loading comparison', () => {
    const { rerender } = render(
      <MetricCard
        label="Page views"
        value={80}
        description="d"
        comparison={compareMetric(80, 100, 'available')}
        periodLabel="previous 7 days"
        trend={[3, 2, 1]}
      />
    );
    expect(screen.getByText('Down 20%')).toBeTruthy();
    expect(screen.getByText(/vs 100 in the previous 7 days/)).toBeTruthy();
    expect(document.querySelector('.metric-change.down')).toBeTruthy();
    expect(document.querySelector('.sparkline')).toBeTruthy();
    rerender(
      <MetricCard label="Page views" value={80} description="d" comparison="loading" trend={[1]} />
    );
    expect(screen.getByText(/Comparing to the previous period/)).toBeTruthy();
    expect(document.querySelector('.sparkline')).toBeNull();
    rerender(<MetricCard label="Page views" value={80} description="d" />);
    expect(document.querySelector('.metric-change')).toBeNull();
  });
});

describe('health next step', () => {
  it('recommends the most useful next action for each condition', () => {
    const step = (site = website, health: Parameters<typeof nextStep>[1]) => nextStep(site, health);
    expect(step(website, { failed: true })).toMatch(/unavailable/);
    expect(step({ ...website, status: 'disabled' }, { status: healthy, failed: false })).toMatch(
      /Enable the website/
    );
    expect(
      step(website, { status: { ...healthy, dataAccess: 'unavailable' }, failed: false })
    ).toMatch(/pnpm vizoalica status/);
    expect(
      step(website, { status: { ...healthy, configuration: 'attention' }, failed: false })
    ).toMatch(/installation configuration/);
    expect(
      step(website, {
        status: healthy,
        reachability: { ...reachable, configEndpointReachable: false },
        failed: false
      })
    ).toMatch(/configuration endpoint/);
    expect(
      step(website, { status: { ...healthy, aggregation: 'processing' }, failed: false })
    ).toMatch(/catching up/);
    expect(
      step(website, { status: { ...healthy, aggregation: 'unavailable' }, failed: false })
    ).toMatch(/Aggregation is unavailable/);
    expect(step(website, { status: healthy, reachability: reachable, failed: false })).toBe(
      'No action needed.'
    );
  });
});
