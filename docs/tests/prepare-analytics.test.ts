import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Plain JavaScript shared with the build.
import { prepare } from '../scripts/prepare-analytics.mjs';

const settings = {
  VIZOALICA_INGEST_ENDPOINT: 'https://ingest.example.test/v1/events:batch',
  VIZOALICA_WEBSITE_KEY: 'public-key'
};

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'docs-analytics-'));
  mkdirSync(join(root, 'packages/browser-sdk/dist'), { recursive: true });
  mkdirSync(join(root, 'docs/.vitepress/dist'), { recursive: true });
  writeFileSync(join(root, 'packages/browser-sdk/dist/vizoalica.js'), '// vizoalica.js');
  return { root, dist: join(root, 'docs/.vitepress/dist') };
}

describe('adding analytics to the built docs site', () => {
  it('does nothing when no ingestion endpoint is configured', () => {
    const { root, dist } = workspace();
    expect(prepare({}, root, dist)).toBe(false);
    expect(prepare({ VIZOALICA_INGEST_ENDPOINT: '' }, root, dist)).toBe(false);
    expect(existsSync(join(dist, 'vizoalica.js'))).toBe(false);
  });

  it('adds only the SDK: no loader, no token Function, no configuration file', () => {
    const { root, dist } = workspace();
    expect(prepare(settings, root, dist)).toBe(true);
    expect(existsSync(join(dist, 'vizoalica.js'))).toBe(true);
    expect(existsSync(join(dist, 'vizoalica-loader.js'))).toBe(false);
    expect(existsSync(join(root, 'docs/functions'))).toBe(false);
    expect(existsSync(join(root, 'docs/wrangler.toml'))).toBe(false);
  });

  it('refuses a partly configured site and a missing SDK build', () => {
    const { root, dist } = workspace();
    expect(() =>
      prepare({ VIZOALICA_INGEST_ENDPOINT: settings.VIZOALICA_INGEST_ENDPOINT }, root, dist)
    ).toThrow(/Missing: VIZOALICA_WEBSITE_KEY/);
    const empty = mkdtempSync(join(tmpdir(), 'docs-analytics-'));
    mkdirSync(join(empty, 'dist'));
    expect(() => prepare(settings, empty, join(empty, 'dist'))).toThrow(/browser-sdk:build/);
  });
});
