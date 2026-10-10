import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MetricCard } from '../src/components/MetricCard.js';
import { RankedList } from '../src/components/RankedList.js';
import { TrafficTrend } from '../src/components/TrafficTrend.js';
import { DistributionBars } from '../src/components/DistributionBars.js';

describe('dashboard accessibility', () => {
  it('gives every metric card a semantic heading naming the metric', () => {
    const markup = renderToStaticMarkup(
      <MetricCard label="Page views" value={42} description="Accepted page-view events" />
    );
    expect(markup).toMatch(/<h2>Page views<\/h2>/);
  });

  it('exposes a ranked list as a real <table> with a labelled section and column headers', () => {
    const markup = renderToStaticMarkup(
      <RankedList
        title="Top pages"
        countLabel="Page views"
        result={{ items: [{ label: '/', count: 10 }], otherCount: 3, total: 13 }}
      />
    );
    expect(markup).toMatch(/<section[^>]*aria-labelledby="([^"]+)"/);
    expect(markup).toMatch(/<h2 id="[^"]+">Top pages<\/h2>/);
    expect(markup).toContain('role="region"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('<table>');
    expect(markup).toContain('scope="col"');
    expect(markup).toContain('scope="row"');
    expect(markup).toContain('Page views');
    expect(markup).not.toContain('Rank');
  });

  it('announces an empty ranked list as text rather than an empty grid', () => {
    const markup = renderToStaticMarkup(
      <RankedList
        title="Top pages"
        countLabel="Page views"
        result={{ items: [], otherCount: 0, total: 0 }}
      />
    );
    expect(markup).toContain('No data in this range.');
    expect(markup).not.toContain('<table>');
  });

  it('gives the traffic trend chart a caption and an exact-value table equivalent', () => {
    const markup = renderToStaticMarkup(
      <TrafficTrend
        points={[{ startUtc: '2026-01-01T00:00:00.000Z', pageViews: 5, uniqueUsers: 2 }]}
      />
    );
    expect(markup).toContain('<figcaption>');
    expect(markup).toContain('<caption>Exact traffic values</caption>');
    expect(markup).toContain('aria-label="Exact traffic values"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('scope="col"');
    expect(markup).toContain('scope="row"');
  });

  it('differentiates trend lines by more than color alone', () => {
    // Recharts needs a measured DOM size to render its SVG, so this checks the
    // source directly rather than through renderToStaticMarkup (which yields a
    // zero-size, childless chart in a non-browser environment).
    const source = readFileSync(
      new URL('../src/components/TrafficTrend.tsx', import.meta.url),
      'utf8'
    );
    expect(source).toContain('strokeDasharray');
  });

  it('prints every distribution value next to its bar so nothing depends on color', () => {
    const markup = renderToStaticMarkup(
      <DistributionBars
        title="Browsers"
        result={{
          items: [
            { label: 'Chrome', count: 8 },
            { label: 'Other', count: 2 }
          ],
          total: 10
        }}
      />
    );
    expect(markup).toContain('class="bar-track" aria-hidden="true"');
    expect(markup).toContain('Chrome');
    expect(markup).toContain('80% · 8');
    expect(markup).toContain('20% · 2');
    expect(markup).toContain('View as table');
  });

  it('announces an empty distribution as text', () => {
    const markup = renderToStaticMarkup(
      <DistributionBars title="Devices" result={{ items: [], total: 0 }} />
    );
    expect(markup).toContain('No data in this range.');
    expect(markup).not.toContain('View as table');
  });
});
