import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname } from 'node:path';
import type { Config, Settings } from './config.js';
import { resolvePreferencesPath } from './config.js';
import { EnvironmentStore } from './environment-store.js';
import { isStaticRequest, serveStatic, type StaticDirs } from './static.js';
import { readPreferences, writePreferences } from './preferences.js';
import { WorkerClient } from './remote-client/worker-client.js';
import { integrationSnippet } from './routes/snippet.js';
import { checkReachability } from './routes/reachability.js';
import { handleSetup } from './routes/setup.js';
import { handleEnvironments } from './routes/environments.js';
import { backendState, expectedSchemaFrom } from './setup/state.js';
import {
  issueAccessKey,
  listAccessKeys,
  revokeAccessKey,
  shareWebsite,
  validateIssueBody
} from './routes/access-keys.js';
import { analytics, analyticsActions, analyticsOverview } from './routes/analytics.js';
import { AnalyticsRangeError } from '../../ingest-api/src/analytics/range.js';
import { validOrigins } from './contracts.js';
import {
  assertSafeIds,
  jsonInit,
  validateProjectBody,
  validateWebsiteBody,
  workerJson
} from './routes/websites.js';

const MAX_BODY_BYTES = 32_768;
// One console needs one session; the cap only stops an unbounded pile if something keeps asking.
const MAX_SESSIONS = 32;

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

export type ServerOptions = StaticDirs & {
  settings: Settings;
  /** The backend connection; it may be empty, and the console then guides first run. */
  store: EnvironmentStore;
  /** The installed package version, shown by the console and compared with the backend's. */
  version?: string;
  /** Where the packaged database changes live; the highest number is the expected schema. */
  schemaDir?: string | undefined;
};

/** Older callers pass one fixed connection; that is the same thing with a store that never changes. */
function optionsFromConfig(config: Config): ServerOptions {
  return {
    settings: {
      port: config.port,
      consoleOrigin: config.consoleOrigin,
      allowedOrigins: [...new Set([config.consoleOrigin, `http://127.0.0.1:${config.port}`])],
      sessionTtlMs: config.sessionTtlMs,
      ...(config.configFilePath ? { homeDir: dirname(config.configFilePath) } : {})
    },
    store: EnvironmentStore.fromConnection('default', {
      remoteUrl: config.remoteUrl,
      credential: config.adminSecret,
      kind: 'admin-secret'
    })
  };
}

function sendStatic(
  request: IncomingMessage,
  response: ServerResponse,
  dirs: StaticDirs,
  path: string
) {
  const result = serveStatic(request.method ?? 'GET', path, dirs);
  response.writeHead(result.status, result.headers);
  response.end(result.body);
}

