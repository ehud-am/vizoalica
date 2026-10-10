import { eventsBatchResponseForBody } from '../../../ingest-api/src/http/events.js';
import { healthResponse } from '../../../ingest-api/src/http/health.js';
import type { PipelineDependencies } from '../../../ingest-api/src/ingestion/pipeline.js';
import type { AdminRepository } from '../../../ingest-api/src/storage/repositories.js';
import { handleAdminRequest, type BackendInfo } from './admin-adapter.js';
import type { PurgeSummary } from '../storage/purge-deleted.js';
import { classifyRequest } from '../analytics/classifier.js';
import type { RateLimiter } from '../env.js';
import { dailyVisitorId, type DailySaltStore } from '../analytics/daily-visitor.js';
import { BROWSER_SDK } from '../generated/browser-sdk.js';

/**
 * The browser SDK this Worker was deployed with, so a static website needs only a script tag. It
 * is public code with no settings in it; the tag's data attributes carry the website's key.
 */
function sdkResponse(): Response {
  return new Response(BROWSER_SDK, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff'
    }
  });
}

async function readBoundedBody(request: Request, maxBytes: number): Promise<string | undefined> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return undefined;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function withCors(request: Request, response: Response): Response {
  const origin = request.headers.get('origin');
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'POST, OPTIONS');
  headers.set('access-control-allow-headers', 'authorization, content-type, x-vizoalica-source');
  // Every event batch carries an Authorization header, so each one would otherwise be preceded by
  // a preflight (a second Worker invocation). Browsers cap this at their own maximum.
  headers.set('access-control-max-age', '86400');
  headers.set('vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}

// Throttles per client address before any body read or D1 access. The key deliberately excludes
// the caller-supplied source header: varying it would otherwise mint a fresh bucket per request.
// Fails open: a limiter outage must not drop legitimate analytics, and per-source quotas still
// apply.
async function withinRateLimit(request: Request, limiter: RateLimiter): Promise<boolean> {
  const client = request.headers.get('cf-connecting-ip') ?? 'unknown';
  try {
    return (await limiter.limit({ key: client })).success;
  } catch {
    return true;
  }
}

export async function handleWorkerRequest(
  request: Request,
  dependencies: PipelineDependencies & {
    adminSecret?: string;
    adminRepositories?: AdminRepository;
    purgeDeleted?: (dryRun: boolean) => Promise<PurgeSummary>;
    backendInfo?: () => Promise<BackendInfo>;
    rateLimiter?: RateLimiter;
    visitorSalts?: DailySaltStore;
  },
  maxRequestBytes: number
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/healthz') return healthResponse();
  if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/vizoalica.js')
    return sdkResponse();
  if (dependencies.adminSecret && dependencies.adminRepositories) {
    const adminResponse = await handleAdminRequest(request, {
      adminSecret: dependencies.adminSecret,
      repositories: dependencies.adminRepositories,
      ...(dependencies.purgeDeleted ? { purgeDeleted: dependencies.purgeDeleted } : {}),
      ...(dependencies.backendInfo ? { backendInfo: dependencies.backendInfo } : {})
    });
    if (adminResponse) return adminResponse;
  }
  // The actual POST still authorizes the origin against the configured source.
  if (request.method === 'OPTIONS' && url.pathname === '/v1/events:batch')
    return withCors(request, new Response(null, { status: 204 }));
  if (request.method !== 'POST' || url.pathname !== '/v1/events:batch')
    return withCors(request, Response.json({ error: 'not_found' }, { status: 404 }));
  if (dependencies.rateLimiter && !(await withinRateLimit(request, dependencies.rateLimiter)))
    return withCors(
      request,
      Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': '60' } })
    );
  const body = await readBoundedBody(request, maxRequestBytes);
  if (body === undefined)
    return withCors(request, Response.json({ error: 'request_too_large' }, { status: 413 }));
  const context = classifyRequest(request);
  const daily = dependencies.visitorSalts
    ? await dailyVisitorId(request, dependencies.visitorSalts)
    : undefined;
  if (daily) context.dailyVisitorId = daily;
  return withCors(request, await eventsBatchResponseForBody(request, body, dependencies, context));
}
