import type { AdminRepository } from '../../../ingest-api/src/storage/repositories.js';
import type { Project, QuotaPolicy, Source } from '../../../ingest-api/src/domain/types.js';
import { hasValidAdminAuthorization } from '../auth/admin-verifier.js';
import { parseAnalyticsRange } from '../../../ingest-api/src/analytics/range.js';

type Dependencies = { repositories: AdminRepository; adminSecret: string };

const safePolicy = (id: string): QuotaPolicy => ({
  id,
  maxRequestBytes: 131072,
  maxEventsPerBatch: 25,
  maxEventsPerToken: 25,
  maxEventsPerSecond: 10,
  maxEventsPerDay: 100,
  maxPropertyCount: 20,
  maxPropertyValueLength: 256,
  retentionDays: 7
});
const unauthorized = () => Response.json({ error: 'unauthorized' }, { status: 401 });
const invalid = () => Response.json({ error: 'invalid_request' }, { status: 400 });

function origins(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) return undefined;
  const normalized = value.map((origin) => {
    if (typeof origin !== 'string') return undefined;
    try {
      const url = new URL(origin);
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === origin
        ? url.origin
        : undefined;
    } catch {
      return undefined;
    }
  });
  return normalized.every(Boolean) && new Set(normalized).size === normalized.length
    ? (normalized as string[])
    : undefined;
}