export function createLocalServer(input: Config | ServerOptions) {
  const options = 'settings' in input ? input : optionsFromConfig(input);
  const { settings, store } = options;
  const staticDirs: StaticDirs = { consoleDir: options.consoleDir, sdkDir: options.sdkDir };
  let cached: { revision: number; client: WorkerClient } | undefined;
  /** The client for the current connection; rebuilt when the connection changes, absent before first run. */
  const currentClient = (): WorkerClient => {
    const connection = store.current();
    if (!connection) throw new Error('backend_not_connected');
    if (!cached || cached.revision !== store.revision)
      cached = {
        revision: store.revision,
        client: new WorkerClient(connection.remoteUrl, connection.credential)
      };
    return cached.client;
  };
  const version = options.version ?? 'dev';
  const expectedSchema = expectedSchemaFrom(options.schemaDir);
  const sessions = new Map<string, number>();
  const preferencesPath = resolvePreferencesPath(settings);
  return createServer(async (request, response) => {
    const host = request.headers.host?.split(':')[0];
    if (host !== '127.0.0.1' && host !== 'localhost')
      return send(response, 403, { error: 'forbidden' });
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (isStaticRequest(url.pathname))
      return sendStatic(request, response, staticDirs, (request.url ?? '/').split(/[?#]/)[0]!);
    if (!settings.allowedOrigins.includes(requestOrigin(request) ?? ''))
      return send(response, 403, { error: 'origin_not_allowed' });

    if (request.method === 'POST' && url.pathname === '/api/session') {
      const now = Date.now();
      for (const [key, expiresAt] of sessions) if (expiresAt <= now) sessions.delete(key);
      // Map keeps insertion order, so the oldest session is dropped first.
      while (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value!);
      const token = randomBytes(32).toString('base64url');
      sessions.set(token, now + settings.sessionTtlMs);
      return send(response, 204, undefined, {
        'set-cookie': `vizoalica_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(settings.sessionTtlMs / 1000)}`
      });
    }

    const session = cookieValue(request, 'vizoalica_session');
    if (!session || (sessions.get(session) ?? 0) <= Date.now()) {
      if (session) sessions.delete(session);
      return send(response, 401, { error: 'session_expired', recovery: 'reauthorize' });
    }

    try {
      if (url.pathname.startsWith('/api/setup/')) {
        const reply = await handleSetup(
          request.method ?? 'GET',
          url.pathname,
          () => requestJson(request),
          { store, version, expectedSchema }
        );
        return reply
          ? send(response, reply.status, reply.body)
          : send(response, 404, { error: 'not_found' });
      }
      if (url.pathname === '/api/environments' || url.pathname.startsWith('/api/environments/')) {
        const reply = await handleEnvironments(
          request.method ?? 'GET',
          url.pathname,
          () => requestJson(request),
          { store, version, expectedSchema }
        );
        return reply
          ? send(response, reply.status, reply.body)
          : send(response, 404, { error: 'not_found' });
      }
      if (url.pathname === '/api/preferences/theme') {
        if (request.method === 'GET') {
          let record;
          try {
            record = readPreferences(preferencesPath);
          } catch {
            // A corrupt or invalid preferences file must not block the console;
            // treat it the same as no explicit preference (follow the system).
            record = undefined;
          }
          return send(response, 200, {
            theme: record?.theme ?? null,
            ...(record?.updatedAt !== undefined ? { updatedAt: record.updatedAt } : {})
          });
        }
        if (request.method === 'PUT') {
          const body = (await requestJson(request)) as { theme?: unknown } | undefined;
          if (body?.theme !== 'light' && body?.theme !== 'dark')
            return send(response, 400, {
              error: 'invalid_request',
              field: 'theme',
              message: 'theme must be "light" or "dark".'
            });
          const theme: 'light' | 'dark' = body.theme;
          const saved = { theme, updatedAt: new Date().toISOString() };
          try {
            writePreferences(preferencesPath, saved);
          } catch {
            return send(response, 503, {
              error: 'preferences_unavailable',
              recovery: recoveryFor(503)
            });
          }
          return send(response, 200, saved);
        }
      }
      const client = currentClient();
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
      const projectItem = /^\/api\/projects\/([^/]+)$/.exec(url.pathname);
      if (projectItem && request.method === 'DELETE') {
        assertSafeIds(projectItem[1]!);
        const result = await workerJson(
          client,
          `/v1/admin/projects/${encodeURIComponent(projectItem[1]!)}`,
          jsonInit('DELETE')
        );
        return send(response, 200, { ...((result as object) ?? {}), audit: 'recorded' });
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
      const actionsMatch = /^\/api\/projects\/([^/]+)\/analytics\/actions$/.exec(url.pathname);
      if (request.method === 'GET' && actionsMatch) {
        return send(
          response,
          200,
          await analyticsActions(
            client,
            actionsMatch[1]!,
            url.searchParams.get('source_id') ?? undefined,
            url.searchParams.get('start') ?? '',
            url.searchParams.get('end') ?? '',
            {
              ...(url.searchParams.get('page') ? { page: url.searchParams.get('page')! } : {}),
              ...(url.searchParams.get('action') ? { action: url.searchParams.get('action')! } : {})
            }
          )
        );
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
      const item =
        /^\/api\/projects\/([^/]+)\/websites\/([^/]+)(?:\/(snippet|status|reachability|share))?$/.exec(
          url.pathname
        );
      if (item) {
        assertSafeIds(item[1]!, item[2]!);
        const basePath = `/v1/admin/projects/${encodeURIComponent(item[1]!)}/sources/${encodeURIComponent(item[2]!)}`;
        const remotePath = `${basePath}${item[3] && item[3] !== 'reachability' && item[3] !== 'share' ? `/${item[3]}` : ''}`;
        if (request.method === 'GET' && item[3] === 'reachability') {
          const metadata = (await workerJson(client, basePath)) as { allowedOrigins?: unknown };
          if (!validOrigins(metadata.allowedOrigins)) throw new Error('remote_unavailable');
          return send(response, 200, await checkReachability(metadata.allowedOrigins[0]!));
        }
        if (request.method === 'POST' && item[3] === 'share') {
          const body = (await requestJson(request)) as { role?: unknown } | undefined;
          const role = body?.role === 'analyst' ? 'analyst' : 'owner';
          const details = await shareWebsite(
            client,
            store.current()!.remoteUrl,
            item[1]!,
            item[2]!,
            role
          );
          return send(response, 200, details);
        }
        if (request.method === 'GET' && item[3]) {
          const metadata = await workerJson(client, remotePath);
          return send(
            response,
            200,
            item[3] === 'snippet'
              ? integrationSnippet(metadata, store.current()!.remoteUrl, item[1]!, item[2]!)
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
      if (url.pathname === '/api/access-keys') {
        if (request.method === 'GET') return send(response, 200, await listAccessKeys(client));
        if (request.method === 'POST') {
          const body = validateIssueBody(await requestJson(request));
          return send(response, 201, await issueAccessKey(client, body));
        }
      }
      const keyItem = /^\/api\/access-keys\/([^/]+)$/.exec(url.pathname);
      if (keyItem && request.method === 'DELETE') {
        return send(response, 200, await revokeAccessKey(client, keyItem[1]!));
      }
      if (request.method === 'GET' && url.pathname === '/api/backend') {
        return send(response, 200, await backendState({ store, version, expectedSchema }));
      }
      return send(response, 404, { error: 'not_found' });
    } catch (error) {
      if (error instanceof AnalyticsRangeError) {
        return send(response, 400, {
          error: error.code,
          field: error.field,
          message: error.message,
          recovery: recoveryFor(400)
        });
      }
      const message = error instanceof Error ? error.message : 'remote_unavailable';
      const code =
        message === 'access_revoked' || message === 'unauthorized'
          ? 401
          : message === 'invalid_request' || message === 'invalid_window'
            ? 400
            : message === 'request_too_large'
              ? 413
              : message === 'not_found'
                ? 404
                : message === 'backend_not_connected'
                  ? 409
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
        recovery: message === 'backend_not_connected' ? 'connect_backend' : recoveryFor(code)
      });
    }
  });
}
