import type { FetchLike } from './environments/vault.js';

/** Where `--verbose` output goes. It is never given a secret, a header, or a request body. */
export type Trace = (message: string) => void;

export const noTrace: Trace = () => undefined;

/** A trace that writes each line to `out`, marked and timed from the moment it was made. */
export function makeTrace(out: (text: string) => void, now: () => number = Date.now): Trace {
  const started = now();
  return (message) => {
    const lines = message.split('\n');
    for (const line of lines) out(`[verbose +${now() - started}ms] ${line}\n`);
  };
}

const describeTarget = (input: URL | string): string => {
  try {
    const url = new URL(String(input));
    return `${url.origin}${url.pathname}`;
  } catch {
    return String(input);
  }
};

/** Logs each request (method, address without its query, status, time) and nothing else about it. */
export function tracedFetch(inner: FetchLike, trace: Trace, via = ''): FetchLike {
  return async (input, init) => {
    const method = init?.method ?? 'GET';
    const target = describeTarget(input);
    const started = Date.now();
    try {
      const response = await inner(input, init);
      trace(`${method} ${target}${via} -> ${response.status} (${Date.now() - started}ms)`);
      return response;
    } catch (error) {
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
      trace(`${method} ${target}${via} failed after ${Date.now() - started}ms (${reason})`);
      throw error;
    }
  };
}
