import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const BRAND_DIR = join(ROOT, 'apps/admin-web/public/brand');

const VARIANTS = [
  'vizoalica-mark.svg',
  'vizoalica-lockup-dark.svg',
  'vizoalica-lockup-light.svg',
  'vizoalica-monochrome.svg',
  'favicon.svg'
];

const read = (name: string) => readFileSync(join(BRAND_DIR, name), 'utf8');

describe('production brand assets', () => {
  it('ships stable, valid, path-only SVG variants', () => {
    for (const variant of VARIANTS) {
      const svg = read(variant);
      expect(svg, variant).toMatch(/viewBox="0 0 \d+ \d+"/);
      expect(svg, variant).toContain('<path');
      expect(svg, variant).not.toMatch(/<(text|image|script|filter|animate)\b/i);
      expect(svg, variant).not.toMatch(/(?:href|src)="(?:https?:|data:)/i);
      expect(svg, variant).toContain('data-mark="vizoalica-graph-v1"');
      expect(svg, variant).not.toMatch(/#215c42|#d08a31/i);
    }
  });

  it('uses custom outlined wordmarks with theme-correct contrast', () => {
    const light = read('vizoalica-lockup-light.svg');
    const dark = read('vizoalica-lockup-dark.svg');
    expect(light).toContain('data-wordmark="vizoalica-custom-v1"');
    expect(dark).toContain('data-wordmark="vizoalica-custom-v1"');
    expect(light).toContain('#10141c');
    expect(dark).toContain('#f7f8fa');
  });

  it('keeps the favicon compact, substrate-backed, and decorative', () => {
    const svg = read('favicon.svg');
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(svg).toContain('#10141c');
    expect(svg).not.toContain('data-wordmark');
    expect(svg).not.toContain('<title');
    expect(svg).not.toContain('role="img"');
  });

  it('keeps the monochrome variant to one fixed ink', () => {
    const svg = read('vizoalica-monochrome.svg');
    expect(new Set(svg.match(/#[0-9a-fA-F]{6}/g))).toEqual(new Set(['#10141c']));
  });

  it('keeps concept references outside the public runtime bundle', () => {
    expect(existsSync(join(BRAND_DIR, 'vizoalica-logo-concept.png'))).toBe(false);
    expect(existsSync(join(BRAND_DIR, 'vizoalica-full-dark-concept.svg'))).toBe(false);
  });

  it('documents variants, minimum sizes, clear space, and accessibility', () => {
    const doc = readFileSync(join(ROOT, 'docs/brand.md'), 'utf8');
    for (const variant of VARIANTS) expect(doc, variant).toContain(variant);
    expect(doc).toMatch(/minimum size/i);
    expect(doc).toMatch(/clear space/i);
    expect(doc).toMatch(/accessible name|decorative/i);
  });
});
