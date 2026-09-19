import type { R2Bucket } from '../env.js';
import type { D1Repositories } from './d1-repositories.js';
import { eventObjectPrefix } from './r2-event-batches.js';

export type PurgeSummary = {
  dryRun: boolean;
  /**
   * Applied: everything purgeable is gone. Dry run: the counts are exact. When false, the work
   * exceeded one invocation's budget; rerun to continue (or, for a dry run, read the counts as
   * lower bounds).
   */
  complete: boolean;
  rows: Record<string, number>;
  objects: number;
};

/** Each D1 statement and R2 call is one operation; keeps a run under Worker subrequest limits. */
const PURGE_OPERATION_BUDGET = 40;
const R2_PAGE = 1000;

async function purgePrefix(
  bucket: R2Bucket,
  prefix: string,
  dryRun: boolean,
  budget: { remaining: number }
): Promise<{ objects: number; complete: boolean }> {
  let objects = 0;
  let cursor: string | undefined;
  for (;;) {
    // Applying deletes each page it lists, so it always relists from the start; a dry run pages on.
    if (budget.remaining < (dryRun ? 1 : 2)) return { objects, complete: false };
    budget.remaining -= 1;
    const page = await bucket.list({ prefix, limit: R2_PAGE, ...(cursor ? { cursor } : {}) });
    objects += page.objects.length;
    if (!dryRun && page.objects.length > 0) {
      budget.remaining -= 1;
      await bucket.delete(page.objects.map((object) => object.key));
    }
    if (!page.truncated) return { objects, complete: true };
    if (dryRun) cursor = page.cursor;
  }
}

/**
 * Physically removes every trace of soft-deleted websites and projects: raw event batches in R2
 * first, then their rows in D1. Objects go first because the D1 rows identify which prefixes
 * belong to deleted websites, so an interrupted run can be repeated.
 */
export async function purgeDeleted(options: {
  repositories: D1Repositories;
  bucket: R2Bucket;
  dryRun: boolean;
  operationBudget?: number;
}): Promise<PurgeSummary> {
  const { repositories, bucket, dryRun } = options;
  const budget = { remaining: options.operationBudget ?? PURGE_OPERATION_BUDGET };
  const targets = await repositories.listPurgeTargets();
  budget.remaining -= 2; // listPurgeTargets runs two queries
  const prefixes = [
    ...targets.projectIds.map((projectId) => eventObjectPrefix(projectId)),
    ...targets.sources.map((source) => eventObjectPrefix(source.projectId, source.sourceId))
  ];

  let objects = 0;
  let complete = true;
  for (const prefix of prefixes) {
    const result = await purgePrefix(bucket, prefix, dryRun, budget);
    objects += result.objects;
    if (!result.complete) {
      complete = false;
      break;
    }
  }

  if (dryRun) return { dryRun, complete, rows: await repositories.countPurgeRows(), objects };
  // Never touch the rows that identify the remaining prefixes until every object is gone.
  if (!complete) return { dryRun, complete, rows: {}, objects };
  const purged = await repositories.purgeDeletedRows(budget);
  return { dryRun, complete: purged.complete, rows: purged.rows, objects };
}
