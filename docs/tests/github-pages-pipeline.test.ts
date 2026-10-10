import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const workflow = read('.github/workflows/docs-github-pages.yml');
const [buildJob, publishJob] = workflow.split('\njobs:\n')[1]!.split(/\n {2}publish:\n/) as [
  string,
  string
];

describe('docs site on GitHub Pages pipeline', () => {
  it('runs on docs changes, on pull requests and the main branch, and by hand', () => {
    expect(workflow).toMatch(/push:\n\s+branches: \[main\]/);
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toContain('pull_request_target');
    expect(workflow.match(/- 'docs\/\*\*'/g)).toHaveLength(2);
  });

  it('is separate from the Cloudflare workflow and holds no secret', () => {
    expect(workflow).not.toContain('secrets.');
    expect(workflow).not.toContain('CLOUDFLARE');
    expect(workflow).not.toContain('wrangler');
  });

  it('reads the repository by default and gives only the publish job what Pages needs', () => {
    expect(workflow).toMatch(/\npermissions:\n {2}contents: read\n/);
    expect(buildJob).not.toMatch(/permissions:|: write/);
    expect(publishJob).toMatch(/permissions:\n\s+pages: write\n\s+id-token: write\n/);
    expect(workflow.match(/: write/g)).toHaveLength(2);
  });

  it('pins every action to a full commit', () => {
    const uses = [...workflow.matchAll(/^\s+uses: (\S+)/gm)].map((match) => match[1]!);
    expect(uses.length).toBeGreaterThanOrEqual(4);
    for (const action of uses) expect(action, action).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
  });

  it('builds under the repository path, with no analytics, and checks the links', () => {
    expect(buildJob).toContain('DOCS_BASE: /${{ github.event.repository.name }}/');
    expect(buildJob).toContain('pnpm docs:build');
    expect(buildJob).toContain('node docs/scripts/check-base.mjs "$DOCS_BASE"');
    expect(workflow).not.toContain('VIZOALICA_INGEST_ENDPOINT');
  });

  it('publishes only from the main branch, never for a pull request, and only when turned on', () => {
    const condition = publishJob.slice(0, publishJob.indexOf('runs-on'));
    expect(condition).toContain("github.event_name != 'pull_request'");
    expect(condition).toContain("github.ref == 'refs/heads/main'");
    expect(condition).toContain("vars.VIZOALICA_GITHUB_PAGES == 'true'");
    expect(publishJob).toContain('needs: build');
    expect(publishJob).toContain('name: github-pages');
  });

  it('never puts an expression inside a shell script', () => {
    const scripts = [...workflow.matchAll(/run: (?:>-|\|)?\n?((?:\s{10,}.*\n?)+|.*)/g)].map(
      (match) => match[1]!
    );
    expect(scripts.length).toBeGreaterThan(3);
    for (const script of scripts) expect(script).not.toContain('${{');
  });

  it('is described in the maintainer guide with the same names', () => {
    const guide = read('docs/operations/docs-site.md');
    for (const name of ['VIZOALICA_GITHUB_PAGES', 'github-pages', 'ehud-am.github.io/vizoalica'])
      expect(guide, name).toContain(name);
  });
});
