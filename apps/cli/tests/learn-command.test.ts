import { describe, expect, it, vi } from 'vitest';
import { Vault } from '../../local-ops-api/src/environments/vault.js';
import { learnCommand, type LearnDeps } from '../src/learn-command.js';
import { defaultBackends, fakeWorkers, SECRETS, type FakeBackend } from './mcp-support.js';
import { tempHome, writePrivate } from './support.js';

function setup(backends: Record<string, FakeBackend> = defaultBackends()) {
  const home = tempHome();
  writePrivate(home, 'environments.json', {
    version: 1,
    environments: {
      prod: { url: 'https://prod.workers.test', role: 'admin', secret: SECRETS.prod }
    }
  });
  const { fetchMock } = fakeWorkers(backends);
  const out: string[] = [];
  const err: string[] = [];
  const deps: LearnDeps = {
    home,
    version: '9.9.0',
    assetDir: '/assets/dist',
    out: (text) => void out.push(text),
    err: (text) => void err.push(text),
    vault: new Vault(vi.fn() as never),
    fetch: fetchMock as never,
    now: () => new Date('2026-12-02T10:00:00Z')
  };
  return { deps, text: () => out.join(''), errors: () => err.join('') };
}

describe('vizoalica learn', () => {
  it('reports the window: off, open, not yet open, closed', async () => {
    const off = setup();
    expect(await learnCommand(['status', 'prod'], off.deps)).toBe(0);
    expect(off.text()).toContain('is off');
    const window = (start: string, end: string) => ({
      prod: {
        ...defaultBackends().prod!,
        learn: { startUtc: start, endUtc: end, days: 14, samplePercent: 10 }
      }
    });
    const open = setup(window('2026-12-01T00:00:00.000Z', '2026-12-15T00:00:00.000Z'));
    await learnCommand(['status', 'prod'], open.deps);
    expect(open.text()).toContain(
      'is open: 2026-12-01 to 2026-12-15 UTC (14 days), 10% of visits describe their pages'
    );
    const early = setup(window('2026-12-05T00:00:00.000Z', '2026-12-19T00:00:00.000Z'));
    await learnCommand(['status', 'prod'], early.deps);
    expect(early.text()).toContain('not open yet');
    const closed = setup(window('2026-11-01T00:00:00.000Z', '2026-11-15T00:00:00.000Z'));
    await learnCommand(['status', 'prod'], closed.deps);
    expect(closed.text()).toContain('closed');
  });

  it('shows the variables to set, with defaults and checks', async () => {
    const t = setup();
    expect(await learnCommand(['enable', 'prod'], t.deps)).toBe(0);
    expect(t.text()).toContain('VIZOALICA_LEARN_START = 2026-12-02');
    expect(t.text()).toContain('VIZOALICA_LEARN_DAYS = 14');
    expect(t.text()).toContain('VIZOALICA_LEARN_SAMPLE = 10');
    const custom = setup();
    expect(
      await learnCommand(
        ['enable', 'prod', '--start', '2027-01-10', '--days', '30', '--sample', '25'],
        custom.deps
      )
    ).toBe(0);
    expect(custom.text()).toContain('VIZOALICA_LEARN_SAMPLE = 25');
    for (const bad of [
      ['--days', '400'],
      ['--sample', '0'],
      ['--start', 'soon']
    ]) {
      const refused = setup();
      expect(await learnCommand(['enable', 'prod', ...bad], refused.deps)).toBe(1);
    }
    const disable = setup();
    expect(await learnCommand(['disable', 'prod'], disable.deps)).toBe(0);
    expect(disable.text()).toContain('delete the variable VIZOALICA_LEARN_START');
  });

  it('prints help, rejects what it does not know, and explains an unreachable backend', async () => {
    const t = setup();
    expect(await learnCommand([], t.deps)).toBe(0);
    expect(t.text()).toContain('never field values');
    expect(await learnCommand(['wipe', 'prod'], t.deps)).toBe(1);
    expect(await learnCommand(['status'], t.deps)).toBe(1);
    expect(await learnCommand(['status', 'prod', '--days', '3'], t.deps)).toBe(1);
    const down = setup({ prod: { fail: 'network' } });
    expect(await learnCommand(['status', 'prod'], down.deps)).toBe(1);
    expect(down.errors()).toContain('vizoalica env check prod');
  });
});
