import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OperationalStatus } from '../src/components/OperationalStatus.js';
describe('local operations quickstart journey', () => {
  it('renders operational status without leaking secrets or raw events', () => {
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
    expect(status).toContain('healthy');
    expect(status).not.toMatch(/visitor_digest|adminSecret|raw event/i);
  });
});
