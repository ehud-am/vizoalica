/**
 * The site's navigation, as plain data so a test can check it against the files in docs/.
 * Every Markdown file in docs/ must be reachable from here.
 */
export interface NavItem {
  text: string;
  link: string;
}
export interface NavGroup {
  text: string;
  items: NavItem[];
}

export const sidebar: NavGroup[] = [
  {
    text: 'Get started',
    items: [
      { text: 'Quick start', link: '/get-started' },
      { text: 'Product tour', link: '/tour' }
    ]
  },
  {
    text: 'Set it up',
    items: [
      { text: 'Deploy the backend', link: '/operations/cloudflare' },
      { text: 'Set up the console', link: '/operations/local-analytics' },
      { text: 'Set up the console with OneCLI', link: '/operations/onecli' },
      { text: 'Environments and `vizoalica env`', link: '/operations/environments' },
      { text: 'Create a backend with `vizoalica deploy`', link: '/operations/deploy' },
      { text: 'Start the console day to day', link: '/operations/operator-local' },
      { text: 'Activate a website', link: '/operations/pages' },
      { text: 'Browser SDK', link: '/operations/browser-sdk' },
      { text: 'Database and Worker versions', link: '/operations/schema-versions' },
      { text: 'Troubleshooting', link: '/operations/troubleshooting' }
    ]
  },
  {
    text: 'Privacy and cost',
    items: [
      { text: 'Privacy defaults', link: '/operations/privacy' },
      { text: 'Audience attributes review', link: '/privacy/audience-attributes-review' },
      { text: 'Action collection review', link: '/privacy/action-collection-review' },
      { text: 'Access keys review', link: '/privacy/access-keys-review' },
      { text: 'Cost model', link: '/operations/cost-model' }
    ]
  },
  {
    text: 'Project',
    items: [
      { text: 'Get involved', link: '/community' },
      { text: 'Self-hosted releases', link: '/operations/releases' },
      { text: 'Public repository readiness', link: '/operations/public-release' },
      { text: 'Publishing this site', link: '/operations/docs-site' },
      { text: 'Brand system', link: '/brand' },
      { text: 'v0.1.0 architecture discussion', link: '/v0.1.0-architecture-discussion' }
    ]
  },
  {
    // Not collapsible: the theme's collapsible groups nest a button inside a button, which fails
    // the accessibility check.
    text: 'Release notes',
    items: [
      { text: 'v0.7.0', link: '/releases/v0.7.0' },
      { text: 'v0.6.2', link: '/releases/v0.6.2' },
      { text: 'v0.6.1', link: '/releases/v0.6.1' },
      { text: 'v0.6.0', link: '/releases/v0.6.0' },
      { text: 'v0.5.3', link: '/releases/v0.5.3' },
      { text: 'v0.5.2', link: '/releases/v0.5.2' },
      { text: 'v0.5.1', link: '/releases/v0.5.1' },
      { text: 'v0.5.0', link: '/releases/v0.5.0' }
    ]
  }
];

export const nav = [
  { text: 'Get started', link: '/get-started' },
  { text: 'Tour', link: '/tour' },
  { text: 'Docs', link: '/operations/cloudflare' },
  { text: 'Privacy', link: '/operations/privacy' },
  { text: 'Get involved', link: '/community' },
  { text: 'Releases', link: '/releases/v0.7.0' }
];

/** Every page address the navigation reaches, without the leading slash. */
export function navigationLinks(): string[] {
  return [
    ...sidebar.flatMap((group) => group.items.map((item) => item.link)),
    ...nav.map((item) => item.link)
  ].map((link) => link.replace(/^\//, ''));
}
