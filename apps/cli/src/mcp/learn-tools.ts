import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorkerClient } from '../../../local-ops-api/src/remote-client/worker-client.js';
import { workerJson } from '../../../local-ops-api/src/routes/websites.js';
import {
  emptySketch,
  mergeSketches,
  type Sketch
} from '../../../ingest-api/src/spec/learn-sketch.js';
import { parseSiteSpec, type Decision } from '../../../ingest-api/src/spec/site-spec.js';
import { filesToSpec, SPEC_FILES } from '../../../ingest-api/src/spec/spec-files.js';

/** A learning run: the merged sketch of a website's newest raw events, kept in memory only. */
export type LearnRun = {
  id: string;
  environment: string;
  base: string;
  website: string;
  sketch: Sketch;
  cursor?: string | undefined;
  done: boolean;
  calls: number;
  startedAt: number;
};

const MAX_RUNS = 4;

export class LearnRuns {
  private readonly runs = new Map<string, LearnRun>();
  create(init: Omit<LearnRun, 'id' | 'sketch' | 'done' | 'calls' | 'startedAt'>): LearnRun {
    const run: LearnRun = {
      ...init,
      id: `run-${randomUUID().slice(0, 8)}`,
      sketch: emptySketch(),
      done: false,
      calls: 0,
      startedAt: Date.now()
    };
    this.runs.set(run.id, run);
    while (this.runs.size > MAX_RUNS) this.runs.delete(this.runs.keys().next().value as string);
    return run;
  }
  get(id: string): LearnRun | undefined {
    return this.runs.get(id);
  }
}

type SliceResponse = { sketch: Sketch; objects: number; cursor?: string; done: boolean };

/**
 * Reads slices until `targetEvents` events are summarised, the newest data is exhausted, or the
 * time budget is spent (the run can then be continued). The backend reads at most a few dozen
 * stored batches per call, so a deep run is many small calls.
 */
export async function collect(
  client: WorkerClient,
  run: LearnRun,
  targetEvents: number,
  budgetMs: number,
  now: () => number = Date.now
): Promise<void> {
  const stop = now() + budgetMs;
  while (!run.done && run.sketch.events < targetEvents && now() < stop) {
    const query = run.cursor ? `?cursor=${encodeURIComponent(run.cursor)}` : '';
    const slice = (await workerJson(client, `${run.base}/learn/sample${query}`)) as SliceResponse;
    run.sketch = mergeSketches(run.sketch, slice.sketch);
    run.calls += 1;
    run.cursor = slice.cursor;
    run.done = slice.done;
  }
}

/** The decisions in a local spec folder (read-only); undefined when there is none. */
export function localSpec(
  specDir: string | undefined
): { decisions: Decision[]; found: true } | { found: false; problem?: string } {
  if (!specDir) return { found: false };
  const folder = resolve(specDir);
  if (!existsSync(join(folder, 'spec.json')))
    return { found: false, problem: `${folder} has no spec.json.` };
  const files: Record<string, string> = {};
  for (const name of SPEC_FILES) {
    const path = join(folder, name);
    if (existsSync(path)) files[name] = readFileSync(path, 'utf8');
  }
  const parsed = filesToSpec(files);
  if (!parsed.ok)
    return {
      found: false,
      // Not the errors themselves: they quote values, and this folder was named by the assistant.
      problem: `The spec in ${folder} is not valid (${parsed.errors.length} problems). Run: vizoalica spec validate ${folder}`
    };
  return { decisions: parsed.spec.decisions, found: true };
}

export type StoredSpecResponse = {
  version: number;
  contentHash?: string;
  spec?: unknown;
  renderedMd?: string;
  gitSha?: string;
  appliedAt?: string;
  appliedBy?: string;
};

export async function backendSpec(client: WorkerClient, base: string) {
  const stored = (await workerJson(client, `${base}/spec`)) as StoredSpecResponse;
  const parsed = stored.version ? parseSiteSpec(stored.spec) : undefined;
  return { stored, spec: parsed?.ok ? parsed.spec : undefined };
}
