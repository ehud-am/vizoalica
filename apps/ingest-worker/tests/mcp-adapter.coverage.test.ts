import { describe, expect, it, vi } from 'vitest';
import { handleMcpRequest } from '../src/http/mcp-adapter.js';

function repository(counts: unknown = { total: 3, byDateAndPath: [] }) {
  return {
    saveAdminAudit: vi.fn(),
    listProjects: vi.fn(async () => [{ id: 'p1', name: 'One' }]),
    listSources: vi.fn(async () => [{ id: 's1', projectId: 'p1' }]),
    getPageViewCounts: vi.fn(async () => counts)
  };
}
function request(body: unknown, authorization = 'Bearer secret', method = 'POST') {
  return new Request('https://worker.test/mcp', {
    method,
    headers: { authorization, 'content-type': 'application/json' },
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {})
  });
}

describe('MCP adapter protocol branches', () => {
  it('ignores non-MCP paths and denies unauthorized methods', async () => {
    expect(
      await handleMcpRequest(new Request('https://worker.test/elsewhere'), {
        repositories: repository() as never,
        adminSecret: 'secret'
      })
    ).toBeUndefined();
    expect(
      (
        await handleMcpRequest(request({}, 'Bearer bad'), {
          repositories: repository() as never,
          adminSecret: 'secret'
        })
      )?.status
    ).toBe(401);
    expect(
      (
        await handleMcpRequest(request({}, 'Bearer secret', 'GET'), {
          repositories: repository() as never,
          adminSecret: 'secret'
        })
      )?.status
    ).toBe(401);
  });
  it('validates JSON-RPC requests and exposes initialization and tool metadata', async () => {
    const dependencies = { repositories: repository() as never, adminSecret: 'secret' };
    expect((await handleMcpRequest(request('{'), dependencies))?.status).toBe(400);
    expect(
      await (await handleMcpRequest(request({ id: 1, method: 'initialize' }), dependencies))?.json()
    ).toMatchObject({ id: 1, result: { serverInfo: { name: 'vizoalica' } } });
    expect(
      await (await handleMcpRequest(request({ method: 'tools/list' }), dependencies))?.json()
    ).toMatchObject({ id: null, result: { tools: expect.any(Array) } });
    expect(
      await (await handleMcpRequest(request({ id: 2, method: 'unknown' }), dependencies))?.json()
    ).toMatchObject({ error: { code: -32601 } });
  });
  it('lists project sources and audits the operation', async () => {
    const repositories = repository();
    const response = await handleMcpRequest(
      request({
        id: 'x',
        method: 'tools/call',
        params: { name: 'list_projects_and_sources', arguments: {} }
      }),
      { repositories: repositories as never, adminSecret: 'secret' }
    );
    expect(JSON.stringify(await response?.json())).toContain('s1');
    expect(repositories.saveAdminAudit).toHaveBeenCalled();
  });
  it('validates ranges, handles unknown sources, and returns bounded counts', async () => {
    const call = (argumentsValue: unknown, repositories = repository()) =>
      handleMcpRequest(
        request({
          id: 3,
          method: 'tools/call',
          params: { name: 'get_page_view_counts', arguments: argumentsValue }
        }),
        { repositories: repositories as never, adminSecret: 'secret' }
      );
    for (const args of [
      {},
      { project_id: 'p1', source_id: 's1', start_date: 'bad', end_date: '2026-01-01' },
      { project_id: 'p1', source_id: 's1', start_date: '2026-02-02', end_date: '2026-01-01' },
      { project_id: 'p1', source_id: 's1', start_date: '2025-01-01', end_date: '2026-01-01' }
    ])
      expect(await (await call(args))?.json()).toMatchObject({ error: { code: -32602 } });
    const missing = repository(undefined);
    missing.getPageViewCounts.mockResolvedValue(undefined);
    expect(
      await (
        await call(
          { project_id: 'p1', source_id: 's1', start_date: '2026-01-01', end_date: '2026-01-02' },
          missing
        )
      )?.json()
    ).toMatchObject({ error: { message: 'unknown_source' } });
    expect(
      await (
        await call({
          project_id: 'p1',
          source_id: 's1',
          start_date: '2026-01-01',
          end_date: '2026-01-02'
        })
      )?.json()
    ).toMatchObject({ result: { content: expect.any(Array) } });
    expect(
      await (
        await handleMcpRequest(
          request({ method: 'tools/call', params: { name: 'unknown', arguments: {} } }),
          { repositories: repository() as never, adminSecret: 'secret' }
        )
      )?.json()
    ).toMatchObject({ error: { message: 'unknown_tool' } });
  });
});
