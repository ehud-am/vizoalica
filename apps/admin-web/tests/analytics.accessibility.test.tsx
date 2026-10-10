import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('analytics accessibility', () => {
  it('keeps visible focus, reduced motion, responsive reflow, and AA contrast tokens', () => {
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('@media (max-width: 959px)');
    expect(css).toContain('--color-brand: #0a78e3');
    expect(css).toContain('@media (forced-colors: active)');
  });
});
