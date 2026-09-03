import type { AdminRepository } from '../../../ingest-api/src/storage/repositories.js';
import type { Project, QuotaPolicy, Source } from '../../../ingest-api/src/domain/types.js';
import { hasValidAdminAuthorization } from '../auth/admin-verifier.js';

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
  const sourceMatch = /^\/v1\/admin\/projects\/([^/]+)\/sources$/.exec(url.pathname);
  if (sourceMatch && request.method === 'GET')
    return Response.json(await dependencies.repositories.listSources(sourceMatch[1]!));
  if (sourceMatch && request.method === 'POST') {
    const body = (await request.json().catch(() => undefined)) as { origins?: unknown } | undefined;
    const allowedOrigins = body && origins(body.origins);
    const projectId = sourceMatch[1]!;
    if (
      !allowedOrigins ||
      !(await dependencies.repositories.listProjects()).some((project) => project.id === projectId)
    )
      return invalid();
    const policy = safePolicy(crypto.randomUUID());
    const source: Source = {
      id: crypto.randomUUID(),
      projectId,
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
    const disabled = await dependencies.repositories.disableSource(
      disableMatch[1]!,
      disableMatch[2]!
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
  return Response.json({ error: 'not_found' }, { status: 404 });
}
