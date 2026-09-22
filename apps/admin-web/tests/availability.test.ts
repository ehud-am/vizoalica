import { describe, expect, it } from 'vitest';
import type { SetupState, ViewRole } from '../src/api/local-operations.js';
import { CAPABILITIES, type CapabilityId } from '../src/capabilities.js';
import { availability, isAbsent } from '../src/setup/availability.js';

const state = (overrides: Partial<SetupState> = {}, role: ViewRole = 'admin'): SetupState => ({
  version: '0.6.3',
  needsFirstRun: false,
  connection: { status: 'connected' },
  principal: {
    role,
    scope: { projectId: null, sourceId: null },
    keyLabel: null,
    features: { accessKeys: true, versions: true }
  },
  stages: [],
  ...overrides
});
const of = (id: CapabilityId, s = state(), context = {}) => availability(s, id, context);
const scoped = (role: ViewRole, projectId: string | null, sourceId: string | null) => {
  const base = state({}, role);
  return { ...base, principal: { ...base.principal!, scope: { projectId, sourceId } } };
};
const ids = (cls: string) => CAPABILITIES.filter((c) => c.class === cls).map((c) => c.id);

describe('availability', () => {
  it('holds nothing back when there is no setup state', () => {
    for (const capability of CAPABILITIES)
      expect(availability(undefined, capability.id).available).toBe(true);
  });

  it('never restricts viewing, whatever the role or the connection', () => {
    for (const id of ids('view'))
      for (const s of [
        state(),
        state({}, 'analyst'),
        state({ connection: { status: 'none' } }),
        state({}, 'owner')
      ])
        expect(of(id as CapabilityId, s).available, id).toBe(true);
  });

  it('lets an admin do everything on a connected backend', () => {
    for (const capability of CAPABILITIES)
      expect(of(capability.id).available, capability.id).toBe(true);
  });

  it('says to connect a backend first, with where to go, before one exists', () => {
    for (const id of [...ids('operate'), ...ids('backend')] as CapabilityId[]) {
      const result = of(id, state({ connection: { status: 'none' } }));
      expect(result.available).toBe(false);
      expect(result.reason).toBe('Connect or deploy a backend first.');
      expect(result.next).toEqual({ label: 'Connect a backend', href: '#/setup' });
    }
  });

  it('explains an unreachable, revoked, or incompatible backend', () => {
    expect(of('create-project', state({ connection: { status: 'unreachable' } })).reason).toBe(
      'The backend is not answering. Check it and retry.'
    );
    expect(
      of('create-project', state({ connection: { status: 'revoked' } }, 'analyst')).reason
    ).toBe('Your access was revoked. Ask your admin for a new key.');
    expect(of('create-project', state({ connection: { status: 'revoked' } })).reason).toContain(
      'credential was rejected'
    );
    expect(
      of(
        'create-project',
        state({ connection: { status: 'revoked', roleHint: 'admin' } }, 'analyst')
      ).reason
    ).toContain('credential was rejected');
    const incompatible = of('create-project', state({ connection: { status: 'incompatible' } }));
    expect(incompatible.reason).toContain('npm update -g vizoalica');
    expect(incompatible.next).toBeUndefined();
  });

  it('makes everything read-only for an analyst', () => {
    for (const id of [...ids('operate'), ...ids('backend')] as CapabilityId[])
      expect(of(id, state({}, 'analyst'))).toEqual({
        available: false,
        reason: 'Your access is read-only.'
      });
  });

  it('lets a website owner manage projects and websites but never the backend', () => {
    const owner = state({}, 'owner');
    for (const id of ids('operate') as CapabilityId[])
      expect(of(id, owner).available, id).toBe(true);
    for (const id of ids('backend') as CapabilityId[])
      expect(of(id, owner)).toEqual({
        available: false,
        reason: 'Only an admin can change the backend.'
      });
  });

  it('limits what an owner can create to the key scope', () => {
    const everything = scoped('owner', null, null);
    expect(of('create-project', everything).available).toBe(true);
    expect(of('add-website', everything).available).toBe(true);
    const oneProject = scoped('owner', 'p1', null);
    expect(of('create-project', oneProject).reason).toBe(
      'Your access does not allow creating this here.'
    );
    expect(of('add-website', oneProject).available).toBe(true);
    expect(of('delete-project', oneProject).available).toBe(true);
    const oneWebsite = scoped('owner', 'p1', 's1');
    expect(of('create-project', oneWebsite).available).toBe(false);
    expect(of('add-website', oneWebsite).reason).toBe(
      'Your access does not allow creating this here.'
    );
    expect(of('delete-project', oneWebsite).available).toBe(false);
    for (const id of ['edit-website', 'toggle-website', 'delete-website'] as const)
      expect(of(id, oneWebsite).available, id).toBe(true);
  });

  it('asks for a project before a website, with a way to make one', () => {
    const result = of('add-website', state(), { hasProject: false });
    expect(result).toEqual({
      available: false,
      reason: 'Create a project first.',
      next: { label: 'Create a project', href: '#/manage/projects' }
    });
    expect(of('add-website', state(), { hasProject: true }).available).toBe(true);
  });

  it('holds back key management on a backend that predates keys', () => {
    const old = state();
    old.principal!.features = { accessKeys: false, versions: false };
    for (const id of ['manage-access-keys', 'share-website-setup'] as const)
      expect(of(id, old).reason).toBe('This backend needs an update before it can issue keys.');
    expect(of('rotate-secret', old).available).toBe(true);
  });

  it('holds back backend changes when the backend is newer than the console', () => {
    const newer = state({
      backend: {
        workerVersion: '0.9.0',
        schema: { applied: 1, expected: 1 },
        worker: { status: 'console-older', message: '', update: 'console' },
        schemaStatus: { status: 'current', message: '', update: null },
        message: ''
      }
    });
    expect(of('update-backend', newer).reason).toContain('npm update -g vizoalica');
    expect(of('create-project', newer).available).toBe(true);
  });

  it('treats a missing principal as an admin on a connected backend', () => {
    const withoutPrincipal = { ...state(), principal: undefined };
    expect(availability(withoutPrincipal, 'create-project').available).toBe(true);
  });
});

describe('isAbsent', () => {
  it('removes the surfaces only an admin can use for other roles', () => {
    expect(isAbsent(state({}, 'analyst'), 'deploy-backend')).toBe(true);
    expect(isAbsent(state({}, 'owner'), 'manage-access-keys')).toBe(true);
    expect(isAbsent(state({}, 'admin'), 'deploy-backend')).toBe(false);
    expect(isAbsent(state({}, 'analyst'), 'rotate-secret')).toBe(false);
    expect(isAbsent(undefined, 'deploy-backend')).toBe(false);
    expect(
      isAbsent(state({ connection: { status: 'none' }, principal: undefined }), 'deploy-backend')
    ).toBe(false);
  });
});
