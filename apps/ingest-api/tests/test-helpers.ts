import type { CloudEvent, PageViewData, TokenClaims } from '@vizoalica/event-contracts';
import { createSignedDemoToken } from '../src/auth/token-verifier.js';
import type { Project, QuotaPolicy, Source } from '../src/domain/types.js';
import { InMemoryRepositories } from '../src/storage/memory.js';

export const now = new Date();
export const nowSeconds = Math.floor(now.getTime() / 1000);
export const secret = 'test-secret';

export const quotaPolicy: QuotaPolicy = {
  id: 'quota_1',
  maxRequestBytes: 131_072,
  maxEventsPerBatch: 25,
  maxEventsPerToken: 25,
  maxEventsPerSecond: 1_000,
  maxEventsPerDay: 100_000,
  maxPropertyCount: 25,
  maxPropertyValueLength: 256,
  retentionDays: 30
};

export const project: Project = {
  id: 'proj_1',
  name: 'Project 1',
  mode: 'production',
  defaultRetentionDays: 30,
  quotaPolicyId: quotaPolicy.id
};

export const source: Source = {
  id: 'src_1',
  projectId: project.id,
  allowedOrigins: ['https://example.com'],
  publicSourceKey: 'public_src_1',
  status: 'active'
};

export function createRepositories(
  extra?: Partial<{ project: Project; source: Source; quotaPolicy: QuotaPolicy }>
): InMemoryRepositories {
  return new InMemoryRepositories({
    projects: [extra?.project ?? project],
    sources: [extra?.source ?? source],
    quotaPolicies: [extra?.quotaPolicy ?? quotaPolicy]
  });
}

export function pageViewEvent(id = 'evt_12345678'): CloudEvent<PageViewData> {
  return {
    specversion: '1.0',
    id,
    type: 'com.vizoalica.page_view.v1',
    source: 'https://example.com',
    subject: 'source/src_1/session/sess_1',
    time: now.toISOString(),
    datacontenttype: 'application/json',
    vizoalicaconsent: 'analytics-granted',
    data: {
      page: {
        url_origin: 'https://example.com',
        url_path: '/pricing',
        url_query_redacted: true,
        title: null
      },
      visitor: { anonymous_id: 'anon_1' },
      session: { id: 'sess_1' }
    }
  };
}

export function token(overrides: Partial<TokenClaims> = {}): string {
  return createSignedDemoToken(
    {
      iss: 'test',
      aud: 'vizoalica-ingest',
      sub: 'session/sess_1',
      project_id: project.id,
      source_id: source.id,
      origin: 'https://example.com',
      scope: 'events:write',
      iat: nowSeconds - 1,
      nbf: nowSeconds - 1,
      exp: nowSeconds + 300,
      jti: 'jti_1',
      max_events: 25,
      ...overrides
    },
    secret
  );
}
