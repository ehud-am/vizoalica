/** Where the footer points. External, opened in a new tab, and never requested until followed. */
export type FooterLink = { label: string; href: string; description: string };

const SITE = 'https://vizoalica.dev';
const REPO = 'https://github.com/ehud-am/vizoalica';

export const FOOTER_TAGLINE = 'Privacy-first analytics that runs in your own Cloudflare account.';

export const VIZOALICA_LINKS: readonly FooterLink[] = [
  { label: 'Website', href: SITE, description: 'the Vizoalica website' },
  { label: 'Documentation', href: `${SITE}/get-started`, description: 'the documentation' },
  { label: 'Get started', href: `${SITE}/get-started`, description: 'the getting started guide' },
  { label: 'Privacy', href: `${SITE}/operations/privacy`, description: 'the privacy model' }
];

export const PROJECT_LINKS: readonly FooterLink[] = [
  { label: 'GitHub', href: REPO, description: 'the project on GitHub' },
  { label: 'npm', href: 'https://www.npmjs.com/package/vizoalica', description: 'the npm package' },
  { label: 'Discussions', href: `${REPO}/discussions`, description: 'GitHub Discussions' },
  { label: 'Issues', href: `${REPO}/issues`, description: 'GitHub Issues' },
  { label: 'Release notes', href: `${REPO}/releases`, description: 'the release notes' },
  { label: 'License', href: `${REPO}/blob/main/LICENSE`, description: 'the MIT license' }
];
