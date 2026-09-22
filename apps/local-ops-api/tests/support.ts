import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import { createLocalServer } from '../src/server.js';

export async function startApi(
  remote: (url: URL, init?: RequestInit) => Response | Promise<Response>,
  sessionTtlMs = 30_000
) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: URL | RequestInfo, init?: RequestInit) => remote(new URL(String(input)), init))
  );
  // A configFilePath keeps preferences.json (and any other per-config file)
  // inside a throwaway temp dir instead of falling back to the real
  // operator's ~/.config/vizoalica directory during tests.
  const configFilePath = join(
    mkdtempSync(join(tmpdir(), 'vizoalica-api-')),
    'local-operations.json'
  );
  const server = createLocalServer({
    remoteUrl: 'https://worker.test',
    adminSecret: 'top-secret',
    port: 4318,
    consoleOrigin: 'http://127.0.0.1:5173',
    sessionTtlMs,
    configFilePath
  });
  return { server, ...callerFor(server), close: async () => undefined };
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
