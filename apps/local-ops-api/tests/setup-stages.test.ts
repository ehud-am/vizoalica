import { describe, expect, it } from 'vitest';
import { computeStages, roleFromBackend, viewRole, type StageInput } from '../src/setup/stages.js';

const base: StageInput = {
  connection: 'connected',
  role: 'admin',
  canCreate: true,
  websites: 0,
  dataArriving: false
};
const stage = (input: Partial<StageInput>, id: string) =>
  computeStages({ ...base, ...input }).find((item) => item.id === id)!;

describe('computeStages', () => {
  it('always lists the four stages in order with the console running', () => {
    const stages = computeStages({ ...base, connection: 'none' });
    expect(stages.map((item) => item.id)).toEqual(['console', 'backend', 'website', 'data']);
    expect(stages[0]!.status).toBe('done');
  });

  it('makes the backend the current stage until one is connected', () => {
    expect(computeStages({ ...base, connection: 'none' }).map((item) => item.status)).toEqual([
      'done',
      'current',
      'todo',
      'todo'
    ]);
  });

  it('moves on to the website, then to data, then finishes', () => {
    expect(computeStages(base).map((item) => item.status)).toEqual([
      'done',
      'done',
      'current',
      'todo'
    ]);
    expect(computeStages({ ...base, websites: 1 }).map((item) => item.status)).toEqual([
      'done',
      'done',
      'done',
      'current'
    ]);
    const finished = computeStages({ ...base, websites: 2, dataArriving: true });
    expect(finished.map((item) => item.status)).toEqual(['done', 'done', 'done', 'done']);
    expect(finished.some((item) => item.next)).toBe(false);
  });

  it('never marks a later stage done ahead of an earlier one', () => {
    expect(
      computeStages({ ...base, websites: 0, dataArriving: true }).map((item) => item.status)
    ).toEqual(['done', 'done', 'current', 'todo']);
  });

  it('blocks everything after the console when the backend is unreachable or incompatible', () => {
    for (const connection of ['unreachable', 'incompatible'] as const)
      expect(computeStages({ ...base, connection }).map((item) => item.status)).toEqual([
        'done',
        'blocked',
        'blocked',
        'blocked'
      ]);
  });

  it('keeps a revoked credential as the current step', () => {
    expect(stage({ connection: 'revoked' }, 'backend').status).toBe('current');
  });
});

describe('next actions', () => {
  it('follows the contract for no backend, by role', () => {
    expect(stage({ connection: 'none', role: 'admin' }, 'backend').next?.label).toBe(
      'Deploy or connect a backend'
    );
    expect(stage({ connection: 'none', role: 'owner' }, 'backend').next?.label).toBe(
      'Enter the setup details you were given'
    );
    expect(stage({ connection: 'none', role: 'analyst' }, 'backend').next?.label).toBe(
      'Enter the access key you were given'
    );
  });

  it('follows the contract when there is a backend but no website', () => {
    expect(stage({}, 'website').next).toMatchObject({
      id: 'create-project',
      href: '#/manage/projects'
    });
    expect(stage({ role: 'owner' }, 'website').next).toMatchObject({ id: 'add-website' });
    expect(stage({ role: 'owner', canCreate: false }, 'website').next?.label).toBe(
      'Ask your admin to register your website'
    );
    expect(stage({ role: 'analyst' }, 'website').next?.label).toBe(
      'Nothing to see yet. Ask your admin.'
    );
  });

  it('follows the contract when a website is registered but silent', () => {
    const input = { websites: 1, firstWebsiteId: 'site 1' };
    expect(stage({ ...input }, 'data').next).toMatchObject({
      id: 'install-website',
      href: '#/manage/websites/site%201/install'
    });
    expect(stage({ ...input, role: 'owner' }, 'data').next?.id).toBe('install-website');
    expect(stage({ websites: 1 }, 'data').next?.href).toBe('#/manage/websites');
    expect(stage({ ...input, role: 'analyst' }, 'data').next?.label).toBe(
      'Waiting for the first data.'
    );
  });

  it('explains an unreachable, incompatible, or revoked backend', () => {
    expect(stage({ connection: 'unreachable' }, 'backend').next?.id).toBe('check-backend');
    expect(stage({ connection: 'incompatible' }, 'backend').next?.label).toContain(
      'npm update -g vizoalica'
    );
    expect(stage({ connection: 'revoked', role: 'admin' }, 'backend').next?.label).toContain(
      'administrator secret'
    );
    expect(stage({ connection: 'revoked', role: 'analyst' }, 'backend').next?.label).toBe(
      'Your access was revoked. Ask your admin for a new key.'
    );
  });
});

describe('roles', () => {
  it('uses the backend role, else the remembered choice, else admin', () => {
    expect(viewRole('analyst', 'admin')).toBe('analyst');
    expect(viewRole(undefined, 'website-owner')).toBe('owner');
    expect(viewRole(undefined, 'analyst')).toBe('analyst');
    expect(viewRole(undefined, undefined)).toBe('admin');
    expect(roleFromBackend('owner')).toBe('website-owner');
    expect(roleFromBackend('analyst')).toBe('analyst');
    expect(roleFromBackend('admin')).toBe('admin');
  });
});
