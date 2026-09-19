/**
 * Saves six console snapshots for the README, the website, and the promo video into
 * docs/assets/promo-src/. It starts the dev console, answers its API from the fictional data in
 * demo-console.ts, and needs no backend and no credentials.
 *
 * Run: node --import tsx scripts/promo/capture-snapshots.ts   (or: pnpm promo:snapshots)
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { installDemoConsole } from './demo-console.js';

const require = createRequire(new URL('../../apps/admin-web/package.json', import.meta.url));
const { chromium } = require('@playwright/test') as typeof import('@playwright/test');

const OUT = fileURLToPath(new URL('../../docs/assets/promo-src/', import.meta.url));
const PORT = 4179;
const VIEWPORT = { width: 1440, height: 960 };

interface Shot {
  file: string;
  route: string;
  scheme: 'light' | 'dark';
  /** A selector that only exists once the screen has its real content. */
  ready: string;
  /** Extra wait for content that arrives after the first paint. */
  settle?: (page: import('@playwright/test').Page) => Promise<void>;
}

const SHOTS: Shot[] = [
  {
    file: '01-overview.png',
    route: 'analytics/overview',
    scheme: 'light',
    ready: '.recharts-line',
    settle: async (page) => {
      // The change against the previous period arrives with its own request.
      await page.locator('.metric-change.up').first().waitFor();
    }
  },
  {
    file: '02-geography.png',
    route: 'analytics/geography',
    scheme: 'light',
    ready: '.map-country.step-7'
  },
  { file: '03-technology.png', route: 'analytics/technology', scheme: 'light', ready: '.bar-list' },
  { file: '04-websites.png', route: 'manage/websites', scheme: 'light', ready: '.website-card' },
  {
    file: '05-install.png',
    route: 'manage/websites/site-docs/install',
    scheme: 'light',
    ready: '.install-step'
  },
  {
    file: '06-overview-dark.png',
    route: 'analytics/overview',
    scheme: 'dark',
    ready: '.recharts-line',
    settle: async (page) => {
      await page.locator('.metric-change.up').first().waitFor();
    }
  }
];

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const up = await fetch(`http://127.0.0.1:${PORT}`).then(
      (response) => response.ok,
      () => false
    );
    if (up) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('The console dev server did not start.');
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const server = spawn(
    'pnpm',
    ['--filter', '@vizoalica/admin-web', 'dev', '--host', '127.0.0.1', '--port', String(PORT)],
    { stdio: 'ignore' }
  );
  const browser = await chromium.launch();
  try {
    await waitForServer();
    for (const shot of SHOTS) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        colorScheme: shot.scheme,
        reducedMotion: 'reduce',
        locale: 'en-US',
        timezoneId: 'UTC'
      });
      const page = await context.newPage();
      await installDemoConsole(page);
      await page.goto(`http://127.0.0.1:${PORT}/#/${shot.route}`);
      await page.locator(shot.ready).first().waitFor();
      await shot.settle?.(page);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}${shot.file}` });
      await context.close();
      console.log(`saved ${shot.file}`);
    }
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
