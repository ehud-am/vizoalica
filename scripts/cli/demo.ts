import { createHmac, randomUUID } from 'node:crypto';
import { type Ctx, OpsError, done, step } from './context.js';
import { purgeDeleted } from '../purge-deleted.js';

export const DEMO_PROJECT = 'Vizoalica demo (sample data)';
export const DEMO_ORIGIN = 'https://demo.vizoalica.example';
const BATCHES_PER_AGENT = 2;
const EVENTS_PER_BATCH = 8;

const AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
];
const PAGES: Array<[string, string]> = [
  ['/', 'Home'],
  ['/', 'Home'],
  ['/', 'Home'],
  ['/pricing', 'Pricing'],
  ['/pricing', 'Pricing'],
  ['/docs', 'Documentation'],
  ['/docs', 'Documentation'],
  ['/docs/getting-started', 'Getting started'],
  ['/blog/launch-day', 'Launch day'],
  ['/signup', 'Sign up']
];
const REFERRERS = [
  undefined,
  'https://www.google.com',
  'https://news.ycombinator.com',
  'https://github.com',
  undefined
];

/** A small deterministic generator so the sample data is stable and testable. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type DemoBatch = { userAgent: string; events: Array<Record<string, unknown>> };

export function buildDemoBatches(input: {
  projectId: string;
  publicKey: string;
  now: Date;
  seed?: number;
}): DemoBatch[] {
  const random = generator(input.seed ?? 20260919);
  const batches: DemoBatch[] = [];
  AGENTS.forEach((userAgent, agentIndex) => {
    // Each device type gets its own visitors, so browsers, systems and devices all show up.
    const visitors = Array.from({ length: 5 }, (_, index) => ({
      id: `anon_demo-${agentIndex}-${index}`,
      session: `sess_demo-${agentIndex}-${index}`,
      referrer: REFERRERS[Math.floor(random() * REFERRERS.length)]
    }));
    for (let batch = 0; batch < BATCHES_PER_AGENT; batch += 1) {
      const events = Array.from({ length: EVENTS_PER_BATCH }, (_, index) => {
        const visitor = visitors[Math.floor(random() * visitors.length)]!;
        const [path, title] = PAGES[Math.floor(random() * PAGES.length)]!;
        const age = ((agentIndex * BATCHES_PER_AGENT + batch) * EVENTS_PER_BATCH + index) * 5000;
        return {
          specversion: '1.0',
          id: `evt_${randomUUID()}`,
          type: 'com.vizoalica.page_view.v1',
          source: DEMO_ORIGIN,
          subject: `source/${input.publicKey}/session/${visitor.session}`,
          time: new Date(input.now.getTime() - age).toISOString(),
          datacontenttype: 'application/json',
          vizoalicasource: input.publicKey,
          vizoalicaauth: 'signed-session',
          vizoalicaconsent: 'analytics-granted',
          vizoalicaproject: input.projectId,
          data: {
            page: { url_origin: DEMO_ORIGIN, url_path: path, url_query_redacted: false, title },
            visitor: { anonymous_id: visitor.id },
            session: { id: visitor.session },
            ...(visitor.referrer ? { referrer: { origin: visitor.referrer } } : {})
          }
        };
      });
      batches.push({ userAgent, events });
    }
  });
  return batches;
}

const base64url = (value: string | Buffer): string => Buffer.from(value).toString('base64url');

/** Mints the same short-lived HS256 token the website's token endpoint would. */
export function signIngestToken(
  secret: string,
  claims: { projectId: string; sourceId: string; origin: string; now: Date }
): string {
  const iat = Math.floor(claims.now.getTime() / 1000);
  const body = {
    iss: 'vizoalica-cli-demo',
    aud: 'vizoalica-ingest',
    sub: `source/${claims.sourceId}`,
    project_id: claims.projectId,
    source_id: claims.sourceId,
    origin: claims.origin,
    scope: 'events:write',
    iat,
    nbf: iat,
    exp: iat + 300,
    jti: randomUUID(),
    max_events: 25
  };
  const input = `${base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64url(JSON.stringify(body))}`;
  return `${input}.${base64url(createHmac('sha256', secret).update(input).digest())}`;
}

type DemoOptions = { workerUrl: string; adminSecret: string; now?: () => Date };
type Project = { id: string; name: string; status?: string };

