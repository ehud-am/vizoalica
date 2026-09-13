const workerOrigin = process.argv[2];

if (!workerOrigin) throw new Error('Worker origin is required.');

const url = new URL(workerOrigin);
if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash)
  throw new Error('Worker origin must be an HTTPS origin with no path, query, or fragment.');

const response = await fetch(`${url.origin}/v1/admin/projects`, {
  headers: { authorization: 'Bearer onecli-managed' },
  signal: AbortSignal.timeout(10_000)
});

if (response.status !== 200)
  throw new Error(`Authenticated project check failed with HTTP ${response.status}.`);

const body: unknown = await response.json().catch(() => undefined);
if (!Array.isArray(body))
  throw new Error('Authenticated project check did not return a JSON array.');

process.stdout.write('Authenticated project check passed (HTTP 200, JSON array).\n');
