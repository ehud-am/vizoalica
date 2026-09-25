import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import type { EnvironmentDef, Role } from '../src/environments/file.js';
import type { EnvironmentState } from '../src/environments/verify.js';
import type { createLocalServer } from '../src/server.js';
import { Registry } from '../src/environments/registry.js';
import { Vault } from '../src/environments/vault.js';
import { createService } from '../src/service.js';

export const WORKER_URL = 'https://worker.test';

/**
 * A local service with one usable environment ("prod", talking to a stubbed Worker), so the routes that
 * need a backend can be exercised end to end. `options.environments` replaces that environment list.
 */
export async function startApi(
  remote: (url: URL, init?: RequestInit) => Response | Promise<Response>,
  sessionTtlMs = 30_000,
  options: {
    role?: Role;
    environments?: Record<string, EnvironmentDef>;
    version?: string;
    /** Runs the real check of each environment against the stubbed Worker; by default it is trusted. */
    verified?: boolean;
  } = {}
) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: URL | RequestInfo, init?: RequestInit) => remote(new URL(String(input)), init))
  );
  // A throwaway home keeps preferences.json out of the real operator's ~/.config/vizoalica.
  const homeDir = mkdtempSync(join(tmpdir(), 'vizoalica-api-'));
  const environments = options.environments ?? {
    prod: { url: WORKER_URL, role: options.role ?? 'admin', secret: 'top-secret' }
  };
  const service = createService({
    homeDir,
    sessionTtlMs,
    ...(options.version ? { version: options.version } : {}),
    registry: {
      ...(options.verified
        ? {}
        : {
            verify: async (name: string, def: EnvironmentDef): Promise<EnvironmentState> => ({
              name,
              url: def.url,
              role: def.role,
              cloudflare: 'none',
              usable: true,
              problems: []
            })
          }),
      load: () => ({
        status: 'ok',
        path: join(homeDir, 'environments.json'),
        entries: Object.entries(environments).map(([name, def]) => ({ name, def }))
      })
    }
  });
  await service.registry.refresh();
  return {
    server: service.server,
    registry: service.registry,
    homeDir,
    ...callerFor(service.server),
    close: async () => undefined
  };
}

/** Drives a server with hand-made request and response objects, so no port is opened. */
export function callerFor(server: ReturnType<typeof createLocalServer>) {
  const call = (
    path: string,
    options: {
      method?: string;
      cookie?: string;
      origin?: string | null;
      referer?: string;
      host?: string;
      body?: unknown;
      rawBody?: string;
    } = {}
  ) =>
    new Promise<{
      status: number;
      body: Record<string, unknown>;
      text: string;
      cookie?: string;
      headers: Record<string, string>;
    }>((resolve) => {
      const body =
        options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
      const responseHeaders = new Map<string, string>();
      let status = 200;
      const request = {
        url: path,
        method: options.method ?? 'GET',
        headers: {
          host: options.host ?? '127.0.0.1:4318',
          ...(options.origin === null ? {} : { origin: options.origin ?? 'http://127.0.0.1:5173' }),
          ...(options.referer ? { referer: options.referer } : {}),
          ...(options.cookie ? { cookie: options.cookie } : {})
        },
        async *[Symbol.asyncIterator]() {
          if (body) yield Buffer.from(body);
        }
      };
      const response = {
        setHeader(name: string, value: string) {
          responseHeaders.set(name.toLowerCase(), value);
        },
        writeHead(nextStatus: number, nextHeaders: Record<string, string> = {}) {
          status = nextStatus;
          for (const [name, value] of Object.entries(nextHeaders))
            responseHeaders.set(name.toLowerCase(), value);
          return this;
        },
        end(data?: string | Buffer) {
          const text = data === undefined ? '' : data.toString();
          const setCookie = responseHeaders.get('set-cookie')?.split(';')[0];
          const json = (responseHeaders.get('content-type') ?? '').includes('json');
          resolve({
            status,
            text,
            body: text && json ? (JSON.parse(text) as Record<string, unknown>) : {},
            headers: Object.fromEntries(responseHeaders),
            ...(setCookie ? { cookie: setCookie } : {})
          });
        }
      };
      server.emit('request', request, response);
    });
  const session = async () => (await call('/api/session', { method: 'POST' })).cookie!;
  return { call, session };
}

/** A registry whose one environment ("default") is trusted and selected, for tests below the server. */
export async function connectedRegistry(
  def: Partial<EnvironmentDef> & { role?: Role } = {},
  options: { version?: string } = {}
): Promise<Registry> {
  const registry = new Registry({
    version: options.version ?? '0.6.3',
    expectedSchema: 1,
    vault: new Vault(vi.fn() as never),
    load: () => ({
      status: 'ok',
      path: '',
      entries: [
        {
          name: 'default',
          def: {
            url: 'https://worker.example.workers.dev',
            role: 'admin',
            secret: 'the-credential',
            ...def
          }
        }
      ]
    }),
    verify: async (name, environment) => ({
      name,
      url: environment.url,
      role: environment.role,
      cloudflare: 'none',
      usable: true,
      problems: []
    })
  });
  await registry.refresh();
  return registry;
}
