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
  const server = createLocalServer({
    remoteUrl: 'https://worker.test',
    adminSecret: 'top-secret',
    port: 4318,
    consoleOrigin: 'http://127.0.0.1:5173',
    sessionTtlMs
  });
  const call = (
    path: string,
    options: {
      method?: string;
      cookie?: string;
      origin?: string;
      host?: string;
      body?: unknown;
      rawBody?: string;
    } = {}
  ) =>
    new Promise<{ status: number; body: Record<string, unknown>; cookie?: string }>((resolve) => {
      const body =
        options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
      const responseHeaders = new Map<string, string>();
      let status = 200;
      const request = {
        url: path,
        method: options.method ?? 'GET',
        headers: {
          host: options.host ?? '127.0.0.1:4318',
          origin: options.origin ?? 'http://127.0.0.1:5173',
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
        end(data?: string) {
          const text = data ?? '';
          const setCookie = responseHeaders.get('set-cookie')?.split(';')[0];
          resolve({
            status,
            body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
            ...(setCookie ? { cookie: setCookie } : {})
          });
        }
      };
      server.emit('request', request, response);
    });
  const session = async () => (await call('/api/session', { method: 'POST' })).cookie!;
  return { server, call, session, close: async () => undefined };
}
