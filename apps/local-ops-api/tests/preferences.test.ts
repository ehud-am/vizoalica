import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPreferences, writePreferences } from '../src/preferences.js';

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'vizoalica-prefs-'));
}

describe('preferences filesystem', () => {
  it('returns undefined when the preferences file does not exist', () => {
    const dir = tempDir();
    expect(readPreferences(join(dir, 'preferences.json'))).toBeUndefined();
  });

  it('reads back a valid preferences file', () => {
    const dir = tempDir();
    const path = join(dir, 'preferences.json');
    writePreferences(path, { theme: 'dark', updatedAt: '2026-01-01T00:00:00.000Z' });
    expect(readPreferences(path)).toEqual({
      theme: 'dark',
      updatedAt: '2026-01-01T00:00:00.000Z'
    });
  });

  it('rejects a theme value outside the light/dark allowlist', () => {
    const dir = tempDir();
    const path = join(dir, 'preferences.json');
    writeFileSync(path, JSON.stringify({ theme: 'solarized' }), { mode: 0o600 });
    expect(() => readPreferences(path)).toThrow('preferences_invalid');
  });

  it('rejects an unknown field, keeping the schema strictly allowlisted', () => {
    const dir = tempDir();
    const path = join(dir, 'preferences.json');
    writeFileSync(path, JSON.stringify({ theme: 'dark', adminSecret: 'leak' }), { mode: 0o600 });
    expect(() => readPreferences(path)).toThrow('preferences_invalid');
  });

  it('rejects malformed JSON', () => {
    const dir = tempDir();
    const path = join(dir, 'preferences.json');
    writeFileSync(path, '{not json', { mode: 0o600 });
    expect(() => readPreferences(path)).toThrow('preferences_invalid');
  });

  it('rejects a JSON array or primitive at the top level', () => {
    const dir = tempDir();
    const path = join(dir, 'preferences.json');
    writeFileSync(path, JSON.stringify(['dark']), { mode: 0o600 });
    expect(() => readPreferences(path)).toThrow('preferences_invalid');
  });

  it('refuses to follow a symlink rather than reading through it', () => {
    const dir = tempDir();
    const real = join(dir, 'real-preferences.json');
    writeFileSync(real, JSON.stringify({ theme: 'dark' }), { mode: 0o600 });
    const link = join(dir, 'preferences.json');
    symlinkSync(real, link);
    expect(() => readPreferences(link)).toThrow('preferences_symlink_refused');
  });

  it('enforces 0600 permissions on write', () => {
    const dir = tempDir();
    const path = join(dir, 'preferences.json');
    writePreferences(path, { theme: 'light' });
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('rejects a preferences file with group- or world-readable permissions', () => {
    const dir = tempDir();
    const path = join(dir, 'preferences.json');
    writeFileSync(path, JSON.stringify({ theme: 'light' }), { mode: 0o644 });
    expect(() => readPreferences(path)).toThrow('preferences_permissions_must_be_0600');
  });

  it('replaces the file atomically, leaving no partial write visible under concurrent reads', () => {
    const dir = tempDir();
    const path = join(dir, 'preferences.json');
    writePreferences(path, { theme: 'light' });
    writePreferences(path, { theme: 'dark' });
    expect(readPreferences(path)).toEqual({ theme: 'dark' });
    const leftovers = readdirSync(dir).filter((name) => name.startsWith('.'));
    expect(leftovers).toHaveLength(0);
  });

  it('never allows credential fields to round-trip through the preferences schema', () => {
    const dir = tempDir();
    const path = join(dir, 'preferences.json');
    writePreferences(path, { theme: 'dark' });
    const raw = readFileSync(path, 'utf8');
    expect(raw).not.toContain('adminSecret');
    expect(raw).not.toContain('credential');
  });

  it('propagates a write failure when the target directory cannot be created or written to', () => {
    const dir = tempDir();
    const blockedRoot = join(dir, 'blocked');
    mkdirSync(blockedRoot, { mode: 0o500 });
    const path = join(blockedRoot, 'nested', 'preferences.json');
    expect(() => writePreferences(path, { theme: 'light' })).toThrow();
    chmodSync(blockedRoot, 0o700);
  });
});
