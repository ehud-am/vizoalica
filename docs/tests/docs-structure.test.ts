import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { navigationLinks, sidebar } from '../.vitepress/navigation.js';
// @ts-expect-error The generator is plain JavaScript shared with the build.
import { toSiteLlms } from '../scripts/llms.mjs';

const DOCS = join(process.cwd(), 'docs');
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function markdownFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    if (['node_modules', '.vitepress', 'public', 'tests', 'scripts'].includes(name)) return [];
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return path.endsWith('.md') ? [path] : [];
  });
}

describe('docs site navigation', () => {
  const pages = markdownFiles(DOCS).map((file) => relative(DOCS, file).replace(/\.md$/, ''));

  it('reaches every Markdown file under docs/ (except the home page)', () => {
    const reachable = new Set(navigationLinks());
    const missing = pages.filter((page) => page !== 'index' && !reachable.has(page));
    expect(missing, 'add these to docs/.vitepress/navigation.ts').toEqual([]);
  });

  it('links only to pages that exist', () => {
    const existing = new Set(pages);
    const dead = navigationLinks().filter((link) => !existing.has(link));
    expect(dead).toEqual([]);
  });

  it('lists each page once in the sidebar', () => {
    const links = sidebar.flatMap((group) => group.items.map((item) => item.link));
    expect(new Set(links).size).toBe(links.length);
  });
});

describe('site assets', () => {
  it('keeps the site’s brand files identical to the console’s (one source of truth)', () => {
    const source = join(process.cwd(), 'apps/admin-web/public/brand');
    const files = readdirSync(source);
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const file of files)
      expect(readFileSync(join(DOCS, 'public/brand', file)), file).toEqual(
        readFileSync(join(source, file))
      );
  });

  it('ships the six snapshots, the video in two formats, its poster, and the social image', () => {
    for (const file of [
      '01-overview.png',
      '02-geography.png',
      '03-technology.png',
      '04-websites.png',
      '05-install.png',
      '06-overview-dark.png'
    ])
      expect(statSync(join(DOCS, 'assets/promo-src', file)).size, file).toBeGreaterThan(20_000);
    for (const file of [
      'vizoalica-intro.mp4',
      'vizoalica-intro.webm',
      'vizoalica-intro-poster.jpg'
    ])
      expect(statSync(join(DOCS, 'public/media', file)).size, file).toBeGreaterThan(10_000);
    expect(statSync(join(DOCS, 'public/og.jpg')).size).toBeGreaterThan(10_000);
    // The MP4 is meant to stay light enough to embed.
    expect(statSync(join(DOCS, 'public/media/vizoalica-intro.mp4')).size).toBeLessThan(5_000_000);
  });

  it('uses the official logo assets in the video, unmodified and not redrawn', () => {
    const video = read('scripts/promo/video/index.html');
    expect(video).toContain('apps/admin-web/public/brand/vizoalica-lockup-dark.svg');
    expect(video).not.toMatch(/<svg/i);
  });

  it('has a fixed response-header policy that limits scripts and needs a build-time hash list', () => {
    const headers = read('docs/public/_headers');
    expect(headers.split('__SCRIPT_HASHES__')).toHaveLength(2);
    const csp = headers.split('\n').find((line) => line.includes('Content-Security-Policy'))!;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    // Scripts allow only this site and hashes. Inline styles are allowed because the theme applies
    // style attributes when the page loads; scripts are what an injected page could abuse.
    const script = /script-src ([^;]*)/.exec(csp)![1]!;
    expect(script).not.toContain('unsafe-inline');
    expect(script).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/https?:\/\//);
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toMatch(/\/assets\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
  });

  it('serves robots.txt pointing at the sitemap', () => {
    expect(read('docs/public/robots.txt')).toContain('Sitemap: https://vizoalica.dev/sitemap.xml');
  });
});

describe('site llms.txt', () => {
  it('turns links into docs/ into site pages and other repository files into GitHub links', () => {
    const out = toSiteLlms(
      '- [Cloudflare](docs/operations/cloudflare.md) and [Brand](docs/brand.md#colors) and [Security](SECURITY.md) and [Examples](examples/cloudflare-pages/) and [Site](https://vizoalica.dev)'
    );
    expect(out).toContain('](https://vizoalica.dev/operations/cloudflare)');
    expect(out).toContain('](https://vizoalica.dev/brand#colors)');
    expect(out).toContain('](https://github.com/ehud-am/vizoalica/blob/main/SECURITY.md)');
    expect(out).toContain(
      '](https://github.com/ehud-am/vizoalica/tree/main/examples/cloudflare-pages)'
    );
    expect(out).toContain('](https://vizoalica.dev)');
  });

  it('leaves no repository-relative link in the real file’s transformation', () => {
    const out: string = toSiteLlms(read('llms.txt'));
    const links = [...out.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]!);
    expect(links.length).toBeGreaterThan(5);
    for (const link of links) expect(link, link).toMatch(/^https:\/\//);
  });
});
