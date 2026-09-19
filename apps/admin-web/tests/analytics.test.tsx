import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnalyticsSummary } from '../src/components/AnalyticsSummary.js';
const summary = {
  projectId: 'p1',
  websiteId: 's1',
  window: '24h' as const,
  startUtc: '2026-01-01',
  endUtc: '2026-01-02',
  pageViews: 12,
  uniqueUsers: 5,
  availability: 'complete' as const
};
describe('analytics browser UI', () => {
  it.each(['24h', '7d', '30d'] as const)('renders the %s window and aggregate totals', (window) => {
    const html = renderToStaticMarkup(
      <AnalyticsSummary
        summary={{ ...summary, window }}
        window={window}
        loading={false}
        onWindowChange={() => undefined}
      />
    );
    expect(html).toContain('Page views');
    expect(html).toContain('12');
    expect(html).toContain('Unique users');
  });
  it('renders processing and unavailable states without stale numbers', () => {
    expect(
      renderToStaticMarkup(
        <AnalyticsSummary
          summary={{
            ...summary,
            availability: 'processing',
            lastCompletedAggregateAt: '2026-01-01'
          }}
          window="24h"
          loading={false}
          onWindowChange={() => undefined}
        />
      )
    ).toContain('may be incomplete');
    expect(
      renderToStaticMarkup(
        <AnalyticsSummary
          summary={{
            ...summary,
            availability: 'unavailable',
            pageViews: undefined,
            uniqueUsers: undefined
          }}
          window="24h"
          loading={false}
          onWindowChange={() => undefined}
        />
      )
    ).toContain('No stale totals');
  });
});
