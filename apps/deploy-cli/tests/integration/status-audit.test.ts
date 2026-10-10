import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendAudit, auditPathFor, auditRecord, readAudit } from '../../src/audit.js';
import { result } from '../../src/cli.js';
import { deploymentStatus } from '../../src/commands/status.js';
import { temporaryDeployment } from '../support.js';

describe('safe local status and audit', () => {
  it('serializes only allowlisted metadata with user-only permissions', async () => {
    const fixture = await temporaryDeployment();
    const path = auditPathFor(fixture.profilePath);
    const record = auditRecord(
      fixture.profile,
      result('apply', { planId: 'safe-plan' }),
      'operator'
    );
    expect(record).not.toHaveProperty('token');
    await appendAudit(path, record, 90, fixture.context.now());
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    await expect(readAudit(path)).resolves.toHaveLength(1);
    await expect(
      deploymentStatus({ profile: fixture.profilePath }, fixture.context)
    ).resolves.toMatchObject({
      planId: 'safe-plan',
      details: { action: 'apply' }
    });
    expect(
      auditRecord(fixture.profile, result('apply', { status: 'denied' }), 'operator').action
    ).toBe('deny');
    expect(
      auditRecord(fixture.profile, result('apply', { status: 'interrupted' }), 'operator').action
    ).toBe('interrupt');
  });

  it('prunes expired records and ignores malformed lines', async () => {
    const fixture = await temporaryDeployment();
    const path = join(fixture.directory, 'audit.ndjson');
    const old = auditRecord(
      fixture.profile,
      result('plan', { occurredAt: '2020-01-01T00:00:00Z' }),
      'operator'
    );
    const current = auditRecord(
      fixture.profile,
      result('check', { occurredAt: '2026-09-07T12:00:00Z' }),
      'operator'
    );
    await appendAudit(path, old, 90, fixture.context.now());
    await appendAudit(path, current, 90, fixture.context.now());
    const records = await readAudit(path);
    expect(records).toEqual([current]);
  });
});
