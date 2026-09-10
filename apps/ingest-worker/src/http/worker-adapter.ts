import { eventsBatchResponseForBody } from '../../../ingest-api/src/http/events.js';
import { healthResponse } from '../../../ingest-api/src/http/health.js';
import type { PipelineDependencies } from '../../../ingest-api/src/ingestion/pipeline.js';
import type { AdminRepository } from '../../../ingest-api/src/storage/repositories.js';
import { handleAdminRequest } from './admin-adapter.js';
import { handleMcpRequest } from './mcp-adapter.js';
import { classifyRequest } from '../analytics/classifier.js';

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
  headers.set('vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}

export async function handleWorkerRequest(
  request: Request,
  dependencies: PipelineDependencies & {
    adminSecret?: string;
    adminRepositories?: AdminRepository;
  },
  maxRequestBytes: number
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/healthz') return healthResponse();
  if (dependencies.adminSecret && dependencies.adminRepositories) {
    const mcpResponse = await handleMcpRequest(request, {
      adminSecret: dependencies.adminSecret,
      repositories: dependencies.adminRepositories
    });
    if (mcpResponse) return mcpResponse;
    const adminResponse = await handleAdminRequest(request, {
      adminSecret: dependencies.adminSecret,
      repositories: dependencies.adminRepositories
    });
    if (adminResponse) return adminResponse;
  }
  // The actual POST still authorizes the origin against the configured source.
  if (request.method === 'OPTIONS' && url.pathname === '/v1/events:batch')
    return withCors(request, new Response(null, { status: 204 }));
  if (request.method !== 'POST' || url.pathname !== '/v1/events:batch')
    return withCors(request, Response.json({ error: 'not_found' }, { status: 404 }));
  const body = await readBoundedBody(request, maxRequestBytes);
  if (body === undefined)
    return withCors(request, Response.json({ error: 'request_too_large' }, { status: 413 }));
  return withCors(
    request,
    await eventsBatchResponseForBody(request, body, dependencies, classifyRequest(request))
  );
}
