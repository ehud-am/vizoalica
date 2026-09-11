import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IntegrationSnippet } from '../src/components/IntegrationSnippet.js';
import { WebsiteForm } from '../src/components/WebsiteForm.js';
describe('website management accessibility', () => {
  it('labels required form fields and descriptive help', () => {
    const html = renderToStaticMarkup(<WebsiteForm onSubmit={async () => undefined} />);
    expect(html).toContain('Website name');
    expect(html).toContain('Allowed origins');
    expect(html).toContain('aria-describedby="origins-help"');
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
    expect(html).toContain('aria-label="Integration code"');
  });
});
