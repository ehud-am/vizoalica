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
      { text: 'Create a backend', link: '/operations/deploy' },
      { text: 'Add a website', link: '/operations/pages' },
      { text: 'Browser SDK', link: '/operations/browser-sdk' },
      { text: 'Custom events', link: '/operations/custom-events' },
      { text: 'Campaigns', link: '/operations/campaigns' },
      { text: 'Rage clicks', link: '/operations/rage-clicks' },
      { text: 'Goals', link: '/operations/goals' },
      { text: 'Group pages with rules', link: '/operations/page-grouping' },
      { text: 'Guided setup with an AI assistant', link: '/operations/guided-setup' },
      { text: 'Exclude your own visits', link: '/operations/internal-traffic' },
      { text: 'Count views of a README', link: '/operations/pixel' },
      { text: 'Ask your AI assistant', link: '/operations/ai' },
      { text: 'Start the console day to day', link: '/operations/operator-local' },
      { text: 'Access keys', link: '/operations/share' },
      { text: 'Troubleshooting', link: '/operations/troubleshooting' }
    ]
  },
  {
    text: 'Advanced',
    items: [
      { text: 'Run more than one backend', link: '/operations/environments' },
      { text: 'Keep secrets in a vault (OneCLI)', link: '/operations/onecli' },
      { text: 'Manual install: backend from source', link: '/operations/cloudflare' },
      { text: 'Manual install: console from source', link: '/operations/local-analytics' },
      { text: 'Database and Worker versions', link: '/operations/schema-versions' }
    ]
  },
  {
    text: 'Privacy and cost',
    items: [
      { text: 'Privacy defaults', link: '/operations/privacy' },
      { text: 'Audience attributes review', link: '/privacy/audience-attributes-review' },
      { text: 'Action collection review', link: '/privacy/action-collection-review' },
      { text: 'Access keys review', link: '/privacy/access-keys-review' },
      { text: 'Campaign labels review', link: '/privacy/campaign-labels-review' },
      { text: 'Rage clicks review', link: '/privacy/rage-clicks-review' },
      { text: 'Internal traffic review', link: '/privacy/internal-traffic-review' },
      { text: 'No-script pixel review', link: '/privacy/pixel-review' },
      {
        text: 'Goals, grouping and pixel paths review',
        link: '/privacy/goals-grouping-pixel-paths-review'
      },
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
      { text: 'v0.15.0', link: '/releases/v0.15.0' },
      { text: 'v0.14.1', link: '/releases/v0.14.1' },
      { text: 'v0.14.0', link: '/releases/v0.14.0' },
      { text: 'v0.13.1', link: '/releases/v0.13.1' },
      { text: 'v0.13.0', link: '/releases/v0.13.0' },
      { text: 'v0.12.1', link: '/releases/v0.12.1' },
      { text: 'Older releases (GitHub)', link: 'https://github.com/ehud-am/vizoalica/releases' }
    ]
  }
];

export const nav = [
  { text: 'Get started', link: '/get-started' },
  { text: 'Tour', link: '/tour' },
  { text: 'Live demo', link: 'https://example.vizoalica.dev' },
  { text: 'Docs', link: '/operations/deploy' },
  { text: 'Privacy', link: '/operations/privacy' },
  { text: 'Get involved', link: '/community' },
  { text: 'Releases', link: '/releases/v0.15.0' }
];

/** Every page address the navigation reaches, without the leading slash. */
export function navigationLinks(): string[] {
  return [
    ...sidebar.flatMap((group) => group.items.map((item) => item.link)),
    ...nav.map((item) => item.link)
  ]
    .filter((link) => link.startsWith('/'))
    .map((link) => link.replace(/^\//, ''));
}
