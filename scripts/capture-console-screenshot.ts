/**
 * Saves the README screenshots of the console showing the sample data from `pnpm vizoalica demo`.
 *
 * Default: starts the dev console and mocks its API with numbers computed from the demo's own events
 * and the Worker's classifier. With --live: captures a console you already started against a real
 * backend that has the sample data (no mocks). Run: node --import tsx scripts/capture-console-screenshot.ts [--live]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { classifyRequest } from '../apps/ingest-worker/src/analytics/classifier.js';
import { DEMO_ORIGIN, DEMO_PROJECT, buildDemoBatches } from './cli/demo.js';

const require = createRequire(new URL('../apps/admin-web/package.json', import.meta.url));
const { chromium } = require('@playwright/test') as typeof import('@playwright/test');

const live = process.argv.includes('--live');
const port = live ? 5173 : 4173;
const now = new Date();
const end = new Date(now);
end.setUTCSeconds(0, 0);
const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

const tally = (values: string[]) => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
};
const ranking = (values: string[]) => ({
  items: tally(values),
  otherCount: 0,
  total: values.length
});
const distribution = (values: string[]) => ({ items: tally(values), total: values.length });

const batches = buildDemoBatches({ projectId: 'demo', publicKey: 'demo-key', now });
const rows = batches.flatMap((batch) => {
  const context = classifyRequest(
    new Request('https://worker.example/v1/events:batch', {
      headers: { 'user-agent': batch.userAgent }
    })
  );
  return batch.events.map((event) => {
    const data = event.data as {
      page: { url_path: string };
      visitor: { anonymous_id: string };
      referrer?: { origin: string };
    };
    return {
      context,
      path: data.page.url_path,
      visitor: data.visitor.anonymous_id,
      referrer: data.referrer?.origin
    };
  });
});
const label = (value: string | undefined) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Unknown';

const overviewFor = (startIso: string, endIso: string) => {
  const from = new Date(startIso);
  const hours = Math.round((new Date(endIso).getTime() - from.getTime()) / 3_600_000);
  return {
    scope: {
      projectId: 'demo',
      sourceId: null,
      label: 'All websites',
      identityMode: 'source-local'
    },
    range: { startUtc: startIso, endUtc: endIso, interval: 'hour', timezone: 'UTC' },
    totals: { pageViews: rows.length, uniqueUsers: new Set(rows.map((row) => row.visitor)).size },
    trend: Array.from({ length: hours }, (_, index) => ({
      startUtc: new Date(from.getTime() + index * 3_600_000).toISOString(),
      pageViews: index === hours - 1 ? rows.length : 0,
      uniqueUsers: index === hours - 1 ? new Set(rows.map((row) => row.visitor)).size : 0
    })),
    rankings: {
      pagePaths: ranking(rows.map((row) => row.path)),
      countries: ranking(rows.map((row) => row.context.country)),
      userAgents: ranking(rows.map((row) => row.context.userAgentFamily)),
      referrers: ranking(
        rows.map((row) => (row.referrer ? new URL(row.referrer).hostname : 'Direct'))
      )
    },
    distributions: {
      operatingSystems: distribution(rows.map((row) => row.context.os)),
      browsers: distribution(rows.map((row) => row.context.browser)),
      devices: distribution(rows.map((row) => label(row.context.device))),
      traffic: distribution(rows.map((row) => label(row.context.traffic)))
    },
    availability: { state: 'complete', taxonomyVersions: [1] }
  };
};
const project = { id: 'demo', name: DEMO_PROJECT };
const website = {
  id: 'site',
  projectId: 'demo',
  name: 'Sample website',
  publicSourceKey: 'demo-key',
  allowedOrigins: [DEMO_ORIGIN],
  status: 'active'
};

async function main(): Promise<void> {
  const server = live
    ? undefined
    : spawn(
        'pnpm',
        ['--filter', '@vizoalica/admin-web', 'dev', '--host', '127.0.0.1', '--port', String(port)],
        { stdio: 'ignore' }
      );
  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (
        await fetch(`http://127.0.0.1:${port}`).then(
          (r) => r.ok,
          () => false
        )
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const browser = await chromium.launch();
    mkdirSync('docs/assets', { recursive: true });
    for (const [scheme, file] of [
      ['light', 'console-overview-light.png'],
      ['dark', 'console-overview-dark.png']
    ] as const) {
      const page = await (
        await browser.newContext({
          viewport: { width: 1360, height: 1180 },
          deviceScaleFactor: 2,
          colorScheme: scheme
        })
      ).newPage();
      if (!live)
        await page.route(new RegExp(`^http://127\\.0\\.0\\.1:${port}/api/`), async (route) => {
          const path = new URL(route.request().url()).pathname;
          let body: unknown = {};
          if (path === '/api/session') return route.fulfill({ status: 204 });
          if (path === '/api/projects') body = [project];
          else if (path === '/api/preferences/theme') body = { theme: null };
          else if (path.endsWith('/websites')) body = [website];
          else if (path.endsWith('/status'))
            body = {
              collection: 'healthy',
              aggregation: 'available',
              configuration: 'healthy',
              dataAccess: 'available'
            };
          else if (path.endsWith('/analytics')) {
            const query = new URL(route.request().url()).searchParams;
            body = overviewFor(
              query.get('start') ?? start.toISOString(),
              query.get('end') ?? end.toISOString()
            );
          }
          await route.fulfill({ json: body });
        });
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.getByRole('heading', { name: 'Understand what’s happening.' }).waitFor();
      if (live)
        await page
          .getByRole('combobox', { name: /Project/ })
          .first()
          .selectOption({ label: DEMO_PROJECT });
      // Wait for the headline numbers, not a fixed delay, so the capture is never mid-render.
      await page
        .getByRole('button', { name: /Last 24 hours/ })
        .first()
        .click();
      await page.getByRole('radio', { name: /Last 6 hours/ }).check();
      await page.getByRole('button', { name: 'Apply' }).click();
      await page.getByText(String(rows.length), { exact: true }).first().waitFor();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `docs/assets/${file}`, fullPage: false });
    }
    await browser.close();
  } finally {
    server?.kill('SIGTERM');
  }
}
await main();
