import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('audience attributes review', () => {
  const review = read('docs/privacy/audience-attributes-review.md');

  it('records a decision for every candidate attribute', () => {
    for (const attribute of [
      'Country',
      'Continent',
      'Tor network',
      'Browser language',
      'Region, state, or city',
      'Age, gender, interests'
    ])
      expect(review, attribute).toContain(attribute);
    for (const decision of ['Approved', 'Deferred', 'Rejected']) expect(review).toContain(decision);
  });

  it('credits every input of the bundled reference data with its license', () => {
    for (const input of ['world-atlas', 'countries-list', 'i18n-iso-countries', 'd3-geo'])
      expect(review, input).toContain(input);
    expect(review).not.toMatch(/ODbL/);
  });

  it.each([
    'README.md',
    'llms.txt',
    'docs/operations/operator-local.md',
    'docs/operations/privacy.md'
  ])('is linked from %s', (path) => {
    expect(read(path)).toContain('audience-attributes-review.md');
  });

  it('is described in the changelog and the operator guide', () => {
    expect(read('CHANGELOG.md')).toMatch(/## \[0\.5\.3\][\s\S]*Geography/);
    expect(read('docs/operations/operator-local.md')).toContain('## Using the console');
  });
});

describe('install from npm', () => {
  it.each(['README.md', 'docs/get-started.md', 'docs/index.md', 'llms.txt'])(
    '%s shows how to install and start the console',
    (path) => {
      const text = read(path);
      expect(text).toContain('npm install -g vizoalica');
      expect(text).toContain('vizoalica console');
    }
  );

  it('no longer says the project is distributed as source only', () => {
    expect(read('llms.txt')).not.toContain('source only');
    expect(read('llms.txt')).toContain('`vizoalica` npm package');
  });

  it('says how to update and remove it, and where settings live', () => {
    const text = read('README.md');
    expect(text).toContain('npm update -g vizoalica');
    expect(text).toContain('npm uninstall -g vizoalica');
    expect(text).toContain('~/.config/vizoalica/');
  });

  it('is honest that this release installs the console and the backend is deployed from a checkout', () => {
    expect(read('README.md')).toMatch(/installs the \*\*console\*\*/);
    expect(read('docs/get-started.md')).toMatch(/installs the console/);
  });
});
