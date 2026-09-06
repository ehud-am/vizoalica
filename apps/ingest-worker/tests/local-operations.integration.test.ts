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
    listProjects: vi.fn(async () => [
      {
        id: 'p1',
        name: 'Project',
        mode: 'production',
        defaultRetentionDays: 7,
        quotaPolicyId: 'q1'
      }
    ]),
    listSources: vi.fn(async (projectId: string) => (projectId === 'p1' ? [source] : [])),
    getSource: vi.fn(async (projectId: string, sourceId: string) =>
      projectId === 'p1' && sourceId === 's1' ? source : undefined
    ),
    updateSource: vi.fn(async () => source),
    setSourceStatus: vi.fn(async () => ({ ...source, status: 'deleted' as const })),
    getAnalyticsSummary: vi.fn(async (projectId: string, sourceId: string, window: string) =>
      projectId === 'p1' && sourceId === 's1'
        ? {
            projectId,
            sourceId,
            window,
            startUtc: '2026-01-01T00:00:00Z',
            endUtc: '2026-01-02T00:00:00Z',
            pageViews: 8,
            uniqueUsers: 3,
            availability: 'complete'
          }
        : undefined
    ),
    saveAdminAudit: vi.fn(async () => undefined),
    createQuotaPolicy: vi.fn(),
    createProject: vi.fn(),
    createSource: vi.fn(),
    getPageViewCounts: vi.fn()
  };
}
const request = (path: string) =>
  new Request(`https://worker.test${path}`, { headers: { authorization: 'Bearer secret' } });
describe('local operations Worker boundary', () => {
  it('returns fixed-window aggregates without raw-event fallback or private digests', async () => {
    const repositories = repository();
    const response = await handleAdminRequest(
      request('/v1/admin/projects/p1/sources/s1/analytics?window=7d'),
      { repositories: repositories as never, adminSecret: 'secret' }
    );
    expect(response?.status).toBe(200);
    const body = await response!.json();
    expect(body).toMatchObject({ pageViews: 8, uniqueUsers: 3, window: '7d' });
    expect(JSON.stringify(body)).not.toMatch(/digest|raw/i);
    expect(repositories.getAnalyticsSummary).toHaveBeenCalledWith('p1', 's1', '7d');
  });
  it('enforces project/source isolation', async () => {
    const response = await handleAdminRequest(
      request('/v1/admin/projects/p2/sources/s1/analytics?window=24h'),
      { repositories: repository() as never, adminSecret: 'secret' }
    );
    expect(response?.status).toBe(404);
  });
});
