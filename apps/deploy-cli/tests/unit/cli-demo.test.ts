import { describe, expect, it } from 'vitest';
import { ingestBatch } from '../../../ingest-api/src/ingestion/pipeline.js';
import { validateEventBatch } from '../../../ingest-api/src/ingestion/event-validator.js';
import { InMemoryRepositories } from '../../../ingest-api/src/storage/memory.js';
import { createWorkerTokenVerifier } from '../../../ingest-worker/src/auth/token-verifier.js';
import {
  DEMO_ORIGIN,
  DEMO_PROJECT,
  addDemoData,
  buildDemoBatches,
  removeDemoData,
  signIngestToken
} from '../../../../scripts/cli/demo.js';
import { generateSecret } from '../../../../scripts/cli/secrets.js';
import { WORKER_URL, fakeCtx } from '../cli-support.js';

const tokenSecret = generateSecret();
const adminSecret = generateSecret();
const now = new Date();
const claims = { projectId: 'p1', sourceId: 's1', origin: DEMO_ORIGIN, now };

/** The Worker's default website quota, as created by the console. */
const policy = {
  id: 'q1',
  maxRequestBytes: 131072,
  maxEventsPerBatch: 25,
  maxEventsPerToken: 25,
  maxEventsPerSecond: 10,
  maxEventsPerDay: 100,
  maxPropertyCount: 20,
  maxPropertyValueLength: 256,
  retentionDays: 7
};

/**
 * A Worker double whose event endpoint is the real ingestion pipeline (real token verifier, real schema
 * validation, real source authorization), so the demo has to be genuinely acceptable.
 */
function worker(options: { tokenSecret?: string; analyticsReadyAfter?: number } = {}) {
  const requests: string[] = [];
  const projects: Array<{ id: string; name: string; status: string }> = [];
  const repositories = new InMemoryRepositories({
    projects: [
      {
        id: 'p1',
        name: DEMO_PROJECT,
        mode: 'production',
        defaultRetentionDays: 7,
        quotaPolicyId: 'q1',
        status: 'active'
      }
    ],
    sources: [
      {
        id: 's1',
        projectId: 'p1',
        name: 'Sample website',
        allowedOrigins: [DEMO_ORIGIN],
        publicSourceKey: 'pub-key',
        status: 'active',
        quotaPolicyId: 'q1'
      }
    ],
    quotaPolicies: [policy]
  });
  let accepted = 0;
  let analyticsCalls = 0;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    requests.push(`${method} ${url.pathname}`);
    if (url.pathname === '/v1/admin/projects' && method === 'GET') return Response.json(projects);
    if (url.pathname === '/v1/admin/projects' && method === 'POST') {
      projects.push({ id: 'p1', name: DEMO_PROJECT, status: 'active' });
      return Response.json({ id: 'p1', name: DEMO_PROJECT }, { status: 201 });
    }
    if (url.pathname === '/v1/admin/projects/p1/sources')
      return Response.json({ id: 's1', publicSourceKey: 'pub-key' }, { status: 201 });
    if (url.pathname === '/v1/events:batch') {
      const headers = new Headers(init?.headers);
      const result = await ingestBatch(
        {
          body: String(init?.body),
          publicSourceKey: headers.get('x-vizoalica-source') ?? '',
          origin: headers.get('origin'),
          authorization: headers.get('authorization'),
          now: new Date()
        },
        {
          repositories,
          tokenSecret: options.tokenSecret ?? tokenSecret,
          verifyAuthorization: createWorkerTokenVerifier(options.tokenSecret ?? tokenSecret)
        }
      );
      if (result.status === 202) accepted += JSON.parse(String(init?.body)).length;
      return Response.json({ error: result.decision.reasonCodes?.[0] }, { status: result.status });
    }
    if (url.pathname === '/v1/admin/projects/p1/analytics') {
      analyticsCalls += 1;
      return Response.json(
        analyticsCalls > (options.analyticsReadyAfter ?? 0)
          ? { totals: { pageViews: accepted, uniqueUsers: 30 } }
          : { totals: { pageViews: 0, uniqueUsers: 0 } }
      );
    }
    if (url.pathname === '/v1/admin/projects/p1' && method === 'DELETE') {
      projects[0]!.status = 'deleted';
      return Response.json({ status: 'deleted' });
    }
    if (url.pathname === '/v1/admin/purge-deleted')
      return Response.json({
        dryRun: false,
        complete: true,
        rows: { sources: 1, projects: 1 },
        objects: 0
      });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  return { fetcher, requests, projects, accepted: () => accepted };
}

