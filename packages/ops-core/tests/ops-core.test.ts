import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NAMES,
  OpsCoreError,
  SECRETS,
  SECRET_KINDS,
  assertAccountId,
  assertResourceName,
  formatSecretBlock,
  generateSecret,
  generateSecrets,
  isValidSecret,
  parseAccounts,
  parseBuckets,
  parseDatabases,
  parsePendingMigrations,
  parseSecretKind,
  parseWorkerUrl,
  readConfigNames,
  renderProductionConfig
} from '../src/index.js';

describe('names', () => {
  it('accepts DEFAULT_NAMES and rejects malformed resource names', () => {
    for (const name of Object.values(DEFAULT_NAMES))
      expect(() => assertResourceName('x', name)).not.toThrow();
    for (const bad of ['AB', 'a', '-abc', 'abc-', 'has spaces', 'Has_Upper'])
      expect(() => assertResourceName('Worker', bad)).toThrow(OpsCoreError);
  });

  it('validates a Cloudflare account id', () => {
    expect(() => assertAccountId('0123456789abcdef0123456789abcdef')).not.toThrow();
    for (const bad of ['too-short', '0123456789ABCDEF0123456789ABCDEF', ''])
      expect(() => assertAccountId(bad)).toThrow(OpsCoreError);
  });
});

describe('parsers', () => {
  it('parses accounts, databases, buckets, and a deployed Worker URL', () => {
    expect(parseAccounts('│ Test │ 0123456789abcdef0123456789abcdef │')).toEqual([
      { name: 'Test', id: '0123456789abcdef0123456789abcdef' }
    ]);
    expect(parseDatabases('noise\n[{"name":"db","uuid":"u"}]')).toEqual([
      { name: 'db', uuid: 'u' }
    ]);
    expect(parseDatabases('not json')).toEqual([]);
    expect(parseBuckets('name: vizoalica-events\nname: other')).toEqual([
      'vizoalica-events',
      'other'
    ]);
    expect(parseWorkerUrl('Deployed to https://x.example.workers.dev now')).toBe(
      'https://x.example.workers.dev'
    );
    expect(parseWorkerUrl('nothing here')).toBeUndefined();
  });

  it('reads the names a rendered config carries', () => {
    expect(readConfigNames('name = "w"\ndatabase_name = "d"\nbucket_name = "b"')).toEqual({
      worker: 'w',
      database: 'd',
      bucket: 'b'
    });
    expect(readConfigNames('nothing')).toBeUndefined();
  });

  it('parses pending migration names from a plain listing', () => {
    expect(parsePendingMigrations('0002_access_keys.sql\n0003_next.sql\n')).toEqual([
      '0002_access_keys.sql',
      '0003_next.sql'
    ]);
    expect(parsePendingMigrations('No migrations to apply!')).toEqual([]);
  });
});

describe('config-render', () => {
  it('fills every placeholder and refuses a template missing one', () => {
    const example = 'name = "x"\ndatabase_name = "x"\ndatabase_id = "x"\nbucket_name = "x"';
    const rendered = renderProductionConfig(example, {
      worker: 'w-1',
      database: 'd-1',
      databaseId: 'uuid-1',
      bucket: 'b-1'
    });
    expect(rendered).toContain('name = "w-1"');
    expect(rendered).toContain('database_id = "uuid-1"');
    expect(() =>
      renderProductionConfig('name = "x"', {
        worker: 'w',
        database: 'd',
        databaseId: 'id',
        bucket: 'b'
      })
    ).toThrow(OpsCoreError);
  });

  it('fills migrations_dir only when migrationsDir is given, for the packaged template', () => {
    const example =
      'name = "x"\ndatabase_name = "x"\ndatabase_id = "x"\nbucket_name = "x"\nmigrations_dir = "x"';
    const withoutOverride = renderProductionConfig(example, {
      worker: 'w',
      database: 'd',
      databaseId: 'id',
      bucket: 'b'
    });
    expect(withoutOverride).toContain('migrations_dir = "x"');
    const withOverride = renderProductionConfig(example, {
      worker: 'w',
      database: 'd',
      databaseId: 'id',
      bucket: 'b',
      migrationsDir: '/packaged/schema'
    });
    expect(withOverride).toContain('migrations_dir = "/packaged/schema"');
  });
});

describe('secrets', () => {
  it('generates the three secrets, each strong and unique', () => {
    const secrets = generateSecrets();
    expect(Object.keys(secrets)).toEqual(SECRET_KINDS.map((kind) => SECRETS[kind].name));
    for (const value of Object.values(secrets)) {
      expect(isValidSecret(value)).toBe(true);
      expect(value.length).toBeGreaterThanOrEqual(32);
    }
    expect(new Set(Object.values(secrets)).size).toBe(SECRET_KINDS.length);
    expect(generateSecret()).not.toBe(generateSecret());
  });

  it('generates only the requested kinds', () => {
    expect(Object.keys(generateSecrets(['admin']))).toEqual([SECRETS.admin.name]);
  });

  it('rejects a weak or malformed secret', () => {
    for (const bad of ['short', 'x'.repeat(300), 'has\nnewline', ''])
      expect(isValidSecret(bad)).toBe(false);
  });

  it('parses a secret kind or "all", and rejects anything else', () => {
    expect(parseSecretKind('admin')).toBe('admin');
    expect(parseSecretKind('all')).toBe('all');
    expect(parseSecretKind('bogus')).toBeUndefined();
    expect(parseSecretKind(undefined)).toBeUndefined();
  });

  it('formats a copyable block naming only the secrets given', () => {
    const block = formatSecretBlock({ [SECRETS.admin.name]: 'the-value' });
    expect(block).toContain(SECRETS.admin.name);
    expect(block).toContain('the-value');
    expect(block).not.toContain(SECRETS.token.name);
    expect(block).toContain('SAVE THESE NOW');
  });
});
