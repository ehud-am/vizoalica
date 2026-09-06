import { describe, expect, it, vi } from 'vitest';
import { authorizeSource } from '../../src/auth/source-authorizer.js';
import {
  isEventTimeAcceptable,
  validateTokenConstraints
} from '../../src/auth/token-constraints.js';
import { healthResponse } from '../../src/http/health.js';
import { consoleLogger, InMemoryMetricsSink } from '../../src/observability/index.js';
import { recordIngestionDecision } from '../../src/observability/metrics.js';
import { InMemoryRepositories } from '../../src/storage/memory.js';
import { project, quotaPolicy, source } from '../test-helpers.js';

const claims = {
  iss: 'x',
  aud: 'vizoalica-ingest',
  sub: 'x',
  project_id: 'proj_1',
  source_id: 'src_1',
  origin: 'https://example.com',
  scope: 'events:write',
  iat: 1,
  nbf: 1,
  exp: 9999999999,
  jti: 'x'
} as const;
describe('ingestion edge branches', () => {
  it('reports every source authorization denial and origin fallback', async () => {
    const repo = (sourceValue: unknown = source, projectValue: unknown = project) => ({
      findSourceByPublicKey: vi.fn(async () => sourceValue),
      findProject: vi.fn(async () => projectValue)
    });
    expect(
      await authorizeSource({ repositories: repo(null) as never, publicSourceKey: 'x' })
    ).toMatchObject({ reason: 'source_not_found' });
    expect(
      await authorizeSource({
        repositories: repo({ ...source, status: 'disabled' }) as never,
        publicSourceKey: 'x'
      })
    ).toMatchObject({ reason: 'source_disabled' });
    expect(
      await authorizeSource({ repositories: repo(source, null) as never, publicSourceKey: 'x' })
    ).toMatchObject({ reason: 'project_not_found' });
    expect(
      await authorizeSource({
        repositories: repo() as never,
        publicSourceKey: 'x',
        claims: { ...claims, project_id: 'other' }
      })
    ).toMatchObject({ reason: 'token_source_mismatch' });
    expect(
      await authorizeSource({
        repositories: repo() as never,
        publicSourceKey: 'x',
        origin: 'https://evil.test'
      })
    ).toMatchObject({ reason: 'origin_not_allowed' });
    expect(
      await authorizeSource({ repositories: repo() as never, publicSourceKey: 'x', claims })
    ).toMatchObject({ ok: true });
  });
  it('covers every token constraint and event-time boundary', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const seconds = now.getTime() / 1000;
    const run = (overrides = {}, extra = {}) =>
      validateTokenConstraints({
        claims: { ...claims, nbf: seconds - 1, exp: seconds + 1, ...overrides },
        now,
        eventCount: 1,
        ...extra
      });
    expect(run({ nbf: seconds + 1 })).toMatchObject({ reason: 'token_not_yet_valid' });
    expect(run({ exp: seconds })).toMatchObject({ reason: 'token_expired' });
    expect(run({ scope: 'read' })).toMatchObject({ reason: 'token_scope_invalid' });
    expect(run({}, { origin: 'https://evil.test' })).toMatchObject({
      reason: 'token_origin_mismatch'
    });
    expect(run({ max_events: 1 }, { eventCount: 2 })).toMatchObject({
      reason: 'token_event_limit_exceeded'
    });
    expect(run()).toEqual({ ok: true });
    expect(
      validateTokenConstraints({ claims: { ...claims, nbf: 0, exp: 9999999999 }, eventCount: 1 })
    ).toEqual({ ok: true });
    expect(isEventTimeAcceptable('bad', now)).toBe(false);
    expect(isEventTimeAcceptable('2025-12-30T00:00:00Z', now)).toBe(false);
    expect(isEventTimeAcceptable('2026-01-01T01:00:00Z', now)).toBe(false);
    expect(isEventTimeAcceptable(now.toISOString(), now)).toBe(true);
  });
  it('covers in-memory filtering, metrics defaults, logging, and health', async () => {
    const repositories = new InMemoryRepositories({
      projects: [project],
      sources: [source],
      quotaPolicies: [quotaPolicy]
    });
    const event = { projectId: 'proj_1', sourceId: 'src_1' } as never;
    await repositories.saveAcceptedEvents([event]);
    await repositories.saveDecision({
      projectId: 'proj_1',
      decision: 'rejected',
      reasonCodes: ['bad'],
      acceptedCount: 0,
      rejectedCount: 1,
      receivedAt: new Date()
    });
    expect(await repositories.listAcceptedEvents()).toHaveLength(1);
    expect(await repositories.listAcceptedEvents('other')).toHaveLength(0);
    expect(await repositories.listDecisions()).toHaveLength(1);
    expect(await repositories.listDecisions('other')).toHaveLength(0);
    const metrics = new InMemoryMetricsSink();
    metrics.increment('plain');
    metrics.increment('plain');
    metrics.increment('labeled', { a: 'b', empty: undefined }, 2);
    recordIngestionDecision(metrics, {
      decision: 'rejected',
      reasonCodes: ['bad'],
      acceptedCount: 0,
      rejectedCount: 1,
      receivedAt: new Date()
    });
    expect(metrics.counters.get('plain')).toBe(2);
    expect(metrics.counters.get('labeled{a=b}')).toBe(2);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    consoleLogger.info('i');
    consoleLogger.warn('w');
    consoleLogger.error('e');
    expect(info).toHaveBeenCalledWith('i', {});
    expect(warn).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    await expect(healthResponse().json()).resolves.toEqual({
      ok: true,
      service: 'vizoalica-ingest-api'
    });
  });
});
