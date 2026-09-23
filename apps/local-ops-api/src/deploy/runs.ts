import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Step } from './steps.js';

export type RunMode = 'first-install' | 'update-backend';
export type PlanResource = { kind: 'd1' | 'r2' | 'worker'; name: string; purpose: string };
export type Plan = {
  id: string;
  mode: RunMode;
  /** Which environment this plan belongs to; every name in it carries this prefix (research R26). */
  environment: string;
  names: { worker: string; database: string; bucket: string };
  accountId?: string;
  accountName?: string;
  resources: PlanResource[];
  createdAt: string;
};
export type RunRecord = {
  id: string;
  planId: string;
  mode: RunMode;
  environment: string;
  names: { worker: string; database: string; bucket: string };
  status: 'running' | 'done' | 'failed';
  steps: Step[];
  createdAt: string;
  finishedAt?: string;
  error?: string;
  /** Only which secrets were generated, by name; never a value. */
  result?: { workerUrl?: string; healthy?: boolean; secretNames?: string[] };
  skippedBackup?: boolean;
  /** For updates: versions before and after, the migrations applied, and the backup path (research data-model). */
  versions?: {
    before: { worker: string | null; schema: number | null };
    after: { worker: string | null; schema: number | null };
    migrationsApplied: string[];
    backupPath?: string;
    backupDeclined?: boolean;
  };
};

function runsDir(base?: string): string {
  return base ?? join(homedir(), '.config', 'vizoalica', 'deployments');
}

function writeAtomic(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

/** Run and plan records on disk, so a console restart can still show and resume a run. Never a secret. */
export class RunStore {
  constructor(private readonly base?: string) {}

  savePlan(plan: Plan): void {
    writeAtomic(join(runsDir(this.base), `${plan.id}.plan.json`), plan);
  }

  loadPlan(id: string): Plan | undefined {
    try {
      return JSON.parse(readFileSync(join(runsDir(this.base), `${id}.plan.json`), 'utf8')) as Plan;
    } catch {
      return undefined;
    }
  }

  saveRun(run: RunRecord): void {
    writeAtomic(join(runsDir(this.base), `${run.id}.json`), run);
  }

  loadRun(id: string): RunRecord | undefined {
    try {
      return JSON.parse(readFileSync(join(runsDir(this.base), `${id}.json`), 'utf8')) as RunRecord;
    } catch {
      return undefined;
    }
  }
}
