import { loadConfig } from '../config.js';
import type { PipelineDependencies } from '../ingestion/pipeline.js';
import type { AcceptedEventSink } from '../storage/accepted-event-sink.js';
import { JsonlGzipBatchSink } from '../storage/jsonl-gzip-batch.js';
import { InMemoryRepositories } from '../storage/memory.js';
import { ParquetChunkSink } from '../storage/parquet-chunk.js';
import { eventsBatchResponse } from './events.js';
import { healthResponse } from './health.js';

function defaultDependencies(): PipelineDependencies {
  const config = loadConfig();
  const dependencies: PipelineDependencies = {
    repositories: new InMemoryRepositories(),
    tokenSecret: process.env.VIZOALICA_TOKEN_SECRET ?? 'dev-secret',
    allowUnsignedDemo: config.demoMode
  };
  const acceptedEventSink = createAcceptedEventSink(config);
  if (acceptedEventSink) {
    dependencies.acceptedEventSink = acceptedEventSink;
    schedulePeriodicFlush(acceptedEventSink, config.storageFlushIntervalMs);
  }
  return dependencies;
}

function createAcceptedEventSink(
  config: ReturnType<typeof loadConfig>
): PipelineDependencies['acceptedEventSink'] {
  if (!config.storageRoot || config.storageFormat === 'memory') return undefined;
  if (config.storageFormat === 'jsonl-gzip') {
    return new JsonlGzipBatchSink({
      rootDir: config.storageRoot,
      maxEventsPerFile: config.storageMaxEventsPerFile
    });
  }
  return new ParquetChunkSink({
    rootDir: config.storageRoot,
    maxEventsPerFile: config.storageMaxEventsPerFile,
    maxBufferedEvents: config.storageMaxBufferedEvents
  });
}

function schedulePeriodicFlush(sink: AcceptedEventSink, intervalMs: number): void {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;
  const timer = setInterval(() => {
    sink.flush().catch((error: unknown) => {
      console.error('accepted event sink flush failed', error);
    });
  }, intervalMs);
  timer.unref?.();
}

export function createRequestHandler(
  dependencies: PipelineDependencies = defaultDependencies()
): (request: Request) => Promise<Response> | Response {
  return (request: Request) => {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/healthz') return healthResponse();
    if (request.method === 'POST' && url.pathname === '/v1/events:batch')
      return eventsBatchResponse(request, dependencies);
    return Response.json({ error: 'not_found' }, { status: 404 });
  };
}

export async function serveFetch(
  handler = createRequestHandler(),
  port = loadConfig().port
): Promise<void> {
  const { createServer } = await import('node:http');
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', async () => {
      const init: RequestInit = {
        method: req.method ?? 'GET',
        headers: req.headers as Record<string, string>
      };
      if (chunks.length > 0) init.body = Buffer.concat(chunks);
      const request = new Request(`http://localhost:${port}${req.url ?? '/'}`, init);
      const response = await handler(request);
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      res.writeHead(response.status, responseHeaders);
      res.end(Buffer.from(await response.arrayBuffer()));
    });
  });
  server.listen(port);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await serveFetch();
}
