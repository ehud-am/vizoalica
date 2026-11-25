import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  join(__dirname, '../../../examples/spec-ci/spec-workflow.yml'),
  'utf8'
);

describe('example CI workflow for the spec', () => {
  it('checks on pull requests without a secret and applies only on main, in an environment', () => {
    const [check, apply] = workflow.slice(workflow.indexOf('\njobs:')).split(/\n {2}apply:\n/);
    expect(check).toContain('spec validate "$SPEC_DIRECTORY" --check');
    expect(check).not.toContain('secrets.');
    expect(check).not.toContain('spec apply');
    expect(apply).toContain("if: github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(apply).toContain('environment: vizoalica-spec');
    expect(apply).toContain('spec diff "$VIZOALICA_ENVIRONMENT"');
    expect(apply).toContain('spec apply "$VIZOALICA_ENVIRONMENT"');
    expect(apply).toContain('--secret-stdin');
    expect(apply).toContain('secrets.VIZOALICA_ACCESS_KEY');
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
