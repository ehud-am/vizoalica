import type { AdminRepository } from '../../../ingest-api/src/storage/repositories.js';
import type {
  AccessKeyRole,
  AccessKeyScope,
  ActionsFilters,
  Principal,
  Project,
  QuotaPolicy,
  Source
} from '../../../ingest-api/src/domain/types.js';
import type { PurgeSummary } from '../storage/purge-deleted.js';
import { resolvePrincipal } from '../auth/principal.js';
import { generateAccessKey } from '../auth/access-keys.js';
import { shouldAuditDenial, type DenialAuditGate } from './denial-audit.js';
import {
  AnalyticsRangeError,
  parseAnalyticsRange
} from '../../../ingest-api/src/analytics/range.js';

export type BackendInfo = {
  workerVersion: string | null;
  schema: {
    applied: number | null;
    expected: number;
    appliedNames: string[];
    status: 'current' | 'behind' | 'ahead' | 'unknown';
  };
  health: { database: 'ok' | 'unavailable'; storage: 'ok' | 'unavailable' };
};

type Dependencies = {
  repositories: AdminRepository;
  adminSecret: string;
  purgeDeleted?: (dryRun: boolean) => Promise<PurgeSummary>;
  backendInfo?: () => Promise<BackendInfo>;
  /** Decides whether this denied request is recorded; see denial-audit.ts. */
  auditDenial?: DenialAuditGate;
};

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
const forbidden = () => Response.json({ error: 'forbidden' }, { status: 403 });
const notFound = () => Response.json({ error: 'not_found' }, { status: 404 });
const invalid = (field?: string) =>
  Response.json({ error: 'invalid_request', ...(field ? { field } : {}) }, { status: 400 });

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** Exact-match filters of the actions report. Anything over the stored limits cannot match. */
function actionsFilters(url: URL): ActionsFilters | undefined {
  const filters: ActionsFilters = {};
  for (const [name, limit] of [
    ['page', 1024],
    ['action', 80]
  ] as const) {
    const value = url.searchParams.get(name);
    if (!value) continue;
    if (value.length > limit || CONTROL_CHARACTERS.test(value)) return undefined;
    filters[name] = value;
  }
  return filters;
}

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

/** A project id this scope may read or write; `null` for everything. */
function projectInScope(scope: AccessKeyScope, projectId: string): boolean {
  return scope.projectId === null || scope.projectId === projectId;
}
function sourceInScope(scope: AccessKeyScope, projectId: string, sourceId: string): boolean {
  return (
    projectInScope(scope, projectId) && (scope.sourceId === null || scope.sourceId === sourceId)
  );
}

/** Whether this write may proceed; `undefined` means yes. Admin always may. */
function guardProjectWrite(principal: Principal, projectId: string): Response | undefined {
  if (principal.role === 'admin') return undefined;
  if (principal.role === 'analyst') return forbidden();
  return projectInScope(principal.scope, projectId) ? undefined : notFound();
}
function guardSourceWrite(
  principal: Principal,
  projectId: string,
  sourceId: string
): Response | undefined {
  if (principal.role === 'admin') return undefined;
  if (principal.role === 'analyst') return forbidden();
  return sourceInScope(principal.scope, projectId, sourceId) ? undefined : notFound();
}

async function auditDenied(
  dependencies: Dependencies,
  operation: string,
  reasonCode: string,
  extra: { projectId?: string; sourceId?: string; actor?: string | undefined } = {}
) {
  if ((dependencies.auditDenial ?? shouldAuditDenial)())
    await dependencies.repositories.saveAdminAudit({
      operation,
      outcome: 'denied',
      reasonCode,
      ...(extra.projectId ? { projectId: extra.projectId } : {}),
      ...(extra.sourceId ? { sourceId: extra.sourceId } : {}),
      ...(extra.actor ? { actor: extra.actor } : {})
    });
}

function actorOf(principal: Principal): string | undefined {
  return principal.role === 'admin' ? undefined : principal.keyId;
}

