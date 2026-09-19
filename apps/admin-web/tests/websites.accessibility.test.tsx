import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CodeBlock } from '../src/components/CodeBlock.js';
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

  it('labels required form fields and descriptive help, and shows its own errors', () => {
    const html = renderToStaticMarkup(<WebsiteForm onSubmit={async () => undefined} />);
    expect(html).toContain('Website name');
    expect(html).toContain('Allowed origins');
    expect(html).toMatch(/aria-describedby="[^"]*origins-help"/);
    expect(html).toContain('required=""');
    // The form reports its own problems, so the browser's default bubbles are switched off.
    expect(html).toMatch(/novalidate/i);
  });

  it('makes code keyboard focusable, named, and copyable with an announced result', () => {
    const html = renderToStaticMarkup(
      <CodeBlock label="Loader tag" code="<script></script>" what="loader tag" />
    );
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Loader tag"');
    expect(html).toContain('aria-label="Copy loader tag"');
    expect(html).toContain('role="status"');
  });
});