async function admin<T>(
  ctx: Ctx,
  options: DemoOptions,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const response = await ctx.fetch(`${options.workerUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${options.adminSecret}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new OpsError(`${method} ${path} failed with HTTP ${response.status}.`);
  return (await response.json().catch(() => ({}))) as T;
}

const activeDemos = (projects: Project[]): Project[] =>
  projects.filter((project) => project.name === DEMO_PROJECT && project.status !== 'deleted');

export type DemoSummary = {
  projectId: string;
  sent: number;
  pageViews: number | undefined;
  uniqueUsers: number | undefined;
};

/** Creates a labelled demo project and sends signed sample events through the real ingestion path. */
export async function addDemoData(
  ctx: Ctx,
  options: DemoOptions & { tokenSecret: string }
): Promise<DemoSummary> {
  const now = options.now ?? (() => new Date());
  if (activeDemos(await admin<Project[]>(ctx, options, 'GET', '/v1/admin/projects')).length > 0)
    throw new OpsError(
      'Sample data already exists. Run "pnpm vizoalica demo --remove" first if you want a fresh set.'
    );

  step(ctx, 'Creating a sample project and website…');
  const project = await admin<Project>(ctx, options, 'POST', '/v1/admin/projects', {
    name: DEMO_PROJECT
  });
  const source = await admin<{ id: string; publicSourceKey: string }>(
    ctx,
    options,
    'POST',
    `/v1/admin/projects/${project.id}/sources`,
    {
      name: 'Sample website',
      allowedOrigins: [DEMO_ORIGIN]
    }
  );

  const batches = buildDemoBatches({
    projectId: project.id,
    publicKey: source.publicSourceKey,
    now: now()
  });
  step(ctx, `Sending ${batches.length * EVENTS_PER_BATCH} sample page views through your Worker…`);
  let sent = 0;
  for (const batch of batches) {
    const token = signIngestToken(options.tokenSecret, {
      projectId: project.id,
      sourceId: source.id,
      origin: DEMO_ORIGIN,
      now: now()
    });
    const response = await ctx.fetch(`${options.workerUrl}/v1/events:batch`, {
      method: 'POST',
      headers: {
        'content-type': 'application/cloudevents-batch+json',
        authorization: `Bearer ${token}`,
        'x-vizoalica-source': source.publicSourceKey,
        origin: DEMO_ORIGIN,
        'user-agent': batch.userAgent
      },
      body: JSON.stringify(batch.events),
      signal: AbortSignal.timeout(20_000)
    });
    if (response.status !== 202) {
      const reason =
        ((await response.json().catch(() => ({}))) as { error?: string }).error ??
        `HTTP ${response.status}`;
      throw new OpsError(
        response.status === 401
          ? 'The Worker rejected the sample events (401). The token secret you gave does not match VIZOALICA_TOKEN_SECRET.'
          : `The Worker rejected the sample events: ${reason}. Remove the partial sample with "pnpm vizoalica demo --remove".`
      );
    }
    sent += batch.events.length;
    ctx.out(`  ${sent} sent`);
    await ctx.sleep(1100); // the sample website's per-second quota is 10 events
  }

  step(
    ctx,
    'Waiting for the numbers to appear (analytics cover completed minutes, so this can take up to a minute)…'
  );
  let pageViews: number | undefined;
  let uniqueUsers: number | undefined;
  for (let attempt = 0; attempt < 9 && (pageViews ?? 0) < sent; attempt += 1) {
    const end = now();
    end.setUTCSeconds(0, 0);
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    const overview = await admin<{ totals?: { pageViews?: number; uniqueUsers?: number } }>(
      ctx,
      options,
      'GET',
      `/v1/admin/projects/${project.id}/analytics?start=${start.toISOString()}&end=${end.toISOString()}`
    ).catch(() => ({}) as { totals?: { pageViews?: number; uniqueUsers?: number } });
    pageViews = overview.totals?.pageViews;
    uniqueUsers = overview.totals?.uniqueUsers;
    if ((pageViews ?? 0) < sent) await ctx.sleep(10_000);
  }
  if ((pageViews ?? 0) >= sent)
    done(ctx, `${pageViews} page views from ${uniqueUsers} visitors are in your analytics.`);
  else
    ctx.out(
      '! The events were accepted; the numbers are still being aggregated. Open the console and check again in a minute.'
    );
  return { projectId: project.id, sent, pageViews, uniqueUsers };
}

/** Deletes the sample project and permanently purges it (and anything else already deleted). */
export async function removeDemoData(ctx: Ctx, options: DemoOptions): Promise<{ removed: number }> {
  const demos = activeDemos(await admin<Project[]>(ctx, options, 'GET', '/v1/admin/projects'));
  for (const demo of demos) await admin(ctx, options, 'DELETE', `/v1/admin/projects/${demo.id}`);
  if (demos.length > 0) {
    step(ctx, 'Purging the sample data permanently…');
    await purgeDeleted(options.workerUrl, `Bearer ${options.adminSecret}`, true, ctx.fetch);
  }
  done(ctx, demos.length > 0 ? 'Sample data removed.' : 'There was no sample data to remove.');
  return { removed: demos.length };
}
