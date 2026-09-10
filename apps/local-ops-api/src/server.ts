import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Config } from './config.js';
import { WorkerClient } from './remote-client/worker-client.js';
import { integrationSnippet } from './routes/snippet.js';
import { analytics, analyticsOverview } from './routes/analytics.js';
import {
  assertSafeIds,
  jsonInit,
  validateProjectBody,
  validateWebsiteBody,
  workerJson
} from './routes/websites.js';

const MAX_BODY_BYTES = 32_768;

async function requestJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_BODY_BYTES) throw new Error('request_too_large');
    chunks.push(buffer);
  }
  if (!chunks.length) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('invalid_request');
  }
}

function send(response: ServerResponse, status: number, body?: unknown, headers = {}) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    ...headers
  });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

function cookieValue(request: IncomingMessage, name: string): string | undefined {
  return request.headers.cookie
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([key]) => key === name)?.[1];
}

function recoveryFor(code: number) {
  return code === 503 ? 'retry_safely' : code === 401 ? 'reauthorize' : undefined;
}

function requestOrigin(request: IncomingMessage): string | undefined {
  if (request.headers.origin) return request.headers.origin;
  if (!request.headers.referer) return undefined;
  try {
    return new URL(request.headers.referer).origin;
  } catch {
    return undefined;
  }
}

export function createLocalServer(config: Config) {
  const client = new WorkerClient(config.remoteUrl, config.adminSecret);
  const sessions = new Map<string, number>();
  return createServer(async (request, response) => {
    const host = request.headers.host?.split(':')[0];
    if (host !== '127.0.0.1' && host !== 'localhost')
      return send(response, 403, { error: 'forbidden' });
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (!url.pathname.startsWith('/api/')) return send(response, 404, { error: 'not_found' });
    if (requestOrigin(request) !== config.consoleOrigin)
      return send(response, 403, { error: 'origin_not_allowed' });

    if (request.method === 'POST' && url.pathname === '/api/session') {
      const token = randomBytes(32).toString('base64url');
      sessions.set(token, Date.now() + config.sessionTtlMs);
      return send(response, 204, undefined, {
        'set-cookie': `vizoalica_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(config.sessionTtlMs / 1000)}`
      });
    }

    const session = cookieValue(request, 'vizoalica_session');
    if (!session || (sessions.get(session) ?? 0) <= Date.now()) {
      if (session) sessions.delete(session);
      return send(response, 401, { error: 'session_expired', recovery: 'reauthorize' });
    }

    try {
      if (request.method === 'GET' && url.pathname === '/api/projects') {
        return send(response, 200, await workerJson(client, '/v1/admin/projects'));
      }
      if (request.method === 'POST' && url.pathname === '/api/projects') {
        const body = validateProjectBody(await requestJson(request));
        return send(
          response,
          201,
          await workerJson(client, '/v1/admin/projects', jsonInit('POST', body))
        );
      }
      const collection = /^\/api\/projects\/([^/]+)\/websites$/.exec(url.pathname);
      if (collection) {
        assertSafeIds(collection[1]!);
        const remotePath = `/v1/admin/projects/${encodeURIComponent(collection[1]!)}/sources`;
        if (request.method === 'GET')
          return send(response, 200, await workerJson(client, remotePath));
        if (request.method === 'POST') {
          const body = validateWebsiteBody(await requestJson(request));
          return send(response, 201, await workerJson(client, remotePath, jsonInit('POST', body)));
        }
      }
      const overviewMatch = /^\/api\/projects\/([^/]+)\/analytics$/.exec(url.pathname);
      if (request.method === 'GET' && overviewMatch) {
        return send(
          response,
          200,
          await analyticsOverview(
            client,
            overviewMatch[1]!,
            url.searchParams.get('source_id') ?? undefined,
            url.searchParams.get('start') ?? '',
            url.searchParams.get('end') ?? ''
          )
        );
      }
      const analyticsMatch = /^\/api\/projects\/([^/]+)\/websites\/([^/]+)\/analytics$/.exec(
        url.pathname
      );
      if (request.method === 'GET' && analyticsMatch) {
        return send(
          response,
          200,
          await analytics(
            client,
            analyticsMatch[1]!,
            analyticsMatch[2]!,
            url.searchParams.get('window')
          )
        );
      }
      const item = /^\/api\/projects\/([^/]+)\/websites\/([^/]+)(?:\/(snippet|status))?$/.exec(
        url.pathname
      );
      if (item) {
        assertSafeIds(item[1]!, item[2]!);
        const remotePath = `/v1/admin/projects/${encodeURIComponent(item[1]!)}/sources/${encodeURIComponent(item[2]!)}${item[3] ? `/${item[3]}` : ''}`;
        if (request.method === 'GET' && item[3]) {
          const metadata = await workerJson(client, remotePath);
          return send(
            response,
            200,
            item[3] === 'snippet'
              ? integrationSnippet(metadata, config.remoteUrl, item[1]!, item[2]!)
              : metadata
          );
        }
        if (request.method === 'PATCH' && !item[3]) {
          const body = validateWebsiteBody(await requestJson(request), true);
          return send(response, 200, await workerJson(client, remotePath, jsonInit('PATCH', body)));
        }
        if (request.method === 'DELETE' && !item[3]) {
          const result = await workerJson(client, remotePath, jsonInit('DELETE'));
          return send(response, 200, { ...((result as object) ?? {}), audit: 'recorded' });
        }
      }
      return send(response, 404, { error: 'not_found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'remote_unavailable';
      const code =
        message === 'access_revoked' || message === 'unauthorized'
          ? 401
          : message === 'invalid_request' ||
              message === 'invalid_window' ||
              message === 'invalid_range'
            ? 400
            : message === 'request_too_large'
              ? 413
              : message === 'not_found'
                ? 404
                : 503;
      if (code === 401) {
        sessions.delete(session);
        response.setHeader(
          'set-cookie',
          'vizoalica_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
        );
      }
      return send(response, code, {
        error: code === 503 ? 'remote_unavailable' : code === 401 ? 'access_revoked' : message,
        recovery: recoveryFor(code)
      });
    }
  });
}
