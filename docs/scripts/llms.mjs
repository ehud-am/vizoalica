/**
 * Turns the repository's llms.txt (links written for the repository) into the site's llms.txt (links
 * that work on vizoalica.dev). Links into docs/ become site pages; other repository files become
 * GitHub links.
 */
const SITE = 'https://vizoalica.dev';
const REPO = 'https://github.com/ehud-am/vizoalica';

export function toSiteLlms(text) {
  return text.replace(/\]\(([^)\s]+)\)/g, (whole, target) => {
    if (/^[a-z]+:/i.test(target) || target.startsWith('#')) return whole;
    const [path, hash] = target.split('#');
    const suffix = hash ? `#${hash}` : '';
    if (path.startsWith('docs/')) {
      const page = path.slice('docs/'.length).replace(/\.md$/, '');
      return `](${SITE}/${page}${suffix})`;
    }
    return `](${REPO}/${path.endsWith('/') ? 'tree' : 'blob'}/main/${path.replace(/\/$/, '')}${suffix})`;
  });
}
