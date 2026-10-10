import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Registry } from '../src/environments/registry.js';
import { buildSetupState, expectedSchemaFrom } from '../src/setup/state.js';
import { connectedRegistry } from './support.js';
import { stubWorker, type StubOptions } from './worker-stub.js';

afterEach(() => vi.unstubAllGlobals());

const connect = (role: 'admin' | 'owner' | 'analyst' = 'admin') => connectedRegistry({ role });
const state = async (
  registry: Registry | Promise<Registry>,
  expectedSchema: number | null = 1,
  version = '0.6.3'
) => buildSetupState({ registry: await registry, version, expectedSchema });
const withWorker = (options: StubOptions) => stubWorker(options);
const stageStatuses = (result: Awaited<ReturnType<typeof state>>) =>
  result.stages.map((item) => item.status);

describe('with a connection', () => {
  it('reports a connected admin, the principal, and the backend versions', async () => {
    withWorker({
      role: 'admin',
      workerVersion: '0.6.3',
      schemaApplied: 1,
      projects: [{ id: 'p1', name: 'Site' }],
      sources: { p1: [{ id: 's1', status: 'active' }] },
      pageViews: 12
    });
    const result = await state(connect('admin'));
    expect(result.environment).toBe('default');
    expect(result.connection).toEqual({
      status: 'connected',
      workerHost: 'worker.example.workers.dev',
      workerUrl: 'https://worker.example.workers.dev'
    });
    expect(result.principal).toMatchObject({ role: 'admin', keyLabel: null });
    expect(result.backend).toMatchObject({
      workerVersion: '0.6.3',
      schema: { applied: 1, expected: 1 },
      worker: { status: 'current' },
      schemaStatus: { status: 'current' }
    });
    expect(stageStatuses(result)).toEqual(['done', 'done', 'done', 'done']);
  });

  it('marks the website stage current when there are projects but no websites', async () => {
    withWorker({ projects: [{ id: 'p1', name: 'Site' }], sources: { p1: [] } });
    const result = await state(connect());
    expect(stageStatuses(result)).toEqual(['done', 'done', 'current', 'todo']);
    expect(result.stages[2]!.next?.id).toBe('create-project');
  });

  it('marks data current when a website has none yet, and points at its install page', async () => {
    withWorker({
      projects: [{ id: 'p1', name: 'Site' }],
      sources: { p1: [{ id: 's1' }] },
      pageViews: 0
    });
    const result = await state(connect());
    expect(stageStatuses(result)).toEqual(['done', 'done', 'done', 'current']);
    expect(result.stages[3]!.next?.href).toBe('#/manage/websites/s1/install');
  });

  it('ignores deleted projects and websites', async () => {
    withWorker({
      projects: [
        { id: 'gone', name: 'Old', status: 'deleted' },
        { id: 'p1', name: 'Site' }
      ],
      sources: { gone: [{ id: 'x' }], p1: [{ id: 's1', status: 'deleted' }] }
    });
    expect(stageStatuses(await state(connect()))).toEqual(['done', 'done', 'current', 'todo']);
  });

  it('treats a report that cannot be produced as no data yet', async () => {
    withWorker({
      projects: [{ id: 'p1', name: 'S' }],
      sources: { p1: [{ id: 's1' }] },
      failOverview: true
    });
    expect(stageStatuses(await state(connect()))).toEqual(['done', 'done', 'done', 'current']);
  });

  it('accepts a backend from before whoami and offers to update it', async () => {
    withWorker({ role: 'legacy' });
    const result = await state(connect());
    expect(result.connection.status).toBe('connected');
    expect(result.principal).toMatchObject({
      role: 'admin',
      features: { accessKeys: false, versions: false }
    });
    expect(result.backend?.worker.status).toBe('unknown');
    expect(result.backend?.worker.update).toBe('backend');
  });

  it('reports an analyst and owner from what the backend says', async () => {
    withWorker({ role: 'analyst', workerVersion: '0.6.3', schemaApplied: 1 });
    const analyst = await state(connect('analyst'));
    expect(analyst.principal?.role).toBe('analyst');
    expect(analyst.stages[2]!.next?.id).toBe('nothing-yet');
    withWorker({
      role: 'owner',
      scope: { projectId: 'p1', sourceId: 's1' },
      workerVersion: '0.6.3',
      schemaApplied: 1
    });
    const owner = await state(connect('owner'));
    expect(owner.principal).toMatchObject({
      role: 'owner',
      scope: { projectId: 'p1', sourceId: 's1' }
    });
    expect(owner.stages[2]!.next?.id).toBe('ask-admin');
  });

  it('reports unreachable when the backend does not answer, and revoked when the credential is rejected', async () => {
    withWorker({ fail: 'network' });
    const down = await state(connect());
    expect(down.connection.status).toBe('unreachable');
    expect(stageStatuses(down)).toEqual(['done', 'blocked', 'blocked', 'blocked']);
    withWorker({ fail: 500 });
    expect((await state(connect())).connection.status).toBe('unreachable');
    withWorker({ accept: ['someone-else'] });
    const revoked = await state(connect());
    expect(revoked.connection.status).toBe('revoked');
    expect(revoked.stages[1]!.status).toBe('current');
    expect(revoked.stages[1]!.next?.id).toBe('fix-environment');
  });

  it('turns a credential that stops working mid-check into revoked, and an outage into unreachable', async () => {
    const stub = withWorker({
      projects: [{ id: 'p1', name: 'S' }],
      sources: { p1: [{ id: 's1' }] }
    });
    const original = stub.fetchMock.getMockImplementation()!;
    stub.fetchMock.mockImplementation(async (input, init) =>
      String(input).endsWith('/v1/admin/projects')
        ? Response.json({}, { status: 403 })
        : original(input, init)
    );
    expect((await state(connect())).connection.status).toBe('revoked');
    stub.fetchMock.mockImplementation(async (input, init) =>
      String(input).endsWith('/v1/admin/projects')
        ? Response.json({}, { status: 500 })
        : original(input, init)
    );
    expect((await state(connect())).connection.status).toBe('unreachable');
  });

  it('is incompatible when the database is newer than this console expects', async () => {
    withWorker({ role: 'admin', workerVersion: '0.6.3', schemaApplied: 3 });
    const result = await state(connect(), 1);
    expect(result.connection.status).toBe('incompatible');
    expect(result.backend?.schemaStatus.status).toBe('console-older');
    expect(result.backend?.message).toContain('npm update -g vizoalica');
    expect(stageStatuses(result)).toEqual(['done', 'blocked', 'blocked', 'blocked']);
  });

  it('tells the admin when the backend can be updated, without blocking', async () => {
    withWorker({ workerVersion: '0.5.9', schemaApplied: 1 });
    const result = await state(connect(), 1, '0.6.3');
    expect(result.connection.status).toBe('connected');
    expect(result.backend?.worker.status).toBe('update-available');
    expect(result.backend?.message).toContain('Update the backend');
  });

  it('never exposes the credential', async () => {
    withWorker({});
    expect(JSON.stringify(await state(connect()))).not.toContain('the-credential');
  });

  it('carries on when only the version route fails', async () => {
    const stub = withWorker({ workerVersion: '0.6.3', schemaApplied: 1 });
    const original = stub.fetchMock.getMockImplementation()!;
    stub.fetchMock.mockImplementation(async (input, init) =>
      String(input).endsWith('/v1/admin/backend')
        ? Response.json({}, { status: 500 })
        : original(input, init)
    );
    const result = await state(connect());
    expect(result.connection.status).toBe('connected');
    expect(result.backend?.schema.applied).toBeNull();
  });
});

describe('expectedSchemaFrom', () => {
  it('is the highest numbered change in the directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vizoalica-schema-'));
    for (const name of ['0001_initial.sql', '0003_x.sql', '0002_y.sql', 'notes.txt', 'x_0009.sql'])
      writeFileSync(join(dir, name), '');
    expect(expectedSchemaFrom(dir)).toBe(3);
  });
  it('is null with no directory, a missing one, or no changes', () => {
    expect(expectedSchemaFrom(undefined)).toBeNull();
    expect(expectedSchemaFrom(join(tmpdir(), 'vizoalica-missing-schema'))).toBeNull();
    expect(expectedSchemaFrom(mkdtempSync(join(tmpdir(), 'vizoalica-empty-schema-')))).toBeNull();
  });
});
