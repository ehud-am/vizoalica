import { posix } from 'node:path';
import { defineConfig, type MarkdownRenderer } from 'vitepress';
import { nav, sidebar } from './navigation.js';

const SITE = 'https://vizoalica.dev';
const REPO = 'https://github.com/ehud-am/vizoalica';
// Where the site is served from. The default is the root, for vizoalica.dev. The GitHub Pages copy
// is built with DOCS_BASE=/vizoalica/ because a project site lives under that path.
const BASE = normalizeBase(process.env.DOCS_BASE);
const DESCRIPTION =
  'Open-source, self-hosted, privacy-first web and product analytics that runs in your own Cloudflare account. One command sets it up, and your visitors’ data stays in infrastructure you control.';

function normalizeBase(value: string | undefined): string {
  if (!value || value === '/') return '/';
  if (!/^\/[\w./-]+\/$/.test(value) || value.includes('..'))
    throw new Error('DOCS_BASE must look like /name/ (a leading and a trailing slash).');
  return value;
}

/**
 * The docs are plain Markdown that also reads correctly on GitHub, so some link to files outside
 * docs/ (the changelog, a spec, example code). On the site those would be dead, so they become
 * links to the same file on GitHub. The sources are not touched.
 */
function linkOutsideDocsToGithub(md: MarkdownRenderer): void {
  md.core.ruler.push('vizoalica-outside-docs', (state) => {
    const relativePath = (state.env as { relativePath?: string }).relativePath;
    if (!relativePath) return true;
    for (const block of state.tokens) {
      // Raw HTML (the home page's cards, a figure caption) is not touched by the site generator, so
      // its site-absolute links get the base here.
      if (BASE !== '/' && block.type === 'html_block')
        block.content = block.content.replace(/\b(href|src)="\/(?!\/)/g, `$1="${BASE}`);
      for (const token of block.children ?? []) {
        if (BASE !== '/' && token.type === 'html_inline')
          token.content = token.content.replace(/\b(href|src)="\/(?!\/)/g, `$1="${BASE}`);
        if (token.type !== 'link_open') continue;
        const href = token.attrGet('href');
        if (!href || /^([a-z]+:|#|\/)/i.test(href)) continue;
        const [path, hash] = href.split('#');
        // Where the link points, relative to the repository root.
        const target = posix.normalize(posix.join('docs', posix.dirname(relativePath), path!));
        if (target.startsWith('docs/') && target !== 'docs') continue;
        const kind = path!.endsWith('/') ? 'tree' : 'blob';
        token.attrSet(
          'href',
          `${REPO}/${kind}/main/${target.replace(/\/$/, '')}${hash ? `#${hash}` : ''}`
        );
      }
    }
    return true;
  });
}

export default defineConfig({
  base: BASE,
  // The consent prompt and the analytics loader exist only when the site is built for a Vizoalica
  // backend (VIZOALICA_INGEST_ENDPOINT set). Without it the site is exactly as before: no prompt,
  // no analytics.
  vite: {
    define: {
      __VIZOALICA_ANALYTICS__: JSON.stringify(Boolean(process.env.VIZOALICA_INGEST_ENDPOINT))
    }
  },
  title: 'Vizoalica',
  description: DESCRIPTION,
  lang: 'en-US',
  cleanUrls: true,
  // The GitHub Pages copy names vizoalica.dev as the canonical address of every page, and a sitemap
  // may only list addresses on its own host, so only the primary site has one.
  sitemap: BASE === '/' ? { hostname: SITE } : undefined,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${BASE}brand/favicon.svg` }],
    ['meta', { name: 'theme-color', content: '#10141c' }],
    ['meta', { property: 'og:site_name', content: 'Vizoalica' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:image', content: `${SITE}/og.jpg` }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: `${SITE}/og.jpg` }]
  ],
  transformPageData(pageData) {
    // The home page's feature cards are HTML in the front matter, which the theme renders as is.
    const features = pageData.frontmatter.features as { details?: string }[] | undefined;
    if (BASE !== '/' && features)
      for (const feature of features)
        feature.details = feature.details?.replace(/\bhref="\/(?!\/)/g, `href="${BASE}`);
  },
  transformHead({ pageData }) {
    const path = pageData.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');
    const title = pageData.frontmatter.title ?? pageData.title;
    const description = pageData.frontmatter.description ?? pageData.description ?? DESCRIPTION;
    return [
      ['link', { rel: 'canonical', href: `${SITE}/${path}` }],
      ['meta', { property: 'og:url', content: `${SITE}/${path}` }],
      ['meta', { property: 'og:title', content: title || 'Vizoalica' }],
      ['meta', { property: 'og:description', content: description }]
    ];
  },
  markdown: {
    // The high-contrast syntax themes keep every code token above the 4.5:1 minimum.
    theme: { light: 'github-light-high-contrast', dark: 'github-dark-high-contrast' },
    config: linkOutsideDocsToGithub
  },
  themeConfig: {
    logo: {
      light: '/brand/vizoalica-lockup-light.svg',
      dark: '/brand/vizoalica-lockup-dark.svg',
      alt: 'Vizoalica'
    },
    siteTitle: false,
    nav,
    sidebar,
    socialLinks: [{ icon: 'github', link: REPO, ariaLabel: 'Vizoalica on GitHub' }],
    search: { provider: 'local' },
    editLink: { pattern: `${REPO}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
    outline: { level: [2, 3], label: 'On this page' },
    footer: {
      message: `Released under the MIT License. Visitor data stays in your own Cloudflare account. <a href="${BASE}community">Ideas and contributions are welcome.</a>`,
      copyright: 'Vizoalica'
    }
  }
});
