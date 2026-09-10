import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MetricCard } from '../src/components/MetricCard.js';
import { RankedTable } from '../src/components/RankedTable.js';
import { TrafficTrend } from '../src/components/TrafficTrend.js';
import { DistributionChart } from '../src/components/DistributionChart.js';
import { DashboardFilters } from '../src/components/DashboardFilters.js';
import { presetToRange } from '../src/time-range.js';

describe('dashboard accessibility', () => {
  it('gives every metric card a semantic heading naming the metric', () => {
    const markup = renderToStaticMarkup(
      <MetricCard label="Page views" value={42} description="Accepted page-view events" />
    );
    expect(markup).toMatch(/<h2>Page views<\/h2>/);
  });

  it('exposes a ranked table as a real <table> with a labelled section and column headers', () => {
    const markup = renderToStaticMarkup(
      <RankedTable
        title="Top pages"
        result={{ items: [{ label: '/', count: 10 }], otherCount: 3, total: 13 }}
      />
    );
    expect(markup).toContain('aria-labelledby="Top-pages-title"');
    expect(markup).toContain('id="Top-pages-title"');
    expect(markup).toMatch(/<h2 id="Top-pages-title">Top pages<\/h2>/);
    expect(markup).toContain('<table>');
    expect(markup).toContain('scope="col"');
    expect(markup).toContain('scope="row"');
  });

  it('announces an empty ranked table as text rather than an empty grid', () => {
    const markup = renderToStaticMarkup(
      <RankedTable title="Top pages" result={{ items: [], otherCount: 0, total: 0 }} />
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
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('scope="col"');
    expect(markup).toContain('scope="row"');
  });

  it('differentiates trend lines by more than color alone', () => {
    // Recharts needs a measured DOM size to render its SVG, so this checks the
    // source directly rather than through renderToStaticMarkup (which yields a
    // zero-size, childless chart in a non-browser environment).
    const source = readFileSync(new URL('../src/components/TrafficTrend.tsx', import.meta.url), 'utf8');
    expect(source).toContain('strokeDasharray');
  });

  it('pairs a hidden distribution chart with an accessible text legend of exact values', () => {
    const markup = renderToStaticMarkup(
      <DistributionChart
        title="Browsers"
        result={{ items: [{ label: 'Chrome', count: 8 }], total: 8 }}
      />
    );
    expect(markup).toMatch(/<div class="pie-canvas" aria-hidden="true">/);
    expect(markup).toContain('<ul class="distribution-list">');
    expect(markup).toContain('Chrome');
    expect(markup).toContain('100%');
    expect(markup).toContain('8');
  });

  it('labels the project and website selectors for assistive technology', () => {
    const markup = renderToStaticMarkup(
      <DashboardFilters
        projects={[{ id: 'p1', name: 'Acme' }]}
        websites={[]}
        projectId="p1"
        websiteId=""
        onProjectChange={() => undefined}
        onWebsiteChange={() => undefined}
        range={presetToRange('24h')}
        onRangeApply={() => undefined}
      />
    );
    expect(markup).toContain('aria-label="Project"');
    expect(markup).toContain('aria-label="Website"');
  });
});
