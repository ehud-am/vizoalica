import { pathToFileURL } from 'node:url';
import { Script } from 'node:vm';
import { validateDynamicConfig } from '../packages/browser-sdk/src/dynamic-config.js';

type Expected = { origin: string; projectId: string; sourceId: string };
async function boundedText(response: Response, limit: number): Promise<string> {
  if (!response.body) throw new Error('Empty response body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error('Response exceeds expected size');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function verifyWebsiteResponses(
  sdk: Response,
  token: Response,
  expected: Expected
): Promise<void> {
  await verifyJavaScript(sdk, 'SDK');
  await verifyToken(token, expected);
}

async function verifyJavaScript(response: Response, label: string): Promise<string> {
  if (
    !response.ok ||
    !/^(application|text)\/javascript(?:;|$)/i.test(response.headers.get('content-type') ?? '')
  )
    throw new Error(`${label} must return JavaScript, not an HTML fallback`);
  const source = await boundedText(response, 1024 * 1024);
  if (!source.includes('vizoalica')) throw new Error('SDK body is not the Vizoalica bundle');
  try {
    new Script(source);
  } catch {
    throw new Error('SDK body is not executable JavaScript');
  }
  return source;
}

async function verifyToken(token: Response, expected: Expected): Promise<void> {
  if (!token.ok || !/^text\/plain(?:;|$)/i.test(token.headers.get('content-type') ?? ''))
    throw new Error('Token endpoint must return text/plain');
  if (!token.headers.get('cache-control')?.includes('no-store'))
    throw new Error('Token endpoint must return Cache-Control: no-store');
  const compact = (await boundedText(token, 16_384)).trim();
  if (!/^[\w-]+\.[\w-]+\.[\w-]{43}$/.test(compact))
    throw new Error('Token body must be a three-part HS256 JWT');
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    const parts = compact.split('.');
    header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString());
    claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
    if (!header || !claims) throw new Error();
  } catch {
    throw new Error('Token JWT contains invalid JSON');
  }
  const now = Math.floor(Date.now() / 1000);
  if (
    header.alg !== 'HS256' ||
    header.typ !== 'JWT' ||
    claims.aud !== 'vizoalica-ingest' ||
    claims.scope !== 'events:write' ||
    claims.project_id !== expected.projectId ||
    claims.source_id !== expected.sourceId ||
    claims.origin !== expected.origin ||
    !Number.isInteger(claims.iat) ||
    !Number.isInteger(claims.nbf) ||
    !Number.isInteger(claims.exp) ||
    (claims.exp as number) - (claims.iat as number) !== 300 ||
    claims.nbf !== claims.iat ||
    (claims.iat as number) > now + 30 ||
    (claims.exp as number) <= now ||
    typeof claims.jti !== 'string' ||
    !claims.jti ||
    typeof claims.iss !== 'string' ||
    typeof claims.sub !== 'string' ||
    claims.max_events !== 25
  )
    throw new Error(
      'Token claims do not match the expected project, source, origin or five-minute lifetime'
    );
}

export async function verifyDynamicWebsiteResponses(
  loader: Response,
  configResponse: Response,
  token: Response,
  expected: Expected
): Promise<void> {
  const loaderSource = await verifyJavaScript(loader, 'Loader');
  if (!loaderSource.includes('/vizoalica/config.json'))
    throw new Error('Loader does not request the Vizoalica configuration route');
  if (
    !configResponse.ok ||
    !/^application\/json(?:;|$)/i.test(configResponse.headers.get('content-type') ?? '')
  )
    throw new Error('Dynamic configuration must return application/json');
  if (!configResponse.headers.get('cache-control')?.includes('no-store'))
    throw new Error('Dynamic configuration must return Cache-Control: no-store');
  if (configResponse.headers.get('x-content-type-options') !== 'nosniff')
    throw new Error('Dynamic configuration must prevent content-type sniffing');
  const raw = JSON.parse(await boundedText(configResponse, 16_384)) as unknown;
  const config = validateDynamicConfig(raw, `${expected.origin}/`);
  if (!config || config['data-project'] !== expected.projectId)
    throw new Error('Dynamic configuration does not match the expected project and website origin');
  await verifyToken(token, expected);
}

export async function verifyWebsite(input = process.argv.slice(2)) {
  const modeIndex = input.indexOf('--mode');
  const mode = modeIndex >= 0 ? input[modeIndex + 1] : 'static';
  const args = input.filter(
    (arg, index) =>
      arg !== '--' && (modeIndex < 0 || (index !== modeIndex && index !== modeIndex + 1))
  );
  const [origin, projectId, sourceId] = args;
  if (
    args.length !== 3 ||
    !origin ||
    !projectId ||
    !sourceId ||
    (mode !== 'static' && mode !== 'dynamic')
  )
    throw new Error(
      'Usage: pnpm website:verify -- <website-origin> <project-id> <source-id> [--mode static|dynamic]'
    );
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin)
    throw new Error('Website must be an exact HTTPS origin without a trailing slash');
  const init = { redirect: 'error' as const, signal: AbortSignal.timeout(15_000) };
  const script = await fetch(
    new URL(mode === 'dynamic' ? '/vizoalica-loader.js' : '/vizoalica.js', origin),
    init
  );
  const token = await fetch(new URL('/vizoalica/ingest-token', origin), {
    ...init,
    headers: { referer: `${origin}/` }
  });
  if (mode === 'dynamic') {
    const config = await fetch(new URL('/vizoalica/config.json', origin), init);
    await verifyDynamicWebsiteResponses(script, config, token, { origin, projectId, sourceId });
  } else await verifyWebsiteResponses(script, token, { origin, projectId, sourceId });
  console.log(
    `${mode === 'dynamic' ? 'Dynamic loader, configuration,' : 'Static SDK content'} and token claims passed. Next: confirm a browser event returns 202 and appears in the console.`
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyWebsite().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Website verification failed');
    process.exitCode = 1;
  });
}
