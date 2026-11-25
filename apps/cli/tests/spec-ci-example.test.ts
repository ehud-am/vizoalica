import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  join(__dirname, '../../../examples/spec-ci/spec-workflow.yml'),
  'utf8'
);

describe('example CI workflow for the spec', () => {
  it('checks on pull requests and applies only on main, with no secret in the file', () => {
    expect(workflow).toContain('spec validate "$SPEC_DIRECTORY" --check');
    expect(workflow).toContain('spec diff "$VIZOALICA_ENVIRONMENT"');
    expect(workflow).toMatch(
      /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'[\s\S]*spec apply/
    );
    expect(workflow).toContain('--secret-stdin');
    expect(workflow).toContain('secrets.VIZOALICA_ACCESS_KEY');
    expect(workflow).not.toMatch(/--secret [^-]/);
    expect(workflow).toContain('permissions:\n  contents: read');
  });

  it('uses only options the command line accepts', async () => {
    const { main } = await import('../src/main.js');
    expect(typeof main).toBe('function');
    const flags = new Set([...workflow.matchAll(/ --([a-z-]+)/g)].map((match) => match[1]));
    const known = new Set([
      'check',
      'connect',
      'url',
      'role',
      'secret-stdin',
      'yes',
      'project',
      'website',
      'global',
      'version'
    ]);
    for (const flag of flags) expect(known.has(flag!), `--${flag}`).toBe(true);
  });
});
