import { loadConfig } from '../config.js';
import { healthResponse } from './health.js';

export function createRequestHandler(): (request: Request) => Promise<Response> | Response {
  return (request: Request) => {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/healthz') return healthResponse();
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
