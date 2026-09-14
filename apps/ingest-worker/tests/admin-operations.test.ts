import { describe, expect, it, vi } from 'vitest';
import { handleAdminRequest } from '../src/http/admin-adapter.js';
function repository() {
  const source = {
    id: 's1',
    projectId: 'p1',
    name: 'Docs',
    publicSourceKey: 'public-key',
    allowedOrigins: ['https://docs.test'],
    status: 'active' as const
  };
  return {
    listProjects: vi.fn(async () => [{ id: 'p1' }]),
    listSources: vi.fn(async () => [source]),
    getSource: vi.fn(async (): Promise<unknown> => source),
    updateSource: vi.fn(async (_p, _s, changes): Promise<unknown> => ({ ...source, ...changes })),
    setSourceStatus: vi.fn(async (_p, _s, status): Promise<unknown> => ({ ...source, status })),
    setProjectStatus: vi.fn(async (id, status): Promise<unknown> =>
      id === 'p1' ? { id, status } : undefined
    ),
    getAnalyticsSummary: vi.fn(),
    saveAdminAudit: vi.fn(async () => undefined),
    createQuotaPolicy: vi.fn(),
    createProject: vi.fn(),
    createSource: vi.fn(),
    getPageViewCounts: vi.fn()
  };
}
const req = (path: string, method = 'GET', body?: unknown) =>
  new Request(`https://worker.test${path}`, {
    method,
    headers: {
      authorization: 'Bearer secret',
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
describe('Worker website administration', () => {
  it('updates and soft-deletes a project-scoped source with audit records', async () => {
    const repositories = repository();
    const updated = await handleAdminRequest(
      req('/v1/admin/projects/p1/sources/s1', 'PATCH', {
        name: 'Docs v2',
        allowedOrigins: ['https://new.test']
      }),
      { repositories: repositories as never, adminSecret: 'secret' }
    );
    expect(updated?.status).toBe(200);
    expect(repositories.updateSource).toHaveBeenCalled();
    const deleted = await handleAdminRequest(req('/v1/admin/projects/p1/sources/s1', 'DELETE'), {
      repositories: repositories as never,
      adminSecret: 'secret'
    });
    expect(await deleted?.json()).toEqual({ status: 'deleted' });
    expect(repositories.setSourceStatus).toHaveBeenCalledWith('p1', 's1', 'deleted');
    expect(repositories.saveAdminAudit).toHaveBeenCalled();
  });
  it('soft-deletes a project with audit records, and reports not_found otherwise', async () => {
    const repositories = repository();
    const deleted = await handleAdminRequest(req('/v1/admin/projects/p1', 'DELETE'), {
      repositories: repositories as never,
      adminSecret: 'secret'
    });
    expect(await deleted?.json()).toEqual({ status: 'deleted' });
    expect(repositories.setProjectStatus).toHaveBeenCalledWith('p1', 'deleted');
    expect(repositories.saveAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'delete_project', outcome: 'allowed', projectId: 'p1' })
    );
    const missing = await handleAdminRequest(req('/v1/admin/projects/missing', 'DELETE'), {
      repositories: repositories as never,
      adminSecret: 'secret'
    });
    expect(missing?.status).toBe(404);
    expect(repositories.saveAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'delete_project', outcome: 'denied' })
    );
  });
  it('returns only safe snippet metadata and distinct health states', async () => {
    const repositories = repository();
    const snippet = await handleAdminRequest(req('/v1/admin/projects/p1/sources/s1/snippet'), {
      repositories: repositories as never,
      adminSecret: 'secret'
    });
    const text = JSON.stringify(await snippet?.json());
    expect(text).toContain('public-key');
    expect(text).not.toMatch(/secret|jwt|authorization/i);
    const status = await handleAdminRequest(req('/v1/admin/projects/p1/sources/s1/status'), {
      repositories: repositories as never,
      adminSecret: 'secret'
    });
    expect(await status?.json()).toMatchObject({
      collection: 'healthy',
      aggregation: 'available',
      dataAccess: 'available'
    });
  });

  it('covers project creation, listing, authorization, and validation', async () => {
    const repositories = repository();
    expect(
      await handleAdminRequest(new Request('https://worker.test/healthz'), {
        repositories: repositories as never,
        adminSecret: 'secret'
      })
    ).toBeUndefined();
    expect(
      (
        await handleAdminRequest(new Request('https://worker.test/v1/admin/projects'), {
          repositories: repositories as never,
          adminSecret: 'secret'
        })
      )?.status
    ).toBe(401);
    expect(
      await (
        await handleAdminRequest(req('/v1/admin/projects'), {
          repositories: repositories as never,
          adminSecret: 'secret'
        })
      )?.json()
    ).toHaveLength(1);
    for (const body of [undefined, {}, { name: '' }, { name: 'x'.repeat(121) }, { name: 2 }]) {
      const response = await handleAdminRequest(req('/v1/admin/projects', 'POST', body), {
        repositories: repositories as never,
        adminSecret: 'secret'
      });
      expect(response?.status).toBe(400);
    }
    const created = await handleAdminRequest(
      req('/v1/admin/projects', 'POST', { name: ' Project ' }),
      { repositories: repositories as never, adminSecret: 'secret' }
    );
    expect(created?.status).toBe(201);
    expect(repositories.createProject).toHaveBeenCalled();
    expect(repositories.createQuotaPolicy).toHaveBeenCalled();
  });

  it('validates and creates project-scoped sources', async () => {
    const repositories = repository();
    expect(
      await (
        await handleAdminRequest(req('/v1/admin/projects/p1/sources'), {
          repositories: repositories as never,
          adminSecret: 'secret'
        })
      )?.json()
    ).toHaveLength(1);
    for (const body of [
      { name: 'Docs', allowedOrigins: [] },
      { name: '', allowedOrigins: ['https://docs.test'] },
      { name: 'Docs', allowedOrigins: ['ftp://docs.test'] },
      { name: 'Docs', allowedOrigins: ['https://docs.test/path'] },
      { name: 'Docs', allowedOrigins: ['https://docs.test', 'https://docs.test'] },
      { name: 'Docs', allowedOrigins: [3] }
    ]) {
      expect(
        (
          await handleAdminRequest(req('/v1/admin/projects/p1/sources', 'POST', body), {
            repositories: repositories as never,
            adminSecret: 'secret'
          })
        )?.status
      ).toBe(400);
    }
    const created = await handleAdminRequest(
      req('/v1/admin/projects/p1/sources', 'POST', {
        name: 'Docs',
        origins: ['https://docs.test']
      }),
      { repositories: repositories as never, adminSecret: 'secret' }
    );
    expect(created?.status).toBe(201);
    expect(repositories.createSource).toHaveBeenCalled();
    repositories.listProjects.mockResolvedValueOnce([]);
    expect(
      (
        await handleAdminRequest(
          req('/v1/admin/projects/missing/sources', 'POST', {
            name: 'Docs',
            allowedOrigins: ['https://docs.test']
          }),
          { repositories: repositories as never, adminSecret: 'secret' }
        )
      )?.status
    ).toBe(400);
  });

  it('covers missing mutation, snippet, status, and analytics outcomes', async () => {
    const repositories = repository();
    repositories.setSourceStatus.mockResolvedValueOnce(undefined);
    expect(
      (
        await handleAdminRequest(req('/v1/admin/projects/p1/sources/s1:disable', 'POST'), {
          repositories: repositories as never,
          adminSecret: 'secret'
        })
      )?.status
    ).toBe(404);
    repositories.setSourceStatus.mockResolvedValueOnce(undefined);
    expect(
      (
        await handleAdminRequest(req('/v1/admin/projects/p1/sources/s1', 'DELETE'), {
          repositories: repositories as never,
          adminSecret: 'secret'
        })
      )?.status
    ).toBe(404);
    repositories.getSource.mockResolvedValueOnce(undefined);
    expect(
      (
        await handleAdminRequest(req('/v1/admin/projects/p1/sources/s1/snippet'), {
          repositories: repositories as never,
          adminSecret: 'secret'
        })
      )?.status
    ).toBe(404);
    repositories.getSource.mockResolvedValueOnce(undefined);
    expect(
      (
        await handleAdminRequest(req('/v1/admin/projects/p1/sources/s1/status'), {
          repositories: repositories as never,
          adminSecret: 'secret'
        })
      )?.status
    ).toBe(404);
    repositories.getSource.mockResolvedValueOnce({
      id: 's1',
      projectId: 'p1',
      name: 'Docs',
      publicSourceKey: 'p',
      allowedOrigins: [],
      status: 'disabled'
    });
    expect(
      await (
        await handleAdminRequest(req('/v1/admin/projects/p1/sources/s1/status'), {
          repositories: repositories as never,
          adminSecret: 'secret'
        })
      )?.json()
    ).toMatchObject({ collection: 'disabled', configuration: 'attention' });
    expect(
      (
        await handleAdminRequest(req('/v1/admin/projects/p1/sources/s1/analytics?window=bad'), {
          repositories: repositories as never,
          adminSecret: 'secret'
        })
      )?.status
    ).toBe(400);
    repositories.getAnalyticsSummary.mockResolvedValueOnce(undefined);
    expect(
      (
        await handleAdminRequest(req('/v1/admin/projects/p1/sources/s1/analytics?window=24h'), {
          repositories: repositories as never,
          adminSecret: 'secret'
        })
      )?.status
    ).toBe(404);
    expect(
      (
        await handleAdminRequest(req('/v1/admin/nope'), {
          repositories: repositories as never,
          adminSecret: 'secret'
        })
      )?.status
    ).toBe(404);
  });

  it('rejects malformed source patches and supports every allowed partial field', async () => {
    const repositories = repository();
    for (const body of [
      undefined,
      {},
      { name: '' },
      { status: 'deleted' },
      { allowedOrigins: ['bad'] }
    ])
      expect(
        (
          await handleAdminRequest(req('/v1/admin/projects/p1/sources/s1', 'PATCH', body), {
            repositories: repositories as never,
            adminSecret: 'secret'
          })
        )?.status
      ).toBe(400);
    for (const body of [
      { name: 'Renamed' },
      { status: 'disabled' },
      { origins: ['https://new.test'] }
    ])
      expect(
        (
          await handleAdminRequest(req('/v1/admin/projects/p1/sources/s1', 'PATCH', body), {
            repositories: repositories as never,
            adminSecret: 'secret'
          })
        )?.status
      ).toBe(200);
    repositories.updateSource.mockResolvedValueOnce(undefined);
    expect(
      (
        await handleAdminRequest(
          req('/v1/admin/projects/p1/sources/s1', 'PATCH', { name: 'Missing' }),
          { repositories: repositories as never, adminSecret: 'secret' }
        )
      )?.status
    ).toBe(400);
  });
});
