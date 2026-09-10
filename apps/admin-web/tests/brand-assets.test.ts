import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const BRAND_DIR = join(process.cwd(), 'apps/admin-web/public/brand');

const VARIANTS = [
  'vizoalica-mark.svg',
  'vizoalica-lockup-dark.svg',
  'vizoalica-lockup-light.svg',
  'vizoalica-monochrome.svg',
  'favicon.svg'
];

function read(name: string): string {
  return readFileSync(join(BRAND_DIR, name), 'utf8');
}

describe('brand assets', () => {
  it('provides every required SVG variant', () => {
    for (const variant of VARIANTS) expect(() => read(variant)).not.toThrow();
  });

  it('gives every SVG a valid viewBox', () => {
    for (const variant of VARIANTS) {
      const svg = read(variant);
      expect(svg, variant).toMatch(/viewBox="0 0 \d+ \d+"/);
    }
  });

  it('gives each meaningful (non-decorative) variant an accessible title with a unique id', () => {
    const meaningful = [
      'vizoalica-mark.svg',
      'vizoalica-lockup-dark.svg',
      'vizoalica-lockup-light.svg',
      'vizoalica-monochrome.svg'
    ];
    const titleIds = new Set<string>();
    for (const variant of meaningful) {
      const svg = read(variant);
      expect(svg, variant).toContain('role="img"');
      const idMatch = /<title id="([^"]+)">/.exec(svg);
      expect(idMatch, `${variant} missing a <title id="...">`).toBeTruthy();
      const id = idMatch![1]!;
      expect(svg).toContain(`aria-labelledby="${id}"`);
      expect(titleIds.has(id), `duplicate title id "${id}" across brand assets`).toBe(false);
      titleIds.add(id);
      expect(svg).toMatch(new RegExp(`<title id="${id}">[^<]+</title>`));
    }
  });

  it('treats the favicon as purely decorative chrome with no accessible-name markup', () => {
    const svg = read('favicon.svg');
    expect(svg).not.toContain('<title');
    expect(svg).not.toContain('role="img"');
    expect(svg).not.toContain('aria-labelledby');
  });

  it('uses light strokes/text on the dark-background lockup for contrast', () => {
    const svg = read('vizoalica-lockup-dark.svg');
    expect(svg).toContain('#ffffff');
    expect(svg).not.toContain('#18211d');
  });

  it('uses dark strokes/text on the light-background lockup for contrast', () => {
    const svg = read('vizoalica-lockup-light.svg');
    expect(svg).toContain('#215c42');
    expect(svg).toContain('#18211d');
    expect(svg).not.toContain('#ffffff');
  });

  it('keeps the monochrome variant to a single ink via currentColor, with no fixed hex fills', () => {
    const svg = read('vizoalica-monochrome.svg');
    expect(svg).toContain('currentColor');
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });

  it('gives the app-icon mark a solid brand-colored background suited to small favicon-style sizes', () => {
    const svg = read('vizoalica-mark.svg');
    expect(svg).toContain('#215c42');
    expect(svg).toMatch(/<rect[^>]*rx="\d+"/);
  });

  it('documents minimum sizes and approved backgrounds for every variant', () => {
    const brandDoc = readFileSync(join(process.cwd(), 'docs/brand.md'), 'utf8');
    for (const variant of VARIANTS) expect(brandDoc, variant).toContain(variant);
    expect(brandDoc).toMatch(/minimum size/i);
    expect(brandDoc).toMatch(/clear space/i);
    expect(brandDoc).toMatch(/accessible name|accessible-name|decorative/i);
  });
});
