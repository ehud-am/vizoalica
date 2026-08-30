import { eventsBatchResponseForBody } from '../../../ingest-api/src/http/events.js';
import { healthResponse } from '../../../ingest-api/src/http/health.js';
import type { PipelineDependencies } from '../../../ingest-api/src/ingestion/pipeline.js';

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

export async function handleWorkerRequest(
  request: Request,
  dependencies: PipelineDependencies,
  maxRequestBytes: number
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/healthz') return healthResponse();
  if (request.method !== 'POST' || url.pathname !== '/v1/events:batch')
    return Response.json({ error: 'not_found' }, { status: 404 });
  const body = await readBoundedBody(request, maxRequestBytes);
  if (body === undefined) return Response.json({ error: 'request_too_large' }, { status: 413 });
  return eventsBatchResponseForBody(request, body, dependencies);
}
