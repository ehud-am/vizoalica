import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'apps/admin-web/src/styles.css'), 'utf8');

describe('responsive console layout', () => {
  it('defines compact, medium, standard, and wide viewport bands', () => {
    expect(css).toContain('@media (max-width: 639px)');
    expect(css).toContain('@media (min-width: 640px) and (max-width: 959px)');
    expect(css).toContain('@media (min-width: 960px) and (max-width: 1279px)');
    expect(css).toContain('@media (min-width: 1280px)');
  });

  it('contains wide data and mobile popovers instead of clipping the viewport', () => {
    expect(css).not.toContain('overflow-x: hidden');
    expect(css).toMatch(/\.data-scroll[\s\S]*?overflow-x: auto/);
    expect(css).toMatch(
      /@media \(max-width: 639px\)[\s\S]*?\.time-range-popover[\s\S]*?position: fixed/
    );
  });

  it('provides touch-sized primary controls', () => {
    expect(css).toMatch(/\.primary,[\s\S]*?min-height: 44px/);
    expect(css).toMatch(/\.nav-item[\s\S]*?min-height: 44px/);
  });
});
