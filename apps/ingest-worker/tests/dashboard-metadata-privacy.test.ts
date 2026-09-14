import { createSignedDemoToken } from '../../ingest-api/src/auth/token-verifier.js';
import { describe, expect, it } from 'vitest';
import { classifyRequest } from '../src/analytics/classifier.js';
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

type Call = { query: string; values: unknown[] };

function database(calls: Call[]): D1Database {
  const project = {
    id: 'project-a',
    name: 'Project A',
    mode: 'production',
    default_retention_days: 90,
    quota_policy_id: 'quota-a',
    status: 'active'
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
      let values: unknown[] = [];
      const statement: D1Statement = {
        bind: (...next) => {
          values = next;
          calls.push({ query, values });
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
        async all() {
          return { results: [] };
        },
        async run() {
          return {};
        }
      };
      return statement;
    },
    async batch(statements) {
      for (const statement of statements) await statement.run();
      return statements.map(() => ({ meta: {} }));
    }
  };
}

const RAW_MARKER = 'RAW-FINGERPRINT-MARKER-9f8e7d6c';
const SPOOFED_COUNTRY = 'FAKE-SPOOFED-COUNTRY';
const SPOOFED_IP = '203.0.113.42';

async function postEvent(env: Env, headers: Record<string, string>) {
  const event = {
    specversion: '1.0',
    id: 'event-privacy-1',
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
  return worker.fetch(
    new Request('https://ingest.test/v1/events:batch', {
      method: 'POST',
      headers: {
        origin: 'https://example.test',
        authorization: `Bearer ${createSignedDemoToken(claims, 'test-secret')}`,
        'x-vizoalica-source': 'public-a',
        'content-type': 'application/cloudevents-batch+json',
        ...headers
      },
      body: JSON.stringify([event])
    }),
    env
  );
}

describe('dashboard metadata privacy', () => {
  it('never writes a spoofed CF-IPCountry, raw User-Agent, or forwarded-IP header into D1 dimension binds', async () => {
    const calls: Call[] = [];
    const writes: Array<{ key: string; value: string }> = [];
    const env: Env = {
      VIZOALICA_DB: database(calls),
      VIZOALICA_EVENTS: {
        async put(key, value) {
          writes.push({ key, value: String(value) });
        }
      } as R2Bucket,
      VIZOALICA_TOKEN_SECRET: 'test-secret',
      VIZOALICA_ADMIN_SECRET: 'admin-secret',
      VIZOALICA_ANALYTICS_DIGEST_SECRET: 'analytics-digest-secret'
    };
    const response = await postEvent(env, {
      'user-agent': `Mozilla/5.0 ${RAW_MARKER}`,
      'x-forwarded-for': SPOOFED_IP,
      'cf-connecting-ip': SPOOFED_IP,
      'cf-ipcountry': SPOOFED_COUNTRY
    });
    const body = await response.text();
    expect(response.status, body).toBe(202);

    const dimensionCalls = calls.filter((call) =>
      call.query.includes('dashboard_minute_dimensions')
    );
    expect(dimensionCalls.length).toBeGreaterThan(0);
    for (const call of dimensionCalls) {
      const serialized = JSON.stringify(call.values);
      expect(serialized).not.toContain(RAW_MARKER);
      expect(serialized).not.toContain(SPOOFED_COUNTRY);
      expect(serialized).not.toContain(SPOOFED_IP);
    }

    for (const call of calls) {
      const serialized = JSON.stringify(call.values);
      expect(serialized).not.toContain(SPOOFED_IP);
    }

    for (const write of writes) {
      expect(write.value).not.toContain(RAW_MARKER);
      expect(write.value).not.toContain(SPOOFED_IP);
    }
    expect(body).not.toContain(RAW_MARKER);
    expect(body).not.toContain(SPOOFED_IP);
  });

  it('never persists a bot-management score, verifiedBot flag, or signedAgent flag verbatim into dimension binds', async () => {
    const calls: Call[] = [];
    const env: Env = {
      VIZOALICA_DB: database(calls),
      VIZOALICA_EVENTS: { async put() {} } as R2Bucket,
      VIZOALICA_TOKEN_SECRET: 'test-secret',
      VIZOALICA_ADMIN_SECRET: 'admin-secret',
      VIZOALICA_ANALYTICS_DIGEST_SECRET: 'analytics-digest-secret'
    };
    const response = await postEvent(env, { 'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0' });
    expect(response.status).toBe(202);
    const dimensionCalls = calls.filter((call) =>
      call.query.includes('dashboard_minute_dimensions')
    );
    const trafficDimension = dimensionCalls.find((call) => call.values.includes('traffic'));
    expect(trafficDimension?.values).toEqual(
      expect.arrayContaining([expect.stringMatching(/^(bot|human|unknown)$/)])
    );
  });

  it('classifyRequest ignores forwarded-IP style headers entirely, taking country only from the trusted cf object', () => {
    const withoutSpoofedIp = new Request('https://ingest.test/v1/events:batch', {
      headers: { 'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0' }
    });
    const withSpoofedIp = new Request('https://ingest.test/v1/events:batch', {
      headers: {
        'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0',
        'x-forwarded-for': SPOOFED_IP,
        'cf-connecting-ip': SPOOFED_IP,
        'cf-ipcountry': SPOOFED_COUNTRY
      }
    });
    expect(classifyRequest(withoutSpoofedIp)).toEqual(classifyRequest(withSpoofedIp));
  });

  it('only ever emits taxonomy-whitelisted values, never a raw header echoed back', () => {
    const req = new Request('https://ingest.test/v1/events:batch', {
      headers: { 'user-agent': `${RAW_MARKER}/1.0` }
    });
    Object.defineProperty(req, 'cf', { value: { country: SPOOFED_COUNTRY } });
    const result = classifyRequest(req);
    expect(JSON.stringify(result)).not.toContain(RAW_MARKER);
    expect(JSON.stringify(result)).not.toContain(SPOOFED_COUNTRY);
    expect(result.country).toBe('Unknown');
  });
});
