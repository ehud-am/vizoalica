import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const css = readFileSync(join(root, 'apps/admin-web/src/styles.css'), 'utf8');
const trend = readFileSync(join(root, 'apps/admin-web/src/components/TrafficTrend.tsx'), 'utf8');
const distribution = readFileSync(
  join(root, 'apps/admin-web/src/components/DistributionChart.tsx'),
  'utf8'
);

describe('developer-centric visual system', () => {
  it('uses system UI and monospace stacks without an unfulfilled web font or serif display face', () => {
    expect(css).toContain('ui-sans-serif');
    expect(css).toContain('--font-mono: ui-monospace');
    expect(css).not.toMatch(/\bInter\b|Georgia|Times New Roman/);
  });

  it('defines a 4px spacing scale, restrained radii, and semantic chart colors', () => {
    expect(css).toContain('--space-1: 4px');
    expect(css).toContain('--space-8: 32px');
    expect(css).toContain('--radius-lg: 14px');
    for (let index = 1; index <= 8; index += 1) {
      expect(css).toContain(`--color-chart-${index}`);
    }
  });

  it('keeps data visualization colors theme-aware', () => {
    expect(trend).toContain('var(--color-chart-1)');
    expect(distribution).toContain('var(--color-chart-8)');
    expect(`${trend}${distribution}`).not.toMatch(/#215c42|#d08a31|#b56a22/);
  });

  it('preserves focus and state cues with reduced motion and forced colors', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('outline: 3px solid var(--color-focus-ring)');
  });
});
