import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IntegrationSnippet } from '../src/components/IntegrationSnippet.js';
import { WebsiteForm } from '../src/components/WebsiteForm.js';
import { WebsiteReachability } from '../src/components/WebsiteReachability.js';
describe('website management accessibility', () => {
  it('announces reachability as a live status region, not only by color', () => {
    const unreachable = renderToStaticMarkup(
      <WebsiteReachability
        reachability={{
          configEndpointReachable: false,
          configEndpointCheckedAt: '2026-01-01T00:00:00.000Z',
          configEndpointError: 'network_error'
        }}
      />
    );
    expect(unreachable).toContain('role="status"');
    expect(unreachable).toContain('aria-hidden="true"');
    expect(unreachable).toMatch(/Website unreachable or misconfigured/);
    const reachable = renderToStaticMarkup(
      <WebsiteReachability
        reachability={{
          configEndpointReachable: true,
          configEndpointCheckedAt: '2026-01-01T00:00:00.000Z',
          configEndpointError: null
        }}
      />
    );
    expect(reachable).toMatch(/Website reachable/);
  });
  it('labels required form fields and descriptive help', () => {
    const html = renderToStaticMarkup(<WebsiteForm onSubmit={async () => undefined} />);
    expect(html).toContain('Website name');
    expect(html).toContain('Allowed origins');
    expect(html).toMatch(/aria-describedby="[^"]*origins-help"/);
    expect(html).toContain('required=""');
  });
  it('announces copy feedback and makes code keyboard focusable', () => {
    const html = renderToStaticMarkup(
      <IntegrationSnippet
        snippet={{
          publicSourceKey: 'public',
          allowedOrigins: ['https://site.test'],
          tokenIssuer: 'website-owned'
        }}
      />
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="Static integration code"');
  });
});
