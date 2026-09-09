import { pathToFileURL } from 'node:url';
import { Script } from 'node:vm';

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
  if (
    !sdk.ok ||
    !/^(application|text)\/javascript(?:;|$)/i.test(sdk.headers.get('content-type') ?? '')
  )
    throw new Error('SDK must return JavaScript, not an HTML fallback');
  const source = await boundedText(sdk, 1024 * 1024);
  if (!source.includes('vizoalica')) throw new Error('SDK body is not the Vizoalica bundle');
  try {
    new Script(source);
  } catch {
    throw new Error('SDK body is not executable JavaScript');
  }
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

export async function verifyWebsite(input = process.argv.slice(2)) {
  const args = input.filter((arg) => arg !== '--');
  const [origin, projectId, sourceId] = args;
  if (args.length !== 3 || !origin || !projectId || !sourceId)
    throw new Error('Usage: pnpm website:verify -- <website-origin> <project-id> <source-id>');
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin)
    throw new Error('Website must be an exact HTTPS origin without a trailing slash');
  const init = { redirect: 'error' as const, signal: AbortSignal.timeout(15_000) };
  const sdk = await fetch(new URL('/vizoalica.js', origin), init);
  const token = await fetch(new URL('/vizoalica/ingest-token', origin), {
    ...init,
    headers: { referer: `${origin}/` }
  });
  await verifyWebsiteResponses(sdk, token, { origin, projectId, sourceId });
  console.log(
    'Website content and token claims passed. Next: confirm a browser event returns 202 and appears in the console.'
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyWebsite().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Website verification failed');
    process.exitCode = 1;
  });
}
