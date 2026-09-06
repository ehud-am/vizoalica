import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnalyticsSummary } from '../src/components/AnalyticsSummary.js';
import { OperationalStatus } from '../src/components/OperationalStatus.js';
describe('local operations quickstart journey', () => {
  it('presents an end-to-end safe operator result from Worker aggregate through console', () => {
    const analytics = renderToStaticMarkup(
      <AnalyticsSummary
        summary={{
          projectId: 'p1',
          websiteId: 's1',
          window: '30d',
          startUtc: '2026-08-01',
          endUtc: '2026-09-01',
          pageViews: 100,
          uniqueUsers: 42,
          availability: 'complete'
        }}
        window="30d"
        loading={false}
        onWindowChange={() => undefined}
      />
    );
    const status = renderToStaticMarkup(
      <OperationalStatus
        status={{
          collection: 'healthy',
          aggregation: 'available',
          configuration: 'healthy',
          dataAccess: 'available'
        }}
      />
    );
    expect(`${analytics}${status}`).toMatch(/100[\s\S]*42/);
    expect(status).toContain('healthy');
    expect(`${analytics}${status}`).not.toMatch(/visitor_digest|adminSecret|raw event/i);
  });
});
