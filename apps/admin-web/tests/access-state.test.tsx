import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccessState } from '../src/components/AccessState.js';
describe('access state UI', () => {
  it('shows credential repair guidance after Worker authorization fails', () => {
    const html = renderToStaticMarkup(<AccessState state="denied" onRetry={() => undefined} />);
    expect(html).toContain('Authorization required');
    expect(html).toContain('Worker rejected');
    expect(html).toContain('pnpm ops status');
    expect(html).not.toMatch(/credential[^.]*[:=]/i);
  });

  it('offers reconnection when only the browser session expired', () => {
    const html = renderToStaticMarkup(
      <AccessState state="denied" reason="session_expired" onRetry={() => undefined} />
    );
    expect(html).toContain('browser session expired');
    expect(html).toContain('Reconnect');
    expect(html).not.toContain('repair the credential');
  });
  it('does not display analytics or maintenance actions while denied', () => {
    const html = renderToStaticMarkup(<AccessState state="denied" onRetry={() => undefined} />);
    expect(html).not.toContain('Page views');
    expect(html).not.toContain('Delete');
  });
});
