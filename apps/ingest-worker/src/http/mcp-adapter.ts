import type { AdminRepository } from '../../../ingest-api/src/storage/repositories.js';
import { hasValidAdminAuthorization } from '../auth/admin-verifier.js';
import { shouldAuditDenial, type DenialAuditGate } from './denial-audit.js';

type Dependencies = {
  repositories: AdminRepository;
  adminSecret: string;
  /** Decides whether this denied request is recorded; see denial-audit.ts. */
  auditDenial?: DenialAuditGate;
};
type RpcRequest = { id?: string | number | null; method?: unknown; params?: unknown };

const tools = [
  {
    name: 'list_projects_and_sources',
    description: 'List safe project and website-source metadata.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_page_view_counts',
    description: 'Get aggregate page-view counts for one source and a bounded date range.',
    inputSchema: {
      type: 'object',
      required: ['project_id', 'source_id', 'start_date', 'end_date'],
      properties: {
        project_id: { type: 'string' },
        source_id: { type: 'string' },
        start_date: { type: 'string' },
        end_date: { type: 'string' }
      }
    }
  }
];

const rpc = (id: RpcRequest['id'], result: unknown) =>
  Response.json({ jsonrpc: '2.0', id: id ?? null, result });
const error = (id: RpcRequest['id'], code: number, message: string) =>
  Response.json(
    { jsonrpc: '2.0', id: id ?? null, error: { code, message } },
    { status: code === -32600 ? 400 : 200 }
  );

function validRange(
  args: Record<string, unknown>
): { projectId: string; sourceId: string; start: string; end: string } | undefined {
  const { project_id: projectId, source_id: sourceId, start_date: start, end_date: end } = args;
  if (![projectId, sourceId, start, end].every((value) => typeof value === 'string'))
    return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start as string) || !/^\d{4}-\d{2}-\d{2}$/.test(end as string))
    return undefined;
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  if (
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    endTime < startTime ||
    endTime - startTime > 30 * 86400000
  )
    return undefined;
  return {
    projectId: projectId as string,
    sourceId: sourceId as string,
    start: start as string,
    end: end as string
  };
}

export async function handleMcpRequest(
  request: Request,
  dependencies: Dependencies
): Promise<Response | undefined> {
  if (new URL(request.url).pathname !== '/mcp') return undefined;
  if (
    request.method !== 'POST' ||
    !hasValidAdminAuthorization(request.headers.get('authorization'), dependencies.adminSecret)
  ) {
    if ((dependencies.auditDenial ?? shouldAuditDenial)())
      await dependencies.repositories.saveAdminAudit({
        operation: 'mcp',
        outcome: 'denied',
        reasonCode: 'unauthorized'
      });
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = (await request.json().catch(() => undefined)) as RpcRequest | undefined;
  if (!body || typeof body.method !== 'string') return error(body?.id, -32600, 'invalid_request');
  if (body.method === 'initialize')
    return rpc(body.id, {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'vizoalica', version: '0.1.0' }
    });
  if (body.method === 'tools/list') return rpc(body.id, { tools });
  if (body.method !== 'tools/call' || !body.params || typeof body.params !== 'object')
    return error(body.id, -32601, 'method_not_found');
  const params = body.params as { name?: unknown; arguments?: unknown };
  if (params.name === 'list_projects_and_sources') {
    const projects = await dependencies.repositories.listProjects();
    const result = await Promise.all(
      projects.map(async (project) => ({
        ...project,
        sources: await dependencies.repositories.listSources(project.id)
      }))
    );
    await dependencies.repositories.saveAdminAudit({
      operation: 'mcp_list_projects_and_sources',
      outcome: 'allowed',
      reasonCode: 'completed'
    });
    return rpc(body.id, { content: [{ type: 'text', text: JSON.stringify(result) }] });
  }
  if (
    params.name === 'get_page_view_counts' &&
    params.arguments &&
    typeof params.arguments === 'object'
  ) {
    const range = validRange(params.arguments as Record<string, unknown>);
    if (!range) return error(body.id, -32602, 'invalid_arguments');
    const counts = await dependencies.repositories.getPageViewCounts(
      range.projectId,
      range.sourceId,
      range.start,
      range.end
    );
    if (!counts) return error(body.id, -32602, 'unknown_source');
    await dependencies.repositories.saveAdminAudit({
      operation: 'mcp_get_page_view_counts',
      outcome: 'allowed',
      reasonCode: 'completed',
      projectId: range.projectId,
      sourceId: range.sourceId
    });
    return rpc(body.id, {
      content: [{ type: 'text', text: JSON.stringify({ ...range, ...counts }) }]
    });
  }
  return error(body.id, -32602, 'unknown_tool');
}
