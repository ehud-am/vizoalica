import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccessState } from '../src/components/AccessState.js';
describe('access state UI', () => {
  it('shows reauthorization guidance after revoked or expired access', () => {
    const html = renderToStaticMarkup(<AccessState state="denied" onRetry={() => undefined} />);
    expect(html).toContain('Authorization required');
    expect(html).toContain('Reconfigure');
    expect(html).not.toMatch(/credential[^.]*[:=]/i);
  });
  it('does not display analytics or maintenance actions while denied', () => {
    const html = renderToStaticMarkup(<AccessState state="denied" onRetry={() => undefined} />);
    expect(html).not.toContain('Page views');
    expect(html).not.toContain('Soft delete');
  });
});
