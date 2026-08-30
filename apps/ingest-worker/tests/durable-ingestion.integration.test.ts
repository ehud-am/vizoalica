import { createSignedDemoToken } from '../../ingest-api/src/auth/token-verifier.js';
import { describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import type { D1Database, D1Statement, Env, R2Bucket } from '../src/env.js';

const now = new Date();
const claims = {
  iss: 'test',
  aud: 'vizoalica-ingest' as const,
  sub: 'source',
  project_id: 'project-a',
  source_id: 'source-a',
  origin: 'https://example.test',
  scope: 'events:write' as const,
  iat: Math.floor(now.getTime() / 1000) - 1,
  nbf: Math.floor(now.getTime() / 1000) - 1,
  exp: Math.floor(now.getTime() / 1000) + 60,
  jti: 'test-token'
};

function database(queries: string[]): D1Database {
  const project = {
    id: 'project-a',
    name: 'Project A',
    mode: 'production',
    default_retention_days: 90,
    quota_policy_id: 'quota-a'
  };
  const source = {
    id: 'source-a',
    project_id: 'project-a',
    public_source_key: 'public-a',
    allowed_origins_json: '["https://example.test"]',
    status: 'active'
  };
  const quota = {
    id: 'quota-a',
    max_request_bytes: 131072,
    max_events_per_batch: 25,
    max_events_per_token: 25,
    max_events_per_second: 100,
    max_events_per_day: 1000,
    max_property_count: 20,
    max_property_value_length: 256,
    retention_days: 90
  };
  return {
    prepare(query: string): D1Statement {
      queries.push(query);
      let values: unknown[] = [];
      const statement: D1Statement = {
        bind: (...next) => {
          values = next;
          return statement;
        },
        async first() {
          if (query.includes('projects'))
            return (values[0] === 'project-a' ? project : null) as never;
          if (query.includes('sources')) return (values[0] === 'public-a' ? source : null) as never;
          if (query.includes('quota_policies'))
            return (values[0] === 'quota-a' ? quota : null) as never;
          return null;
        },
        async run() {
          return {};
        }
      };
      return statement;
    }
  };
}

describe('Cloudflare Worker durable ingestion', () => {
  it('acknowledges only after writing a signed batch to R2', async () => {
    const writes: Array<{ key: string; value: string; metadata?: Record<string, string> }> = [];
    const bucket: R2Bucket = {
      async put(key, value, options) {
        writes.push(
          options?.customMetadata
            ? { key, value, metadata: options.customMetadata }
            : { key, value }
        );
      }
    };
    const queries: string[] = [];
    const env: Env = {
      VIZOALICA_DB: database(queries),
      VIZOALICA_EVENTS: bucket,
      VIZOALICA_TOKEN_SECRET: 'test-secret'
    };
    const event = {
      specversion: '1.0',
      id: 'event-abc',
      type: 'com.vizoalica.page_view.v1',
      source: 'https://example.test',
      subject: 'source/public-a',
      time: now.toISOString(),
      datacontenttype: 'application/json',
      data: {
        page: {
          url_origin: 'https://example.test',
          url_path: '/',
          url_query_redacted: true,
          title: null
        },
        visitor: { anonymous_id: 'anon-a' },
        session: { id: 'session-a' }
      }
    };
    const response = await worker.fetch(
      new Request('https://ingest.test/v1/events:batch', {
        method: 'POST',
        headers: {
          origin: 'https://example.test',
          authorization: `Bearer ${createSignedDemoToken(claims, 'test-secret')}`,
          'x-vizoalica-source': 'public-a',
          'content-type': 'application/cloudevents-batch+json'
        },
        body: JSON.stringify([event])
      }),
      env
    );
    const body = await response.text();
    expect(response.status, body).toBe(202);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.key).toMatch(/^events\/project-a\/source-a\//);
    expect(writes[0]?.metadata).toMatchObject({
      project: 'project-a',
      source: 'source-a',
      count: '1'
    });
    expect(queries.some((query) => query.includes('dashboard_rollups'))).toBe(true);
  });
});
