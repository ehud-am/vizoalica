import { spawn } from 'node:child_process';
import { redact } from './redaction.js';
import type { ProcessExecutor, ProcessRequest, ProcessResult } from './types.js';

const OUTPUT_LIMIT = 64 * 1024;
const CLOUDFLARE_AUTH_KEYS = new Set([
  'CF_API_TOKEN',
  'CLOUDFLARE_API_TOKEN',
  'CF_API_KEY',
  'CLOUDFLARE_API_KEY',
  'CF_API_EMAIL',
  'CLOUDFLARE_EMAIL',
  'CLOUDFLARE_API_BASE_URL',
  'CLOUDFLARE_API_ENVIRONMENT',
  'WRANGLER_AUTH_CONFIG',
  'CLOUDFLARE_ACCOUNT_ID',
  'CF_ACCOUNT_ID'
]);

export function sanitizedCloudflareEnvironment(
  source: NodeJS.ProcessEnv,
  accountId: string
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (!CLOUDFLARE_AUTH_KEYS.has(key.toUpperCase())) result[key] = value;
  }
  result.CLOUDFLARE_ACCOUNT_ID = accountId;
  return result;
}

function appendBounded(current: string, chunk: Buffer): string {
  if (Buffer.byteLength(current) >= OUTPUT_LIMIT) return current;
  return `${current}${chunk.toString('utf8')}`.slice(0, OUTPUT_LIMIT);
}

export const executeProcess: ProcessExecutor = async (
  request: ProcessRequest
): Promise<ProcessResult> =>
  new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let interrupted = false;
    let settled = false;
    const child = spawn(request.executable, [...request.args], {
      cwd: request.cwd,
      env: request.env,
      shell: false,
      stdio: [request.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe']
    });
    if (request.stdin !== undefined) child.stdin!.end(request.stdin);
    child.stdout!.on('data', (chunk: Buffer) => (stdout = appendBounded(stdout, chunk)));
    child.stderr!.on('data', (chunk: Buffer) => (stderr = appendBounded(stderr, chunk)));
    const finish = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.signal?.removeEventListener('abort', abort);
      resolve({ exitCode, stdout: redact(stdout), stderr: redact(stderr), interrupted });
    };
    const abort = (): void => {
      interrupted = true;
      child.kill('SIGTERM');
    };
    request.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, request.timeoutMs ?? 30_000);
    child.once('error', (error) => {
      stderr = error.message;
      finish(127);
    });
    child.once('close', (code, signal) => finish(code ?? (signal ? 130 : 1)));
  });
