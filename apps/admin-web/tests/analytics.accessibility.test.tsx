import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnalyticsSummary } from '../src/components/AnalyticsSummary.js';
describe('analytics accessibility', () => {
  it('provides pressed state and a live region', () => {
    const metrics = renderToStaticMarkup(
      <AnalyticsSummary
        summary={undefined}
        window="24h"
        loading={false}
        onWindowChange={() => undefined}
      />
    );
    expect(metrics).toMatch(/aria-pressed="true"/);
    expect(metrics).toMatch(/aria-live="polite"/);
  });
  it('keeps visible focus, reduced motion, responsive reflow, and AA contrast tokens', () => {
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('@media (max-width: 959px)');
    expect(css).toContain('--color-brand: #0a78e3');
    expect(css).toContain('@media (forced-colors: active)');
  });
});
