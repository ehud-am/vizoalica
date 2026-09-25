import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const text = (path: string) => readFile(join(process.cwd(), path), 'utf8');

describe('the npm publish workflow', () => {
  it('publishes only when VIZOALICA_NPM_PUBLISH is set, and reports plainly otherwise', async () => {
    const workflow = await text('.github/workflows/publish.yml');
    expect(workflow).toContain("if: vars.VIZOALICA_NPM_PUBLISH == 'true'");
    expect(workflow).toContain('npm publish --provenance --access public');
    expect(workflow).toContain("if: vars.VIZOALICA_NPM_PUBLISH != 'true'");
    expect(workflow).toMatch(/Publishing is not set up/);
  });

  it('runs the package build and check before publishing', async () => {
    const workflow = await text('.github/workflows/publish.yml');
    const buildAt = workflow.indexOf('pnpm package:build && pnpm package:check');
    const publishAt = workflow.indexOf('npm publish --provenance');
    expect(buildAt).toBeGreaterThan(-1);
    expect(publishAt).toBeGreaterThan(buildAt);
  });

  it('requests id-token: write for provenance, and nothing broader', async () => {
    const workflow = await text('.github/workflows/publish.yml');
    expect(workflow).toMatch(/id-token:\s*write/);
    expect(workflow).not.toMatch(/contents:\s*write/);
  });

  it('runs on a published release and on manual dispatch only', async () => {
    const workflow = await text('.github/workflows/publish.yml');
    expect(workflow).toMatch(/release:\s*\n\s*types:\s*\[published\]/);
    expect(workflow).toMatch(/workflow_dispatch/);
    expect(workflow).not.toMatch(/^\s*push:/m);
  });

  it('pins every third-party action to a full commit hash with a version comment, like the other workflows', async () => {
    const workflow = await text('.github/workflows/publish.yml');
    const lines = [...workflow.matchAll(/^\s*uses:\s*(.+)$/gm)].map((match) => match[1]!);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line, line).toMatch(/^[^@]+@[0-9a-f]{40}\s+#\s*v[\d.]+$/);
  });
});
