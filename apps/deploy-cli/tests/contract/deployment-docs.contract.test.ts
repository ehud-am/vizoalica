import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function text(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

function expectJourney(content: string, frequency: RegExp, requiredSections: string[]): void {
  expect(content).toMatch(frequency);
  for (const section of requiredSections) expect(content).toContain(section);
}

describe('deployment documentation contract', () => {
  it('makes README the authoritative three-step deployment selector', async () => {
    const readme = await text('README.md');
    expect(readme).toContain('Deploying Vizoalica has three main steps');
    expect(readme).toContain('(docs/operations/cloudflare.md)');
    expect(readme).toContain('(docs/operations/local-analytics.md)');
    expect(readme).toContain('(docs/operations/ops-cli.md)');
    expect(readme).toContain('(docs/operations/pages.md)');
    expect(readme).toMatch(/once per customer/i);
    expect(readme).toMatch(/once per operator/i);
    expect(readme).toMatch(/once per website/i);
    expect(readme).toMatch(/fresh deployments only/i);
  });

  it('defines a complete fresh customer-backend journey', async () => {
    const guide = await text('docs/operations/cloudflare.md');
    expectJourney(guide, /once per customer/i, [
      '## Prerequisites',
      '## Inputs',
      '## Security boundary',
      '## Verify deployment health',
      '## Backend handoff',
      '## Recovery and removal'
    ]);
    expect(guide).toMatch(/fresh deployments only/i);
    expect(guide).toMatch(/existing schema/i);
    expect(guide).toContain('git checkout YOUR_APPROVED_TAG_OR_COMMIT');
    expect(guide).toContain('pnpm build');
    expect(guide).toContain('SELECT name FROM d1_migrations ORDER BY id;');
    expect(guide).toMatch(/second reports only unapplied migration files/i);
    expect(guide).toMatch(/health route does not access D1/i);
  });

  it('explains how to recover an unusable Wrangler login', async () => {
    const guide = await text('docs/operations/troubleshooting.md');
    expect(guide).toMatch(/wrangler says login is required/i);
    expect(guide).toContain('pnpm exec wrangler login');
    expect(guide).toContain('pnpm exec wrangler whoami');
    expect(guide).toMatch(/interactive terminal/i);
  });

  it('defines the complete direct-credential workstation journey', async () => {
    const guide = await text('docs/operations/local-analytics.md');
    expectJourney(guide, /once per operator/i, [
      '## Prerequisites',
      '## Inputs',
      '## Security boundary',
      '## Verify the operator setup',
      '## Operator handoff',
      '## Stop or remove access'
    ]);
    expect(guide).toMatch(/without OneCLI/i);
    expect(guide).not.toMatch(/onecli run/i);
  });

  it('gives returning operators an unambiguous mode selector and startup path', async () => {
    const guide = await text('docs/operations/operator-local.md');
    expect(guide).toMatch(/\| Without OneCLI\s+\| Real administrator secret/);
    expect(guide).toMatch(/\| With OneCLI\s+\| Literal `onecli-managed`/);
    expect(guide).toContain('pnpm ops status');
    expect(guide).toContain('pnpm ops run');
    expect(guide).toContain('pnpm local-ops-api:dev serve');
    expect(guide).toMatch(/do not switch modes merely by changing the startup command/i);
  });

  it('defines the complete OneCLI workstation journey', async () => {
    const guide = await text('docs/operations/ops-cli.md');
    expectJourney(guide, /once per operator/i, [
      '## Prerequisites',
      '## Inputs',
      '## Security boundary',
      '## Verify the operator setup',
      '## Operator handoff',
      '## Revoke access'
    ]);
    expect(guide).toContain('onecli-managed');
    expect(guide).toMatch(/fail closed/i);
    expect(guide).toContain('pnpm ops verify');
    expect(guide).toMatch(/positive–negative–positive/i);
    expect(guide).not.toContain('YOUR_US1_COMMIT');
    expect(guide).not.toContain('https://<worker>.workers.dev');
  });

  it('defines a repeatable, complete website journey', async () => {
    const guide = await text('docs/operations/pages.md');
    expectJourney(guide, /once per website/i, [
      '## Prerequisites',
      '## Inputs',
      '## Security boundary',
      '## Verify website activation',
      '## Website handoff',
      '## Rotate or remove'
    ]);
    expect(guide).toMatch(/consent/i);
    expect(guide).toMatch(/returns \*\*202\*\*/);
    expect(guide).toMatch(/remain usable/i);
  });

  it('documents project-first creation and both portable installation modes', async () => {
    const readme = await text('README.md');
    const sdk = await text('docs/operations/browser-sdk.md');
    const pages = await text('docs/operations/pages.md');
    const combined = `${readme}\n${sdk}\n${pages}`;
    expect(readme).toMatch(/Projects[\s\S]*empty, required project choice/i);
    expect(combined).toMatch(/Static snippet/);
    expect(combined).toMatch(/Dynamic configuration/);
    expect(combined).toMatch(/public browser configuration/i);
    expect(sdk).toContain('<script async src="/vizoalica-loader.js"></script>');
    expect(sdk).toMatch(/other hosts/i);
    for (const step of [
      'whoami',
      'project list',
      'git diff',
      'pages dev',
      'pages deploy',
      'website:verify'
    ])
      expect(pages).toContain(step);
    expect(combined).not.toMatch(/private-sentinel|Bearer private|ADMIN_SECRET=/);
  });

  it('contains no active historical upgrade instructions', async () => {
    const active = await Promise.all(
      [
        'README.md',
        'docs/operations/cloudflare.md',
        'docs/operations/local-analytics.md',
        'docs/operations/operator-local.md',
        'docs/operations/ops-cli.md',
        'docs/operations/pages.md',
        'docs/operations/browser-sdk.md',
        'docs/operations/cost-model.md',
        'docs/operations/privacy.md',
        'docs/operations/releases.md',
        'docs/operations/public-release.md',
        'docs/operations/troubleshooting.md',
        'docs/releases/v0.5.0.md'
      ].map(text)
    );
    const combined = active.join('\n');
    expect(combined).not.toMatch(/\bUS(?:1|2A|2B|3)\b/i);
    expect(combined).not.toMatch(
      /0002_admin_mcp|0003_dashboard|0004_local_operations|0005_dashboard_visual_refresh/
    );
    expect(combined).not.toMatch(/apply every (?:D1 )?migration through the latest/i);
    expect(combined).not.toMatch(/existing installations must/i);
  });
});
