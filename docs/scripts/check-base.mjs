/**
 * Checks a built copy of the site that is served under a path (the GitHub Pages copy, under
 * /vizoalica/). Every link, image, script, stylesheet, and video in every page must either leave the
 * site or point at a file that exists under that path. A link written from the root ("/media/x.mp4")
 * would work on vizoalica.dev and break silently on the copy, so it is reported too.
 *
 * Run after `DOCS_BASE=/vizoalica/ pnpm docs:build`: `node docs/scripts/check-base.mjs /vizoalica/`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function htmlFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return path.endsWith('.html') ? [path] : [];
  });
}

/** Returns a list of problems, empty when the copy is sound. */
export function checkBase(dist, base) {
  const problems = [];
  for (const page of htmlFiles(dist)) {
    const html = readFileSync(page, 'utf8');
    for (const [, attribute, value] of html.matchAll(/\b(href|src|poster)="(\/[^"#?]*)/g)) {
      // A protocol-relative address ("//host/x") leaves the site.
      if (value.startsWith('//')) continue;
      const shown = `${page.slice(dist.length)}: ${attribute}="${value}"`;
      if (!value.startsWith(base)) {
        problems.push(`${shown} does not start with ${base}`);
        continue;
      }
      const path = join(dist, decodeURIComponent(value.slice(base.length)));
      const found = [path, `${path}.html`, join(path, 'index.html')].some(
        (candidate) => existsSync(candidate) && statSync(candidate).isFile()
      );
      if (!found) problems.push(`${shown} points at a file that is not in the build`);
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = process.argv[2];
  if (!base || !/^\/[\w./-]+\/$/.test(base)) {
    console.error('Usage: node docs/scripts/check-base.mjs /base/');
    process.exit(2);
  }
  const dist = fileURLToPath(new URL('../.vitepress/dist/', import.meta.url));
  const problems = checkBase(dist, base);
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);
  console.log(`base check passed: every local reference resolves under ${base}`);
}
