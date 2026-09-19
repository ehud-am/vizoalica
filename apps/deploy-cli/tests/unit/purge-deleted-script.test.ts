import { describe, expect, it } from 'vitest';
import { formatReport, purgeDeleted } from '../../../../scripts/purge-deleted.js';

const respond = (reports: unknown[]) => {
  const bodies: unknown[] = [];
  const send = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return Response.json(reports.shift());
  }) as unknown as typeof fetch;
  return { send, bodies };
};

describe('purge-deleted script', () => {
  it('requests a single dry run unless --apply is given', async () => {
    const { send, bodies } = respond([
      { dryRun: true, complete: false, rows: { sources: 2 }, objects: 3 }
    ]);
    const reports = await purgeDeleted('https://w.example', 'Bearer x', false, send);
    expect(bodies).toEqual([{ dryRun: true }]);
    expect(reports).toHaveLength(1);
    expect(formatReport(reports)).toContain('Dry run — nothing was deleted');
    expect(formatReport(reports)).toContain('lower bounds');
  });

  it('repeats an applied purge until the Worker reports completion and totals the runs', async () => {
    const { send, bodies } = respond([
      { dryRun: false, complete: false, rows: { sources: 0 }, objects: 5 },
      { dryRun: false, complete: true, rows: { sources: 2 }, objects: 1 }
    ]);
    const reports = await purgeDeleted('https://w.example', 'Bearer x', true, send);
    expect(bodies).toEqual([{ dryRun: false }, { dryRun: false }]);
    expect(formatReport(reports)).toContain('sources: 2');
    expect(formatReport(reports)).toContain('R2 event objects: 6');
  });

  it('rejects a non-HTTPS origin and failed responses', async () => {
    await expect(purgeDeleted('http://w.example', 'Bearer x', false)).rejects.toThrow('HTTPS');
    const failing = (async () => new Response('', { status: 401 })) as unknown as typeof fetch;
    await expect(purgeDeleted('https://w.example', 'Bearer x', true, failing)).rejects.toThrow(
      'HTTP 401'
    );
  });
});