export async function handleAdminRequest(
  request: Request,
  dependencies: Dependencies
): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/admin/')) return undefined;

  const resolved = await resolvePrincipal(
    request.headers.get('authorization'),
    dependencies.adminSecret,
    dependencies.repositories
  );
  if ('error' in resolved) {
    if (
      resolved.error === 'access_keys_unavailable' &&
      url.pathname.startsWith('/v1/admin/access-keys')
    )
      return Response.json({ error: 'access_keys_unavailable' }, { status: 501 });
    await auditDenied(dependencies, 'admin', 'unauthorized');
    return unauthorized();
  }
  const principal = resolved.principal;
  const actor = actorOf(principal);

  if (request.method === 'GET' && url.pathname === '/v1/admin/whoami') {
    const info = dependencies.backendInfo ? await dependencies.backendInfo() : undefined;
    return Response.json({
      role: principal.role,
      scope: principal.role === 'admin' ? { projectId: null, sourceId: null } : principal.scope,
      keyLabel: principal.role === 'admin' ? null : principal.keyLabel,
      workerVersion: info?.workerVersion ?? null,
      features: { accessKeys: true, versions: true }
    });
  }
  if (request.method === 'GET' && url.pathname === '/v1/admin/backend') {
    if (!dependencies.backendInfo) return notFound();
    return Response.json(await dependencies.backendInfo());
  }

  // Access key management: admin only, whatever the method.
  if (
    url.pathname === '/v1/admin/access-keys' ||
    url.pathname.startsWith('/v1/admin/access-keys/')
  ) {
    if (principal.role !== 'admin') {
      await auditDenied(dependencies, 'access_keys', 'forbidden', { actor });
      return forbidden();
    }
    if (!dependencies.repositories.createAccessKey || !dependencies.repositories.listAccessKeys)
      return Response.json({ error: 'access_keys_unavailable' }, { status: 501 });
    if (
      dependencies.repositories.hasAccessKeysTable &&
      !(await dependencies.repositories.hasAccessKeysTable())
    )
      return Response.json({ error: 'access_keys_unavailable' }, { status: 501 });
    if (request.method === 'GET' && url.pathname === '/v1/admin/access-keys')
      return Response.json(await dependencies.repositories.listAccessKeys());
    if (request.method === 'POST' && url.pathname === '/v1/admin/access-keys') {
      const body = (await request.json().catch(() => undefined)) as
        { label?: unknown; role?: unknown; projectId?: unknown; sourceId?: unknown } | undefined;
      const label = typeof body?.label === 'string' ? body.label.trim() : '';
      const role = body?.role;
      if (
        !label ||
        label.length > 64 ||
        CONTROL_CHARACTERS.test(label) ||
        (role !== 'analyst' && role !== 'owner')
      )
        return invalid();
      const projectId = body?.projectId;
      const sourceId = body?.sourceId;
      if (projectId !== undefined && typeof projectId !== 'string') return invalid('projectId');
      if (sourceId !== undefined && typeof sourceId !== 'string') return invalid('sourceId');
      if (sourceId !== undefined && projectId === undefined) return invalid('sourceId');
      if (projectId !== undefined) {
        const project = await dependencies.repositories
          .listProjects()
          .then((list) => list.find((item) => item.id === projectId && item.status === 'active'));
        if (!project) return notFound();
      }
      if (sourceId !== undefined) {
        const source = await dependencies.repositories.getSource(
          projectId as string,
          sourceId as string
        );
        if (!source || source.status === 'deleted') return notFound();
      }
      if (dependencies.repositories.countActiveAccessKeys) {
        const active = await dependencies.repositories.countActiveAccessKeys();
        if (active >= 200) return Response.json({ error: 'too_many_keys' }, { status: 409 });
      }
      const generated = await generateAccessKey();
      const summary = await dependencies.repositories.createAccessKey({
        id: generated.id,
        label,
        role: role as AccessKeyRole,
        secretHash: generated.secretHash,
        scope: {
          projectId: (projectId as string | undefined) ?? null,
          sourceId: (sourceId as string | undefined) ?? null
        }
      });
      await dependencies.repositories.saveAdminAudit({
        operation: 'issue_access_key',
        outcome: 'allowed',
        reasonCode: 'issued',
        actor: summary.id
      });
      return Response.json({ ...summary, key: generated.key }, { status: 201 });
    }
    const item = /^\/v1\/admin\/access-keys\/([^/]+)$/.exec(url.pathname);
    if (item && request.method === 'DELETE') {
      const revoked = dependencies.repositories.revokeAccessKey
        ? await dependencies.repositories.revokeAccessKey(item[1]!)
        : false;
      if (!revoked) return notFound();
      await dependencies.repositories.saveAdminAudit({
        operation: 'revoke_access_key',
        outcome: 'allowed',
        reasonCode: 'revoked',
        actor: item[1]!
      });
      return Response.json({ status: 'revoked' });
    }
    return notFound();
  }

  if (request.method === 'GET' && url.pathname === '/v1/admin/projects') {
    const projects = await dependencies.repositories.listProjects();
    const visible =
      principal.role === 'admin'
        ? projects
        : projects.filter((project) => projectInScope(principal.scope, project.id));
    return Response.json(visible);
  }
  if (request.method === 'POST' && url.pathname === '/v1/admin/projects') {
    if (principal.role === 'analyst') {
      await auditDenied(dependencies, 'create_project', 'forbidden', { actor });
      return forbidden();
    }
    if (
      principal.role === 'owner' &&
      (principal.scope.projectId !== null || principal.scope.sourceId !== null)
    ) {
      await auditDenied(dependencies, 'create_project', 'forbidden', { actor });
      return forbidden();
    }
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
      quotaPolicyId: policy.id,
      status: 'active'
    };
    await dependencies.repositories.createQuotaPolicy(policy);
    await dependencies.repositories.createProject(project);
    await dependencies.repositories.saveAdminAudit({
      operation: 'create_project',
      outcome: 'allowed',
      reasonCode: 'created',
      projectId: project.id,
      ...(actor ? { actor } : {})
    });
    return Response.json(project, { status: 201 });
  }
  if (request.method === 'POST' && url.pathname === '/v1/admin/purge-deleted') {
    if (principal.role !== 'admin') {
      await auditDenied(dependencies, 'purge_deleted', 'forbidden', { actor });
      return forbidden();
    }
    if (!dependencies.purgeDeleted) return notFound();
    const body = (await request.json().catch(() => undefined)) as { dryRun?: unknown } | undefined;
    // Irreversible, so the caller must say which mode it wants rather than default into deleting.
    if (!body || typeof body.dryRun !== 'boolean') return invalid();
    const summary = await dependencies.purgeDeleted(body.dryRun);
    // Deliberately carries no project or website id: the purge must leave no trace of them.
    await dependencies.repositories.saveAdminAudit({
      operation: 'purge_deleted',
      outcome: 'allowed',
      reasonCode: summary.dryRun ? 'dry_run' : summary.complete ? 'purged' : 'partial'
    });
    return Response.json(summary);
  }
  const projectItem = /^\/v1\/admin\/projects\/([^/]+)$/.exec(url.pathname);
  if (projectItem && request.method === 'DELETE') {
    const guarded = guardProjectWrite(principal, projectItem[1]!);
    if (guarded) {
      await auditDenied(dependencies, 'delete_project', 'forbidden', {
        projectId: projectItem[1]!,
        actor
      });
      return guarded;
    }
    const deleted = await dependencies.repositories.setProjectStatus(projectItem[1]!, 'deleted');
    await dependencies.repositories.saveAdminAudit({
      operation: 'delete_project',
      outcome: deleted ? 'allowed' : 'denied',
      reasonCode: deleted ? 'deleted' : 'not_found',
      projectId: projectItem[1]!,
      ...(actor ? { actor } : {})
    });
    return deleted ? Response.json({ status: 'deleted' }) : notFound();
  }
  const overviewMatch = /^\/v1\/admin\/projects\/([^/]+)\/analytics$/.exec(url.pathname);
  if (overviewMatch && request.method === 'GET') {
    if (principal.role !== 'admin' && !projectInScope(principal.scope, overviewMatch[1]!))
      return notFound();
    let range;
    try {
      range = parseAnalyticsRange(url.searchParams.get('start'), url.searchParams.get('end'));
    } catch (error) {
      if (error instanceof AnalyticsRangeError)
        return Response.json(
          { error: error.code, field: error.field, message: error.message },
          { status: 400 }
        );
      return invalid();
    }
    // A website-scoped key can only ever see its own website, whatever source_id was asked for.
    const sourceId =
      principal.role !== 'admin' && principal.scope.sourceId !== null
        ? principal.scope.sourceId
        : (url.searchParams.get('source_id') ?? undefined);
    if (
      principal.role !== 'admin' &&
      principal.scope.sourceId !== null &&
      url.searchParams.get('source_id') &&
      url.searchParams.get('source_id') !== principal.scope.sourceId
    )
      return notFound();
    const overview = await dependencies.repositories.getAnalyticsOverview?.(
      overviewMatch[1]!,
      sourceId,
      range.startUtc,
      range.endUtc
    );
    return overview
      ? Response.json(overview, { headers: { 'cache-control': 'no-store' } })
      : notFound();
  }
  const actionsMatch = /^\/v1\/admin\/projects\/([^/]+)\/analytics\/actions$/.exec(url.pathname);
  if (actionsMatch && request.method === 'GET') {
    if (principal.role !== 'admin' && !projectInScope(principal.scope, actionsMatch[1]!))
      return notFound();
    let range;
    try {
      range = parseAnalyticsRange(url.searchParams.get('start'), url.searchParams.get('end'));
    } catch (error) {
      if (error instanceof AnalyticsRangeError)
        return Response.json(
          { error: error.code, field: error.field, message: error.message },
          { status: 400 }
        );
      return invalid();
    }
    const filters = actionsFilters(url);
    if (!filters) return invalid();
    if (
      principal.role !== 'admin' &&
      principal.scope.sourceId !== null &&
      url.searchParams.get('source_id') &&
      url.searchParams.get('source_id') !== principal.scope.sourceId
    )
      return notFound();
    const sourceId =
      principal.role !== 'admin' && principal.scope.sourceId !== null
        ? principal.scope.sourceId
        : (url.searchParams.get('source_id') ?? undefined);
    const report = await dependencies.repositories.getActionsReport?.(
      actionsMatch[1]!,
      sourceId,
      range.startUtc,
      range.endUtc,
      filters
    );
    return report
      ? Response.json(report, { headers: { 'cache-control': 'no-store' } })
      : notFound();
  }
  const sourceMatch = /^\/v1\/admin\/projects\/([^/]+)\/sources$/.exec(url.pathname);
  if (sourceMatch && request.method === 'GET') {
    if (principal.role !== 'admin' && !projectInScope(principal.scope, sourceMatch[1]!))
      return notFound();
    const sources = await dependencies.repositories.listSources(sourceMatch[1]!);
    const visible =
      principal.role === 'admin' || principal.scope.sourceId === null
        ? sources
        : sources.filter((source) => source.id === principal.scope.sourceId);
    return Response.json(visible);
  }
  if (sourceMatch && request.method === 'POST') {
    const projectId = sourceMatch[1]!;
    if (principal.role === 'analyst') {
      await auditDenied(dependencies, 'create_source', 'forbidden', { projectId, actor });
      return forbidden();
    }
    if (
      principal.role === 'owner' &&
      (principal.scope.sourceId !== null || !projectInScope(principal.scope, projectId))
    ) {
      await auditDenied(dependencies, 'create_source', 'forbidden', { projectId, actor });
      return forbidden();
    }
    const body = (await request.json().catch(() => undefined)) as
      { name?: unknown; allowedOrigins?: unknown; origins?: unknown } | undefined;
    const allowedOrigins = body && origins(body.allowedOrigins ?? body.origins);
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
      sourceId: source.id,
      ...(actor ? { actor } : {})
    });
    return Response.json(source, { status: 201 });
  }
  const disableMatch = /^\/v1\/admin\/projects\/([^/]+)\/sources\/([^/]+):disable$/.exec(
    url.pathname
  );
  if (disableMatch && request.method === 'POST') {
    const guarded = guardSourceWrite(principal, disableMatch[1]!, disableMatch[2]!);
    if (guarded) {
      await auditDenied(dependencies, 'disable_source', 'forbidden', {
        projectId: disableMatch[1]!,
        sourceId: disableMatch[2]!,
        actor
      });
      return guarded;
    }
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
      sourceId: disableMatch[2]!,
      ...(actor ? { actor } : {})
    });
    return disabled ? Response.json({ status: 'disabled' }) : notFound();
  }
  const item = /^\/v1\/admin\/projects\/([^/]+)\/sources\/([^/]+)$/.exec(url.pathname);
  if (item && request.method === 'PATCH') {
    const guarded = guardSourceWrite(principal, item[1]!, item[2]!);
    if (guarded) {
      await auditDenied(dependencies, 'update_source', 'forbidden', {
        projectId: item[1]!,
        sourceId: item[2]!,
        actor
      });
      return guarded;
    }
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
      sourceId: item[2]!,
      ...(actor ? { actor } : {})
    });
    return Response.json(source);
  }
  if (item && request.method === 'DELETE') {
    const guarded = guardSourceWrite(principal, item[1]!, item[2]!);
    if (guarded) {
      await auditDenied(dependencies, 'delete_source', 'forbidden', {
        projectId: item[1]!,
        sourceId: item[2]!,
        actor
      });
      return guarded;
    }
    const deleted = await dependencies.repositories.setSourceStatus(item[1]!, item[2]!, 'deleted');
    await dependencies.repositories.saveAdminAudit({
      operation: 'delete_source',
      outcome: deleted ? 'allowed' : 'denied',
      reasonCode: deleted ? 'deleted' : 'not_found',
      projectId: item[1]!,
      sourceId: item[2]!,
      ...(actor ? { actor } : {})
    });
    return deleted ? Response.json({ status: 'deleted' }) : notFound();
  }
  const snippet = /^\/v1\/admin\/projects\/([^/]+)\/sources\/([^/]+)\/snippet$/.exec(url.pathname);
  if (snippet && request.method === 'GET') {
    if (principal.role !== 'admin' && !sourceInScope(principal.scope, snippet[1]!, snippet[2]!))
      return notFound();
    const source = await dependencies.repositories.getSource(snippet[1]!, snippet[2]!);
    return source
      ? Response.json({
          publicSourceKey: source.publicSourceKey,
          allowedOrigins: source.allowedOrigins,
          tokenIssuer: 'website-owned'
        })
      : notFound();
  }
  const status = /^\/v1\/admin\/projects\/([^/]+)\/sources\/([^/]+)\/status$/.exec(url.pathname);
  if (status && request.method === 'GET') {
    if (principal.role !== 'admin' && !sourceInScope(principal.scope, status[1]!, status[2]!))
      return notFound();
    const source = await dependencies.repositories.getSource(status[1]!, status[2]!);
    return source
      ? Response.json({
          sourceId: source.id,
          collection: source.status === 'active' ? 'healthy' : 'disabled',
          aggregation: 'available',
          configuration: source.allowedOrigins.length ? 'healthy' : 'attention',
          dataAccess: 'available'
        })
      : notFound();
  }
  const analyticsMatch = /^\/v1\/admin\/projects\/([^/]+)\/sources\/([^/]+)\/analytics$/.exec(
    url.pathname
  );
  if (analyticsMatch && request.method === 'GET') {
    if (
      principal.role !== 'admin' &&
      !sourceInScope(principal.scope, analyticsMatch[1]!, analyticsMatch[2]!)
    )
      return notFound();
    const window = url.searchParams.get('window');
    if (window !== '24h' && window !== '7d' && window !== '30d') return invalid();
    const summary = await dependencies.repositories.getAnalyticsSummary?.(
      analyticsMatch[1]!,
      analyticsMatch[2]!,
      window
    );
    return summary ? Response.json(summary) : notFound();
  }
  return notFound();
}
