import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Plain JavaScript shared with the build.
import { checkBase } from '../scripts/check-base.mjs';

function site(pages: Record<string, string>, files: string[] = []) {
  const dist = mkdtempSync(join(tmpdir(), 'docs-base-'));
  for (const [name, html] of Object.entries(pages)) writeFileSync(join(dist, name), html);
  for (const file of files) {
    mkdirSync(join(dist, file, '..'), { recursive: true });
    writeFileSync(join(dist, file), 'x');
  }
  return dist;
}

describe('the base check for the GitHub Pages copy', () => {
  it('accepts references that resolve under the base, and ones that leave the site', () => {
    const dist = site(
      {
        'index.html':
          '<a href="/vizoalica/get-started">a</a><img src="/vizoalica/brand/logo.svg">' +
          '<a href="https://vizoalica.dev/x">b</a><a href="//cdn.example/x">c</a>' +
          '<a href="/vizoalica/get-started#top">d</a><a href="/vizoalica/">home</a>',
        'get-started.html': '<p>ok</p>'
      },
      ['brand/logo.svg']
    );
    expect(checkBase(dist, '/vizoalica/')).toEqual([]);
  });

  it('reports a link written from the root, which would break on the copy', () => {
    const dist = site({ 'index.html': '<a href="/llms.txt">llms</a>' });
    expect(checkBase(dist, '/vizoalica/')).toEqual([
      '/index.html: href="/llms.txt" does not start with /vizoalica/'
    ]);
  });

  it('reports a reference to a file that is not in the build', () => {
    const dist = site({ 'index.html': '<video poster="/vizoalica/media/gone.jpg"></video>' });
    expect(checkBase(dist, '/vizoalica/')).toEqual([
      '/index.html: poster="/vizoalica/media/gone.jpg" points at a file that is not in the build'
    ]);
  });
});
