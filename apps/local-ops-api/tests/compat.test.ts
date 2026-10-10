import { describe, expect, it } from 'vitest';
import { isIncompatible, schemaStatus, versionStatus, workerStatus } from '../src/compat.js';

describe('workerStatus', () => {
  it('is current for the same major and minor, whatever the patch', () => {
    expect(workerStatus('0.6.4', '0.6.2').status).toBe('current');
    expect(workerStatus('0.6.4', '0.6.9').status).toBe('current');
  });
  it('offers an update when the Worker is older by minor or major', () => {
    expect(workerStatus('0.7.0', '0.6.9')).toMatchObject({
      status: 'update-available',
      update: 'backend'
    });
    expect(workerStatus('1.0.0', '0.9.0').status).toBe('update-available');
  });
  it('says the console is older when the Worker is newer', () => {
    const result = workerStatus('0.6.4', '0.7.0');
    expect(result).toMatchObject({ status: 'console-older', update: 'console' });
    expect(result.message).toContain('npm update -g vizoalica');
    expect(workerStatus('0.6.4', '1.0.0').status).toBe('console-older');
  });
  it('is unknown without a usable version and still offers the update', () => {
    for (const version of [null, undefined, '', 'dev', '1.2'])
      expect(workerStatus('0.6.4', version)).toMatchObject({
        status: 'unknown',
        update: 'backend'
      });
  });
  it('accepts pre-release and build suffixes', () => {
    expect(workerStatus('0.6.4', '0.6.4-rc.1').status).toBe('current');
  });
});

describe('schemaStatus', () => {
  it('compares the applied number with the expected one', () => {
    expect(schemaStatus(2, 2).status).toBe('current');
    expect(schemaStatus(2, 1)).toMatchObject({ status: 'update-available', update: 'backend' });
    expect(schemaStatus(1, 2)).toMatchObject({ status: 'console-older', update: 'console' });
  });
  it('is unknown without an applied version (no migrations table)', () => {
    expect(schemaStatus(2, null)).toMatchObject({ status: 'unknown', update: 'backend' });
    expect(schemaStatus(2, undefined).status).toBe('unknown');
  });
  it('is unsupported below the first schema', () => {
    expect(schemaStatus(2, 0)).toMatchObject({ status: 'unsupported', update: null });
  });
  it('is unknown when this console does not know what to expect', () => {
    expect(schemaStatus(null, 1).status).toBe('unknown');
    expect(schemaStatus(undefined, 1).status).toBe('unknown');
  });
});

describe('versionStatus', () => {
  it('reports both components', () => {
    const result = versionStatus(
      { consoleVersion: '0.6.4', expectedSchema: 2 },
      { workerVersion: '0.6.2', schemaApplied: 1 }
    );
    expect(result.worker.status).toBe('current');
    expect(result.schema.status).toBe('update-available');
    expect(isIncompatible(result)).toBe(false);
  });
  it('treats a database this console cannot work with as incompatible', () => {
    expect(
      isIncompatible(
        versionStatus(
          { consoleVersion: '0.6.4', expectedSchema: 1 },
          { workerVersion: '0.6.4', schemaApplied: 3 }
        )
      )
    ).toBe(true);
    expect(
      isIncompatible(
        versionStatus(
          { consoleVersion: '0.6.4', expectedSchema: 1 },
          { workerVersion: '0.6.4', schemaApplied: 0 }
        )
      )
    ).toBe(true);
  });
});
