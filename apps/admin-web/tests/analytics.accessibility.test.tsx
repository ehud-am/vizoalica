import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnalyticsSummary } from '../src/components/AnalyticsSummary.js';
import { WebsiteSelector } from '../src/components/WebsiteSelector.js';
describe('analytics accessibility', () => {
  it('provides semantic names, pressed state, and a live region', () => {
    const selectors = renderToStaticMarkup(
      <WebsiteSelector
        projects={[]}
        websites={[]}
        projectId=""
        websiteId=""
        onProjectChange={() => undefined}
        onWebsiteChange={() => undefined}
      />
    );
    const metrics = renderToStaticMarkup(
      <AnalyticsSummary
        summary={undefined}
        window="24h"
        loading={false}
        onWindowChange={() => undefined}
      />
    );
    expect(selectors).toMatch(/aria-label="Project"/);
    expect(metrics).toMatch(/aria-pressed="true"/);
    expect(metrics).toMatch(/aria-live="polite"/);
  });
  it('keeps visible focus, reduced motion, responsive reflow, and AA contrast tokens', () => {
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('@media (max-width: 800px)');
    expect(css).toContain('#215c42');
  });
});
