import type { Mock } from 'vitest';
import { makeOverview, primaryIntegration } from './console.js';

export type ApiMocks = Record<string, Mock>;

export const acme = { id: 'p1', name: 'Acme' };
export const beta = { id: 'p2', name: 'Beta' };

export const site = (
  id: string,
  projectId: string,
  name: string,
  overrides: Record<string, unknown> = {}
) => ({
  id,
  projectId,
  name,
  publicSourceKey: `key-${id}`,
  allowedOrigins: [`https://${id}.test`],
  status: 'active' as const,
  ...overrides
});

export const docs = site('s1', 'p1', 'Docs');
export const blog = site('s2', 'p1', 'Blog', { status: 'disabled' });
export const shop = site('s3', 'p2', 'Shop');

/** Sensible answers for every console API call; tests override what they care about. */
export function applyApiDefaults(api: ApiMocks, websitesByProject: Record<string, unknown[]>) {
  api.bootstrapSession?.mockResolvedValue(undefined);
  api.listProjects?.mockResolvedValue([acme, beta]);
  api.listWebsites?.mockImplementation(
    async (projectId: string) => websitesByProject[projectId] ?? []
  );
  api.getSnippet?.mockResolvedValue(primaryIntegration);
  api.getStatus?.mockResolvedValue({
    collection: 'healthy',
    aggregation: 'available',
    configuration: 'healthy',
    dataAccess: 'available'
  });
  api.getReachability?.mockResolvedValue({
    configEndpointReachable: true,
    configEndpointCheckedAt: '2026-01-01T00:00:00.000Z',
    configEndpointError: null
  });
  api.getAnalyticsOverview?.mockResolvedValue(makeOverview());
  api.updateWebsite?.mockResolvedValue(docs);
  api.createWebsite?.mockResolvedValue(docs);
  api.deleteWebsite?.mockResolvedValue({ status: 'deleted', audit: 'recorded' });
}