describe('sample data', () => {
  it('is 96 valid, varied page views that the real event validator accepts', () => {
    const batches = buildDemoBatches({ projectId: 'p1', publicKey: 'pub-key', now });
    expect(batches).toHaveLength(12);
    const events = batches.flatMap((batch) => batch.events);
    expect(events).toHaveLength(96);
    expect(new Set(events.map((event) => event.id)).size).toBe(96);
    for (const batch of batches) {
      expect(batch.events.length).toBeLessThanOrEqual(10); // the per-second quota
      expect(validateEventBatch(JSON.stringify(batch.events)).ok).toBe(true);
    }
    // Enough variety for every chart: devices, pages, referrers, several visitors.
    expect(new Set(batches.map((batch) => batch.userAgent)).size).toBe(6);
    const pages = events.map(
      (event) => (event.data as { page: { url_path: string } }).page.url_path
    );
    expect(new Set(pages).size).toBeGreaterThanOrEqual(5);
    expect(events.some((event) => 'referrer' in (event.data as object))).toBe(true);
    expect(
      new Set(
        events.map(
          (event) => (event.data as { visitor: { anonymous_id: string } }).visitor.anonymous_id
        )
      ).size
    ).toBeGreaterThan(20);
  });

  it('is stable for a given seed and fits the default daily quota', () => {
    const shape = (seed: number) =>
      buildDemoBatches({ projectId: 'p', publicKey: 'k', now, seed }).flatMap((batch) =>
        batch.events.map((event) => (event.data as { page: { url_path: string } }).page.url_path)
      );
    expect(shape(1)).toEqual(shape(1));
    expect(shape(1)).not.toEqual(shape(2));
    expect(96).toBeLessThanOrEqual(policy.maxEventsPerDay);
  });

  it("signs tokens the Worker's own verifier accepts, and rejects with any other secret", async () => {
    const token = signIngestToken(tokenSecret, claims);
    const verified = await createWorkerTokenVerifier(tokenSecret)(`Bearer ${token}`);
    expect(verified).toMatchObject({ ok: true });
    if (verified.ok)
      expect(verified.verified.claims).toMatchObject({
        project_id: 'p1',
        source_id: 's1',
        origin: DEMO_ORIGIN,
        scope: 'events:write',
        max_events: 25
      });
    expect(await createWorkerTokenVerifier(generateSecret())(`Bearer ${token}`)).toMatchObject({
      ok: false,
      reason: 'invalid_signature'
    });
  });
});

