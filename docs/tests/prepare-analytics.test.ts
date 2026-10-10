import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Plain JavaScript shared with the build.
import { prepare } from '../scripts/prepare-analytics.mjs';

const settings = {
  PAGES_PROJECT: 'vizoalica',
  VIZOALICA_SDK_SRC: 'https://vizoalica.dev/vizoalica.js',
  VIZOALICA_INGEST_ENDPOINT: 'https://ingest.example.test/v1/events:batch',
  VIZOALICA_PUBLIC_SOURCE_KEY: 'public-key',
  VIZOALICA_PROJECT_ID: 'project-id',
  VIZOALICA_TOKEN_URL: '/vizoalica/ingest-token',
  VIZOALICA_CONSENT: 'analytics-granted',
  VIZOALICA_SOURCE_ID: 'source-id',
  VIZOALICA_SITE_ORIGINS: 'https://vizoalica.dev'
};

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'docs-analytics-'));
  mkdirSync(join(root, 'packages/browser-sdk/dist'), { recursive: true });
  mkdirSync(join(root, 'examples/cloudflare-pages/functions/vizoalica'), { recursive: true });
  mkdirSync(join(root, 'docs/.vitepress/dist'), { recursive: true });
  for (const file of ['vizoalica.js', 'vizoalica-loader.js'])
    writeFileSync(join(root, 'packages/browser-sdk/dist', file), `// ${file}`);
  writeFileSync(join(root, 'examples/cloudflare-pages/functions/vizoalica/ingest-token.ts'), '//');
  return { root, dist: join(root, 'docs/.vitepress/dist') };
}

describe('adding analytics to the built docs site', () => {
  it('does nothing when no ingestion endpoint is configured', () => {
    const { root, dist } = workspace();
    expect(prepare({}, root, dist)).toBe(false);
    expect(existsSync(join(dist, 'vizoalica.js'))).toBe(false);
    expect(existsSync(join(root, 'docs/wrangler.toml'))).toBe(false);
  });

  it('adds the SDK, loader, Functions and public settings, and no secret', () => {
    const { root, dist } = workspace();
    expect(prepare(settings, root, dist)).toBe(true);
    expect(existsSync(join(dist, 'vizoalica.js'))).toBe(true);
    expect(existsSync(join(dist, 'vizoalica-loader.js'))).toBe(true);
    expect(existsSync(join(root, 'docs/functions/vizoalica/ingest-token.ts'))).toBe(true);
    const toml = readFileSync(join(root, 'docs/wrangler.toml'), 'utf8');
    expect(toml).toContain('name = "vizoalica"');
    expect(toml).toContain('pages_build_output_dir = ".vitepress/dist"');
    expect(toml).toContain('VIZOALICA_SITE_ORIGINS = "https://vizoalica.dev"');
    expect(toml).not.toMatch(/SECRET/);
  });

  it('needs only what identifies the website: the SDK path, token path and consent are defaulted', () => {
    const { root, dist } = workspace();
    const minimal: Record<string, string> = { ...settings };
    for (const name of ['VIZOALICA_SDK_SRC', 'VIZOALICA_TOKEN_URL', 'VIZOALICA_CONSENT'])
      delete minimal[name];
    expect(prepare(minimal, root, dist)).toBe(true);
    const toml = readFileSync(join(root, 'docs/wrangler.toml'), 'utf8');
    expect(toml).toContain('VIZOALICA_SDK_SRC = "/vizoalica.js"');
    expect(toml).toContain('VIZOALICA_TOKEN_URL = "/vizoalica/ingest-token"');
    expect(toml).toContain('VIZOALICA_CONSENT = "unknown"');
  });

  it('treats an empty variable (how GitHub passes an unset one) as not set, and lets a set one win', () => {
    const { root, dist } = workspace();
    prepare({ ...settings, VIZOALICA_CONSENT: '', VIZOALICA_TOKEN_URL: '' }, root, dist);
    let toml = readFileSync(join(root, 'docs/wrangler.toml'), 'utf8');
    expect(toml).toContain('VIZOALICA_CONSENT = "unknown"');
    expect(toml).toContain('VIZOALICA_TOKEN_URL = "/vizoalica/ingest-token"');
    // A value that was set is kept as it is.
    expect(toml).toContain('VIZOALICA_SDK_SRC = "https://vizoalica.dev/vizoalica.js"');
    prepare({ ...settings, VIZOALICA_CONSENT: 'analytics-granted' }, root, dist);
    toml = readFileSync(join(root, 'docs/wrangler.toml'), 'utf8');
    expect(toml).toContain('VIZOALICA_CONSENT = "analytics-granted"');
  });

  it("does not read the caller's object as a place to keep defaults", () => {
    const { root, dist } = workspace();
    const given: Record<string, string> = { ...settings };
    delete given.VIZOALICA_CONSENT;
    prepare(given, root, dist);
    expect(given.VIZOALICA_CONSENT).toBeUndefined();
  });

  it('still refuses a default-able value that could break the file', () => {
    const { root, dist } = workspace();
    expect(() => prepare({ ...settings, VIZOALICA_CONSENT: 'a"b' }, root, dist)).toThrow(
      /VIZOALICA_CONSENT contains/
    );
  });

  it('refuses a partly configured site, a missing SDK build, and a value that could break the file', () => {
    const { root, dist } = workspace();
    const partial: Record<string, string> = { ...settings };
    delete partial.VIZOALICA_PROJECT_ID;
    expect(() => prepare(partial, root, dist)).toThrow(/Missing: VIZOALICA_PROJECT_ID/);
    expect(() => prepare({ ...settings, VIZOALICA_PROJECT_ID: 'a"b' }, root, dist)).toThrow(
      /VIZOALICA_PROJECT_ID contains/
    );
    const empty = mkdtempSync(join(tmpdir(), 'docs-analytics-'));
    mkdirSync(join(empty, 'dist'));
    expect(() => prepare(settings, empty, join(empty, 'dist'))).toThrow(/browser-sdk:build/);
  });
});
