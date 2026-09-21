/**
 * Fictional, deterministic data for the promo snapshots. Nothing here is real: the organization,
 * its websites (on reserved `.example` domains), and every number are made up so the console can be
 * shown at its best without exposing anyone's traffic. The same inputs always give the same output.
 */
import type { Page } from '@playwright/test';

const ORG = 'Paperkite';
const WORKER = 'https://vizoalica.paperkite.workers.dev';
const PROJECT_ID = 'paperkite';

interface Site {
  id: string;
  name: string;
  origin: string;
  status: 'active' | 'disabled';
  share: number;
}

// `share` is that website's part of the project's traffic when the console is scoped to it.
const SITES: Site[] = [
  {
    id: 'site-marketing',
    name: 'Marketing site',
    origin: 'https://paperkite.example',
    status: 'active',
    share: 0.46
  },
  {
    id: 'site-docs',
    name: 'Documentation',
    origin: 'https://docs.paperkite.example',
    status: 'active',
    share: 0.31
  },
  {
    id: 'site-blog',
    name: 'Blog',
    origin: 'https://blog.paperkite.example',
    status: 'active',
    share: 0.17
  },
  {
    id: 'site-status',
    name: 'Status page',
    origin: 'https://status.paperkite.example',
    status: 'active',
    share: 0.06
  },
  {
    id: 'site-help',
    name: 'Help center',
    origin: 'https://help.paperkite.example',
    status: 'active',
    share: 0.04
  },
  {
    id: 'site-careers',
    name: 'Careers',
    origin: 'https://careers.paperkite.example',
    status: 'active',
    share: 0.03
  },
  {
    id: 'site-changelog',
    name: 'Changelog',
    origin: 'https://changelog.paperkite.example',
    status: 'active',
    share: 0.02
  },
  {
    id: 'site-launch',
    name: 'Launch page 2024',
    origin: 'https://launch.paperkite.example',
    status: 'disabled',
    share: 0
  }
];

const PAGE_VIEWS = 48_912;
const UNIQUE_USERS = 12_347;
// The earlier period had a bit less traffic, so the console shows growth on both numbers.
const PREVIOUS_VIEWS = 0.921;
const PREVIOUS_USERS = 0.937;

