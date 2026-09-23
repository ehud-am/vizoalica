import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RunStore, type Plan, type RunRecord } from '../src/deploy/runs.js';

const dir = () => mkdtempSync(join(tmpdir(), 'vizoalica-runs-'));

describe('RunStore', () => {
  it('saves and loads a plan and a run', () => {
    const store = new RunStore(dir());
    const plan: Plan = {
      id: 'p1',
      mode: 'first-install',
      environment: 'stage',
      names: { worker: 'stage-w', database: 'stage-d', bucket: 'stage-b' },
      resources: [],
      createdAt: '2026-01-01T00:00:00.000Z'
    };
    store.savePlan(plan);
    expect(store.loadPlan('p1')).toEqual(plan);

    const run: RunRecord = {
      id: 'r1',
      planId: 'p1',
      mode: 'first-install',
      environment: 'stage',
      names: plan.names,
      status: 'running',
      steps: [],
      createdAt: '2026-01-01T00:00:00.000Z'
    };
    store.saveRun(run);
    expect(store.loadRun('r1')).toEqual(run);
  });

  it('returns undefined for a plan or a run that was never saved', () => {
    const store = new RunStore(dir());
    expect(store.loadPlan('missing')).toBeUndefined();
    expect(store.loadRun('missing')).toBeUndefined();
  });
});
