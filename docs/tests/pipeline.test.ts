import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(join(process.cwd(), '.github/workflows/docs-site.yml'), 'utf8');
const [buildJob, publishJob] = workflow.split(/\n {2}publish:\n/) as [string, string];

describe('docs site pipeline', () => {
  it('runs on docs changes, on pull requests and the main branch, and by hand', () => {
    expect(workflow).toMatch(/push:\n\s+branches: \[main\]/);
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow.match(/- 'docs\/\*\*'/g)).toHaveLength(2);
  });

  it('never uses pull_request_target, so a pull request cannot run with the repository’s secrets', () => {
    expect(workflow).not.toContain('pull_request_target');
  });

  it('gives the workflow read-only repository access and nothing that writes', () => {
    expect(workflow).toMatch(/\npermissions:\n {2}contents: read\n/);
    expect(workflow).not.toMatch(/: write/);
    expect(workflow.match(/\npermissions:/g)).toHaveLength(1);
  });

  it('pins every action to a full commit', () => {
    const uses = [...workflow.matchAll(/^\s+uses: (\S+)/gm)].map((match) => match[1]!);
    expect(uses.length).toBeGreaterThanOrEqual(4);
    for (const action of uses) expect(action, action).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
  });

  // Public identifiers (the ingest address, project, source and public key, and the account ID) may
  // be kept as secrets for preference; what matters is that the two credentials never spread.
  const IDENTIFIERS = [
    'CF_ACCOUNT_ID',
    'VIZOALICA_INGEST_ENDPOINT',
    'VIZOALICA_PROJECT_ID',
    'VIZOALICA_PUBLIC_SOURCE_KEY',
    'VIZOALICA_SOURCE_ID'
  ];
  const CREDENTIALS = ['CF_DOCS_API_TOKEN', 'VIZOALICA_TOKEN_SECRET'];

  it('keeps the two credentials out of the build job and in exactly one publish step', () => {
    expect(buildJob).not.toContain('secrets.');
    expect(buildJob).not.toContain('CLOUDFLARE_API_TOKEN');
    // Only these secrets exist in the workflow: the two credentials and the public identifiers.
    const used = new Set([...workflow.matchAll(/secrets\.(\w+)/g)].map((match) => match[1]!));
    expect([...used].sort()).toEqual([...CREDENTIALS, ...IDENTIFIERS].sort());
    // Each credential is named once, in the one publish step: the Cloudflare token, and the analytics
    // signing secret that is handed to Cloudflare Pages.
    for (const name of CREDENTIALS)
      expect(workflow.match(new RegExp(`secrets\\.${name}\\b`, 'g')), name).toHaveLength(1);
    const [beforePublish, publishStep] = publishJob.split('- name: Publish\n') as [string, string];
    for (const name of CREDENTIALS) expect(beforePublish).not.toContain(name);
    expect(publishStep).toMatch(
      /env:\n\s+CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CF_DOCS_API_TOKEN \}\}/
    );
    expect(publishStep).toContain('VIZOALICA_TOKEN_SECRET: ${{ secrets.VIZOALICA_TOKEN_SECRET }}');
  });

  it('adds analytics only from public values, and never writes the signing secret to a file', () => {
    expect(publishJob).toContain('node docs/scripts/prepare-analytics.mjs');
    const addStep = publishJob
      .split('- name: Add Vizoalica analytics\n')[1]!
      .split('# The Cloudflare')[0]!;
    // Public identifiers only: neither credential reaches the step that writes the configuration file.
    for (const name of CREDENTIALS) expect(addStep).not.toContain(name);
    for (const match of addStep.matchAll(/secrets\.(\w+)/g))
      expect(IDENTIFIERS, match[1]).toContain(match[1]);
    expect(publishJob).toMatch(
      /printf '%s' "\$VIZOALICA_TOKEN_SECRET" \| pnpm exec wrangler pages secret put/
    );
    expect(publishJob).not.toMatch(/>\s*\S*wrangler\.toml/);
  });

  it('publishes only from the main branch, never for a pull request, and only when configured', () => {
    const condition = publishJob.slice(0, publishJob.indexOf('runs-on'));
    expect(condition).toContain("github.event_name != 'pull_request'");
    expect(condition).toContain("github.ref == 'refs/heads/main'");
    expect(condition).toContain("vars.VIZOALICA_DOCS_PAGES_PROJECT != ''");
    expect(publishJob).toContain('environment: docs-production');
    expect(publishJob).toContain('needs: build');
  });

  it('publishes with the repository’s locked Wrangler to the production branch, not a third-party action', () => {
    expect(publishJob).toContain('pnpm exec wrangler pages deploy .vitepress/dist --cwd docs');
    expect(publishJob).toContain('--branch main');
    expect(workflow).not.toMatch(/wrangler-action/);
  });

  it('never puts an expression inside a shell script (which would allow script injection)', () => {
    const scripts = [...workflow.matchAll(/run: (?:>-|\|)?\n?((?:\s{10,}.*\n?)+|.*)/g)].map(
      (match) => match[1]!
    );
    expect(scripts.length).toBeGreaterThan(3);
    for (const script of scripts) expect(script).not.toContain('${{');
  });

  it('serialises publishing and does not cancel one in progress', () => {
    expect(workflow).toContain('group: docs-site-${{ github.ref }}');
    expect(workflow).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
  });

  it('builds and checks with the locked dependencies of the docs package only', () => {
    expect(buildJob).toContain('pnpm install --frozen-lockfile --filter @vizoalica/docs');
    expect(buildJob).toContain('pnpm docs:build');
    expect(buildJob).toContain('pnpm docs:test');
  });

  it('is described in the maintainer guide with the same names', () => {
    const guide = readFileSync(join(process.cwd(), 'docs/operations/docs-site.md'), 'utf8');
    for (const name of [
      'CF_DOCS_API_TOKEN',
      'CF_ACCOUNT_ID',
      'VIZOALICA_DOCS_PAGES_PROJECT',
      'docs-production',
      'vizoalica.dev'
    ])
      expect(guide, name).toContain(name);
    expect(guide).toMatch(/Cloudflare Pages: Edit/);
  });
});
