import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IntegrationSnippet } from '../src/components/IntegrationSnippet.js';
import { OperationalStatus } from '../src/components/OperationalStatus.js';
import { WebsiteList } from '../src/components/WebsiteList.js';
describe('website lifecycle UI', () => {
  it('distinguishes active, disabled, and deleted websites', () => {
    const websites = ['active', 'disabled', 'deleted'].map((status, index) => ({
      id: `${index}`,
      projectId: 'p1',
      name: status,
      publicSourceKey: 'public',
      allowedOrigins: ['https://site.test'],
      status: status as 'active' | 'disabled' | 'deleted'
    }));
    const html = renderToStaticMarkup(
      <WebsiteList websites={websites} selectedId="0" onSelect={() => undefined} />
    );
    expect(html).toContain('status active');
    expect(html).toContain('status disabled');
    expect(html).toContain('status deleted');
  });
  it('shows safe integration guidance and health distinctions', () => {
    const snippet = renderToStaticMarkup(
      <IntegrationSnippet
        snippet={{
          publicSourceKey: 'public-key',
          allowedOrigins: ['https://site.test'],
          tokenIssuer: 'website-owned'
        }}
      />
    );
    expect(snippet).toContain('public-key');
    expect(snippet).not.toMatch(/admin-secret|Bearer|issued JWT/i);
    const status = renderToStaticMarkup(
      <OperationalStatus
        status={{ collection: 'disabled', aggregation: 'processing', dataAccess: 'unavailable' }}
      />
    );
    expect(status).toContain('disabled');
    expect(status).toContain('processing');
    expect(status).toContain('unavailable');
  });
});