export async function handleAdminRequest(
  request: Request,
  dependencies: Dependencies
): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/admin/')) return undefined;
  if (!hasValidAdminAuthorization(request.headers.get('authorization'), dependencies.adminSecret)) {
    await dependencies.repositories.saveAdminAudit({
      operation: 'admin',
      outcome: 'denied',
      reasonCode: 'unauthorized'
    });
    return unauthorized();
  }
  if (request.method === 'GET' && url.pathname === '/v1/admin/projects')
    return Response.json(await dependencies.repositories.listProjects());
  if (request.method === 'POST' && url.pathname === '/v1/admin/projects') {
    const body = (await request.json().catch(() => undefined)) as { name?: unknown } | undefined;
    if (
      !body ||
      typeof body.name !== 'string' ||
      body.name.trim().length < 1 ||
      body.name.length > 120
    )
      return invalid();
    const policy = safePolicy(crypto.randomUUID());
    const project: Project = {
      id: crypto.randomUUID(),
      name: body.name.trim(),
      mode: 'production',
      defaultRetentionDays: policy.retentionDays,
      quotaPolicyId: policy.id
    };
    await dependencies.repositories.createQuotaPolicy(policy);
    await dependencies.repositories.createProject(project);
    await dependencies.repositories.saveAdminAudit({
      operation: 'create_project',
      outcome: 'allowed',
      reasonCode: 'created',
      projectId: project.id
    });
    return Response.json(project, { status: 201 });
  }
  const overviewMatch = /^\/v1\/admin\/projects\/([^/]+)\/analytics$/.exec(url.pathname);
  if (overviewMatch && request.method === 'GET') {
    let range;
    try {
      range = parseAnalyticsRange(url.searchParams.get('start'), url.searchParams.get('end'));
    } catch {
      return invalid();
    }
    const sourceId = url.searchParams.get('source_id') ?? undefined;
    const overview = await dependencies.repositories.getAnalyticsOverview?.(
      overviewMatch[1]!,
      sourceId,
      range.startUtc,
      range.endUtc
    );
    return overview
      ? Response.json(overview, { headers: { 'cache-control': 'no-store' } })
      : Response.json({ error: 'not_found' }, { status: 404 });
  }
  const sourceMatch = /^\/v1\/admin\/projects\/([^/]+)\/sources$/.exec(url.pathname);
  if (sourceMatch && request.method === 'GET')
    return Response.json(await dependencies.repositories.listSources(sourceMatch[1]!));
  if (sourceMatch && request.method === 'POST') {
    const body = (await request.json().catch(() => undefined)) as
      { name?: unknown; allowedOrigins?: unknown; origins?: unknown } | undefined;
    const allowedOrigins = body && origins(body.allowedOrigins ?? body.origins);
    const projectId = sourceMatch[1]!;
    if (
      !allowedOrigins ||
      typeof body?.name !== 'string' ||
      body.name.trim().length < 1 ||
      body.name.length > 120 ||
      !(await dependencies.repositories.listProjects()).some((project) => project.id === projectId)
    )
      return invalid();
    const policy = safePolicy(crypto.randomUUID());
    const source: Source = {
      id: crypto.randomUUID(),
      projectId,
      name: body.name.trim(),
      publicSourceKey: crypto.randomUUID(),
      allowedOrigins,
      status: 'active',
      quotaPolicyId: policy.id
    };
    await dependencies.repositories.createQuotaPolicy(policy);
    await dependencies.repositories.createSource(source);
    await dependencies.repositories.saveAdminAudit({
      operation: 'create_source',
      outcome: 'allowed',
      reasonCode: 'created',
      projectId,
      sourceId: source.id
    });
    return Response.json(source, { status: 201 });
  }
  const disableMatch = /^\/v1\/admin\/projects\/([^/]+)\/sources\/([^/]+):disable$/.exec(
    url.pathname
  );
  if (disableMatch && request.method === 'POST') {
    const disabled = await dependencies.repositories.setSourceStatus(
      disableMatch[1]!,
      disableMatch[2]!,
      'disabled'
    );
    await dependencies.repositories.saveAdminAudit({
      operation: 'disable_source',
      outcome: disabled ? 'allowed' : 'denied',
      reasonCode: disabled ? 'disabled' : 'not_found',
      projectId: disableMatch[1]!,
      sourceId: disableMatch[2]!
    });
    return disabled
      ? Response.json({ status: 'disabled' })
      : Response.json({ error: 'not_found' }, { status: 404 });
  }
  const item = /^\/v1\/admin\/projects\/([^/]+)\/sources\/([^/]+)$/.exec(url.pathname);
  if (item && request.method === 'PATCH') {
    const body = (await request.json().catch(() => undefined)) as
      { name?: unknown; allowedOrigins?: unknown; origins?: unknown; status?: unknown } | undefined;
    const allowedOrigins =
      body && body.allowedOrigins !== undefined
        ? origins(body.allowedOrigins)
        : body && body.origins !== undefined
          ? origins(body.origins)
          : undefined;
    const name = typeof body?.name === 'string' ? body.name.trim() : undefined;
    const status =
      body?.status === 'active' || body?.status === 'disabled' ? body.status : undefined;
    const valid =
      !!body &&
      (name !== undefined || allowedOrigins !== undefined || status !== undefined) &&
      (body.name === undefined || (name !== undefined && name.length > 0 && name.length <= 120)) &&
      ((body.allowedOrigins === undefined && body.origins === undefined) ||
        allowedOrigins !== undefined) &&
      (body.status === undefined || status !== undefined);
    const source = valid
      ? await dependencies.repositories.updateSource(item[1]!, item[2]!, {
          ...(name !== undefined ? { name } : {}),
          ...(allowedOrigins !== undefined ? { allowedOrigins } : {}),
          ...(status !== undefined ? { status } : {})
        })
      : undefined;
    if (!source) return invalid();
    await dependencies.repositories.saveAdminAudit({
      operation: 'update_source',
      outcome: 'allowed',
      reasonCode: 'updated',
      projectId: item[1]!,
      sourceId: item[2]!
    });
    return Response.json(source);
  }
  if (item && request.method === 'DELETE') {
    const deleted = await dependencies.repositories.setSourceStatus(item[1]!, item[2]!, 'deleted');
    await dependencies.repositories.saveAdminAudit({
      operation: 'delete_source',
      outcome: deleted ? 'allowed' : 'denied',
      reasonCode: deleted ? 'deleted' : 'not_found',
      projectId: item[1]!,
      sourceId: item[2]!
    });
    return deleted
      ? Response.json({ status: 'deleted' })
      : Response.json({ error: 'not_found' }, { status: 404 });
  }
  const snippet = /^\/v1\/admin\/projects\/([^/]+)\/sources\/([^/]+)\/snippet$/.exec(url.pathname);
  if (snippet && request.method === 'GET') {
    const source = await dependencies.repositories.getSource(snippet[1]!, snippet[2]!);
    return source
      ? Response.json({
          publicSourceKey: source.publicSourceKey,
          allowedOrigins: source.allowedOrigins,
          tokenIssuer: 'website-owned'
        })
      : Response.json({ error: 'not_found' }, { status: 404 });
  }
  const status = /^\/v1\/admin\/projects\/([^/]+)\/sources\/([^/]+)\/status$/.exec(url.pathname);
  if (status && request.method === 'GET') {
    const source = await dependencies.repositories.getSource(status[1]!, status[2]!);
    return source
      ? Response.json({
          sourceId: source.id,
          collection: source.status === 'active' ? 'healthy' : 'disabled',
          aggregation: 'available',
          configuration: source.allowedOrigins.length ? 'healthy' : 'attention',
          dataAccess: 'available'
        })
      : Response.json({ error: 'not_found' }, { status: 404 });
  }
  const analyticsMatch = /^\/v1\/admin\/projects\/([^/]+)\/sources\/([^/]+)\/analytics$/.exec(
    url.pathname
  );
  if (analyticsMatch && request.method === 'GET') {
    const window = url.searchParams.get('window');
    if (window !== '24h' && window !== '7d' && window !== '30d') return invalid();
    const summary = await dependencies.repositories.getAnalyticsSummary?.(
      analyticsMatch[1]!,
      analyticsMatch[2]!,
      window
    );
    return summary
      ? Response.json(summary)
      : Response.json({ error: 'not_found' }, { status: 404 });
  }
  return Response.json({ error: 'not_found' }, { status: 404 });
}