// A small seeded generator, so the hourly wiggle is the same on every run.
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Splits `total` across weighted labels so the counts add up exactly, largest first. */
function split(
  total: number,
  weighted: Array<[string, number]>
): Array<{ label: string; count: number }> {
  const sum = weighted.reduce((all, [, weight]) => all + weight, 0);
  const items = weighted.map(([label, weight]) => ({
    label,
    count: Math.floor((weight / sum) * total)
  }));
  items[0]!.count += total - items.reduce((all, item) => all + item.count, 0);
  return items.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

const ranking = (total: number, weighted: Array<[string, number]>, keep = weighted.length) => {
  const all = split(total, weighted);
  const items = all.slice(0, keep);
  return { items, otherCount: all.slice(keep).reduce((sum, item) => sum + item.count, 0), total };
};
const distribution = (total: number, weighted: Array<[string, number]>) => ({
  items: split(total, weighted),
  total
});

const COUNTRIES: Array<[string, number]> = [
  ['US', 27.8],
  ['DE', 10.6],
  ['GB', 9.2],
  ['FR', 6.4],
  ['IN', 5.9],
  ['CA', 5.7],
  ['NL', 4.2],
  ['BR', 3.9],
  ['AU', 3.7],
  ['ES', 2.8],
  ['SE', 2.6],
  ['PL', 2.2],
  ['IT', 2.1],
  ['JP', 2.0],
  ['CH', 1.7],
  ['MX', 1.5],
  ['NO', 1.5],
  ['DK', 1.4],
  ['IE', 1.2],
  ['SG', 1.2],
  ['KR', 1.1],
  ['TR', 1.0],
  ['ZA', 0.9],
  ['NZ', 0.9],
  ['AT', 0.8],
  ['BE', 0.8],
  ['FI', 0.8],
  ['PT', 0.7],
  ['AR', 0.6],
  ['ID', 0.6],
  ['IL', 0.6],
  ['CZ', 0.5],
  ['UA', 0.5],
  ['RO', 0.4],
  ['GR', 0.4],
  ['HK', 0.4],
  ['NG', 0.3],
  ['KE', 0.3],
  ['EG', 0.3],
  ['CL', 0.3],
  ['T1', 0.4],
  ['XX', 0.3]
];

function overview(startUtc: string, endUtc: string, earlier: boolean) {
  const scale = earlier ? PREVIOUS_VIEWS : 1;
  const hours = Math.max(1, Math.round((Date.parse(endUtc) - Date.parse(startUtc)) / 3_600_000));
  const views = Math.round(PAGE_VIEWS * scale);
  const users = Math.round(UNIQUE_USERS * (earlier ? PREVIOUS_USERS : 1));
  const next = random(42);
  // One day of traffic: quiet overnight, a morning climb, a European and a US afternoon peak.
  const curve = Array.from({ length: hours }, (_, index) => {
    const hour = new Date(Date.parse(startUtc) + index * 3_600_000).getUTCHours();
    const day = 0.55 + 0.45 * Math.sin(((hour - 5) / 24) * 2 * Math.PI);
    const usPeak = Math.exp(-((hour - 17) ** 2) / 8) * 0.35;
    return Math.max(0.12, day + usPeak + (next() - 0.5) * 0.12);
  });
  const total = curve.reduce((sum, value) => sum + value, 0);
  const trend = curve.map((value, index) => {
    const pageViews = Math.round((value / total) * views);
    return {
      startUtc: new Date(Date.parse(startUtc) + index * 3_600_000).toISOString(),
      pageViews,
      uniqueUsers: Math.round(pageViews * (users / views) * (0.92 + next() * 0.16))
    };
  });
  return {
    scope: {
      projectId: PROJECT_ID,
      sourceId: null,
      label: 'All websites',
      identityMode: 'source-local'
    },
    range: { startUtc, endUtc, interval: hours <= 24 ? 'hour' : 'day', timezone: 'UTC' },
    totals: { pageViews: views, uniqueUsers: users },
    trend,
    rankings: {
      pagePaths: ranking(views, [
        ['/', 19],
        ['/pricing', 12.5],
        ['/docs/getting-started', 11.2],
        ['/blog/privacy-first-analytics', 8.8],
        ['/features', 7.7],
        ['/docs/api/events', 6.2],
        ['/changelog', 4.4],
        ['/about', 3.0],
        ['/contact', 2.3],
        ['/docs/self-hosting', 2.0],
        ['/blog/cloudflare-workers-d1', 1.8],
        ['/security', 1.5],
        ['/careers', 1.1],
        ['/docs/privacy', 1.0],
        ['/status', 0.9],
        ['/legal/terms', 0.6],
        ['/legal/privacy', 0.6],
        ['/press', 0.4]
      ]),
      countries: ranking(views, COUNTRIES),
      userAgents: ranking(views, [
        ['Chrome 127', 33],
        ['Safari 17', 15],
        ['Firefox 128', 8],
        ['Edge 127', 6],
        ['Chrome 126', 5.5],
        ['Safari 16', 4],
        ['Mobile Safari 17', 12],
        ['Chrome Mobile 127', 9],
        ['Samsung Internet 25', 1.5],
        ['Opera 112', 1],
        ['Googlebot', 2.5],
        ['Bingbot', 1.2],
        ['Other bot', 0.8]
      ]),
      referrers: ranking(views, [
        ['Direct', 32.5],
        ['google.com', 25.2],
        ['news.ycombinator.com', 10],
        ['github.com', 8.1],
        ['duckduckgo.com', 4.5],
        ['x.com', 3.4],
        ['reddit.com', 2.7],
        ['lobste.rs', 1.3],
        ['bing.com', 1.2],
        ['linkedin.com', 1.1],
        ['dev.to', 0.9],
        ['producthunt.com', 0.8],
        ['indiehackers.com', 0.5]
      ])
    },
    distributions: {
      operatingSystems: distribution(views, [
        ['Windows', 31],
        ['macOS', 27],
        ['iOS', 17],
        ['Android', 14],
        ['Linux', 8],
        ['Other', 3]
      ]),
      browsers: distribution(views, [
        ['Chrome', 46],
        ['Safari', 27],
        ['Firefox', 11],
        ['Edge', 7],
        ['Samsung Internet', 2],
        ['Opera', 1],
        ['Other', 6]
      ]),
      devices: distribution(views, [
        ['Desktop', 57],
        ['Mobile', 38],
        ['Tablet', 5]
      ]),
      traffic: distribution(views, [
        ['Human', 91.4],
        ['Bot', 4.9],
        ['Unknown', 3.7]
      ])
    },
    availability: { state: 'complete', taxonomyVersions: [1] }
  };
}

const staticSnippet = (site: Site) =>
  `<script\n  async\n  src="${site.origin}/vizoalica.js"\n  data-endpoint="${WORKER}/v1/events:batch"\n  data-source="pk_${site.id.replace('site-', '')}_8f3a1c"\n  data-project="${PROJECT_ID}"\n  data-token-url="/vizoalica/ingest-token"\n  data-consent="unknown"\n></script>`;

function integration(site: Site) {
  const key = `pk_${site.id.replace('site-', '')}_8f3a1c`;
  const config = {
    version: 1,
    src: `${site.origin}/vizoalica.js`,
    'data-endpoint': `${WORKER}/v1/events:batch`,
    'data-source': key,
    'data-project': PROJECT_ID,
    'data-token-url': '/vizoalica/ingest-token',
    'data-consent': 'unknown'
  };
  const ref = 'ehud-am/vizoalica/.github/workflows/deploy-vizoalica-pages.yml@v0.6.2';
  const variables: Record<string, string> = {
    VIZOALICA_SDK_SRC: config.src,
    VIZOALICA_INGEST_ENDPOINT: config['data-endpoint'],
    VIZOALICA_PUBLIC_SOURCE_KEY: key,
    VIZOALICA_PROJECT_ID: PROJECT_ID,
    VIZOALICA_TOKEN_URL: '/vizoalica/ingest-token',
    VIZOALICA_CONSENT: 'unknown',
    VIZOALICA_SOURCE_ID: site.id,
    VIZOALICA_SITE_ORIGINS: site.origin
  };
  return {
    projectId: PROJECT_ID,
    sourceId: site.id,
    publicSourceKey: key,
    allowedOrigins: [site.origin],
    html: staticSnippet(site),
    modes: [
      { id: 'static', snippet: staticSnippet(site) },
      {
        id: 'dynamic',
        snippet: '<script async src="/vizoalica-loader.js"></script>',
        configUrl: '/vizoalica/config.json',
        config,
        cloudflare: {
          workflowRef: ref,
          repoVariables: variables,
          accountSpecificVariables: ['CF_ACCOUNT_ID', 'CF_PAGES_PROJECT'],
          repoSecretNames: ['CF_API_TOKEN', 'VIZOALICA_TOKEN_SECRET'],
          starterWorkflowYaml: `name: Deploy website\non:\n  push:\n    branches: [main]\n    paths: ["site/**"]\n\njobs:\n  deploy:\n    uses: ${ref}\n    with:\n      site-directory: site\n    secrets: inherit`,
          setupCommands: [
            ...Object.entries(variables).map(
              ([name, value]) => `gh variable set ${name} --body ${JSON.stringify(value)}`
            ),
            'gh variable set CF_ACCOUNT_ID --body YOUR_CF_ACCOUNT_ID',
            'gh variable set CF_PAGES_PROJECT --body YOUR_CF_PAGES_PROJECT',
            'gh secret set CF_API_TOKEN',
            'gh secret set VIZOALICA_TOKEN_SECRET'
          ],
          warnings: [
            'The listed repository variables are public browser configuration, not secrets.',
            'CF_API_TOKEN and VIZOALICA_TOKEN_SECRET are secrets: generate them yourself and set them with gh secret set (or the GitHub UI), never paste a real value into this console.',
            'Scope CF_API_TOKEN to Cloudflare Pages: Edit on this account only.',
            'Enable only one installation mode so Vizoalica initializes once.'
          ]
        }
      }
    ],
    privateSetup: { tokenIssuer: 'website-owned', tokenSecretRequired: true }
  };
}

const websites = SITES.map((site) => ({
  id: site.id,
  projectId: PROJECT_ID,
  name: site.name,
  publicSourceKey: `pk_${site.id.replace('site-', '')}_8f3a1c`,
  allowedOrigins:
    site.id === 'site-marketing' ? [site.origin, 'https://www.paperkite.example'] : [site.origin],
  status: site.status
}));

/** Answers every console API call locally with the demo data. Nothing reaches a backend. */
export async function installDemoConsole(page: Page): Promise<void> {
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/api\//, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/session') return route.fulfill({ status: 204 });
    if (path === '/api/preferences/theme') return route.fulfill({ json: { theme: null } });
    if (path === '/api/projects')
      return route.fulfill({
        json: [
          { id: PROJECT_ID, name: ORG, websiteCount: SITES.length },
          { id: 'side-projects', name: 'Side projects', websiteCount: 0 }
        ]
      });
    if (path === `/api/projects/${PROJECT_ID}/websites`) return route.fulfill({ json: websites });
    if (path.startsWith('/api/projects/') && path.endsWith('/websites'))
      return route.fulfill({ json: [] });
    const site = SITES.find((item) => path.includes(`/websites/${item.id}/`));
    if (path.endsWith('/snippet') && site) return route.fulfill({ json: integration(site) });
    if (path.endsWith('/status'))
      return route.fulfill({
        json: {
          collection: 'healthy',
          aggregation: 'available',
          configuration: 'healthy',
          dataAccess: 'available'
        }
      });
    if (path.endsWith('/reachability'))
      return route.fulfill({
        json: {
          configEndpointReachable: true,
          configEndpointCheckedAt: new Date().toISOString(),
          configEndpointError: null
        }
      });
    if (path.endsWith('/analytics')) {
      const start = url.searchParams.get('start')!;
      const end = url.searchParams.get('end')!;
      // The comparison request asks for the range before the selected one.
      const earlier = Date.parse(end) < Date.now() - 6 * 3_600_000;
      return route.fulfill({ json: overview(start, end, earlier) });
    }
    return route.fulfill({ json: {} });
  });
}
