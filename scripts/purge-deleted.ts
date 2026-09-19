/** Physically purges soft-deleted websites and projects from a deployed Worker. */
export type PurgeReport = {
  dryRun: boolean;
  complete: boolean;
  rows: Record<string, number>;
  objects: number;
};

const MAX_RUNS = 100;

export async function purgeDeleted(
  workerOrigin: string,
  authorization: string,
  apply: boolean,
  send: typeof fetch = fetch
): Promise<PurgeReport[]> {
  const url = new URL(workerOrigin);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash)
    throw new Error('Worker origin must be an HTTPS origin with no path, query, or fragment.');
  const reports: PurgeReport[] = [];
  // One invocation is bounded; an applied purge repeats until the Worker reports it finished.
  for (let run = 0; run < (apply ? MAX_RUNS : 1); run += 1) {
    const response = await send(`${url.origin}/v1/admin/purge-deleted`, {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ dryRun: !apply }),
      signal: AbortSignal.timeout(60_000)
    });
    if (response.status !== 200) throw new Error(`Purge failed with HTTP ${response.status}.`);
    const report = (await response.json().catch(() => undefined)) as PurgeReport | undefined;
    if (!report || typeof report.complete !== 'boolean' || typeof report.rows !== 'object')
      throw new Error('Purge returned an unexpected response.');
    reports.push(report);
    if (report.complete || !apply) return reports;
  }
  throw new Error(`Purge did not finish after ${MAX_RUNS} runs; rerun to continue.`);
}

export function formatReport(reports: readonly PurgeReport[]): string {
  const first = reports[0];
  if (!first) return 'Nothing was purged.\n';
  const rows: Record<string, number> = {};
  let objects = 0;
  for (const report of reports) {
    objects += report.objects;
    for (const [table, count] of Object.entries(report.rows))
      rows[table] = (rows[table] ?? 0) + count;
  }
  const lines = Object.entries(rows).map(([table, count]) => `  ${table}: ${count}`);
  const last = reports[reports.length - 1]!;
  return [
    first.dryRun ? 'Dry run — nothing was deleted. Would remove:' : 'Purged:',
    ...lines,
    `  R2 event objects: ${objects}`,
    first.dryRun && !last.complete
      ? 'Counts are lower bounds; the run exceeded one invocation budget.'
      : '',
    first.dryRun ? 'Rerun with --apply to delete permanently.' : ''
  ]
    .filter(Boolean)
    .join('\n')
    .concat('\n');
}

const isEntryPoint = process.argv[1]?.endsWith('/scripts/purge-deleted.ts');
if (isEntryPoint) {
  const [origin, mode] = process.argv.slice(2);
  if (!origin) throw new Error('Worker origin is required.');
  purgeDeleted(origin, 'Bearer onecli-managed', mode === '--apply')
    .then((reports) => process.stdout.write(formatReport(reports)))
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : 'Purge failed.'}\n`);
      process.exitCode = 1;
    });
}