describe('adding sample data', () => {
  it('sends every batch through the real pipeline, paced under the per-second quota, and reports the result', async () => {
    const api = worker();
    const { ctx, output, slept } = fakeCtx({ cwd: '.', fetch: api.fetcher });
    const summary = await addDemoData(ctx, { workerUrl: WORKER_URL, adminSecret, tokenSecret });
    expect(summary).toMatchObject({ projectId: 'p1', sent: 96, pageViews: 96, uniqueUsers: 30 });
    expect(api.accepted()).toBe(96);
    expect(api.requests.filter((line) => line === 'POST /v1/events:batch')).toHaveLength(12);
    expect(slept()).toBeGreaterThanOrEqual(12);
    expect(output()).toContain('96 page views from 30 visitors');
  });

  it('waits for aggregation and gives up gracefully if it is slow', async () => {
    const slow = worker({ analyticsReadyAfter: 100 });
    const { ctx, output } = fakeCtx({ cwd: '.', fetch: slow.fetcher });
    const summary = await addDemoData(ctx, { workerUrl: WORKER_URL, adminSecret, tokenSecret });
    expect(summary.pageViews).toBe(0);
    expect(output()).toMatch(/still being aggregated/);
    const eventually = worker({ analyticsReadyAfter: 2 });
    expect(
      (
        await addDemoData(fakeCtx({ cwd: '.', fetch: eventually.fetcher }).ctx, {
          workerUrl: WORKER_URL,
          adminSecret,
          tokenSecret
        })
      ).pageViews
    ).toBe(96);
  });

  it('explains a wrong token secret instead of a bare 401', async () => {
    const api = worker({ tokenSecret: generateSecret() });
    const { ctx } = fakeCtx({ cwd: '.', fetch: api.fetcher });
    await expect(
      addDemoData(ctx, { workerUrl: WORKER_URL, adminSecret, tokenSecret })
    ).rejects.toThrow(/does not match VIZOALICA_TOKEN_SECRET/);
  });

  it("reports the Worker's reason for any other rejection and how to clean up", async () => {
    const base = worker();
    const rejecting = (async (input: string | URL | Request, init?: RequestInit) =>
      String(input).endsWith('/v1/events:batch')
        ? Response.json({ error: 'project_quota_exceeded' }, { status: 429 })
        : base.fetcher(input, init)) as typeof fetch;
    const { ctx } = fakeCtx({ cwd: '.', fetch: rejecting });
    await expect(
      addDemoData(ctx, { workerUrl: WORKER_URL, adminSecret, tokenSecret })
    ).rejects.toThrow(/project_quota_exceeded[\s\S]*demo --remove/);
  });

  it('does not create a second copy', async () => {
    const api = worker();
    await addDemoData(fakeCtx({ cwd: '.', fetch: api.fetcher }).ctx, {
      workerUrl: WORKER_URL,
      adminSecret,
      tokenSecret
    });
    await expect(
      addDemoData(fakeCtx({ cwd: '.', fetch: api.fetcher }).ctx, {
        workerUrl: WORKER_URL,
        adminSecret,
        tokenSecret
      })
    ).rejects.toThrow(/already exists/);
  });

  it('surfaces an admin API failure clearly', async () => {
    const failing = (async () => new Response('', { status: 500 })) as typeof fetch;
    await expect(
      addDemoData(fakeCtx({ cwd: '.', fetch: failing }).ctx, {
        workerUrl: WORKER_URL,
        adminSecret,
        tokenSecret
      })
    ).rejects.toThrow(/HTTP 500/);
  });
});

describe('removing sample data', () => {
  it('deletes the sample project and purges it, touching nothing else', async () => {
    const api = worker();
    await addDemoData(fakeCtx({ cwd: '.', fetch: api.fetcher }).ctx, {
      workerUrl: WORKER_URL,
      adminSecret,
      tokenSecret
    });
    const { ctx, output } = fakeCtx({ cwd: '.', fetch: api.fetcher });
    expect(await removeDemoData(ctx, { workerUrl: WORKER_URL, adminSecret })).toEqual({
      removed: 1
    });
    expect(api.projects[0]!.status).toBe('deleted');
    expect(api.requests).toContain('POST /v1/admin/purge-deleted');
    expect(output()).toMatch(/Sample data removed/);
  });

  it('says so when there is nothing to remove, without purging', async () => {
    const api = worker();
    const { ctx, output } = fakeCtx({ cwd: '.', fetch: api.fetcher });
    expect(await removeDemoData(ctx, { workerUrl: WORKER_URL, adminSecret })).toEqual({
      removed: 0
    });
    expect(api.requests).not.toContain('POST /v1/admin/purge-deleted');
    expect(output()).toMatch(/no sample data/);
  });
});
