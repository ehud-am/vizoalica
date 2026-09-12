import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function text(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

function expectJourney(
  content: string,
  story: string,
  frequency: RegExp,
  requiredSections: string[]
): void {
  expect(content).toContain(story);
  expect(content).toMatch(frequency);
  for (const section of requiredSections) expect(content).toContain(section);
}

describe('deployment documentation contract', () => {
  it('makes README the authoritative three-step deployment selector', async () => {
    const readme = await text('README.md');
    expect(readme).toContain('Deploying Vizoalica has three main steps');
    expect(readme).toContain('US1');
    expect(readme).toContain('US2A');
    expect(readme).toContain('US2B');
    expect(readme).toContain('US3');
    expect(readme).toContain('(docs/operations/cloudflare.md)');
    expect(readme).toContain('(docs/operations/local-analytics.md)');
    expect(readme).toContain('(docs/operations/ops-cli.md)');
    expect(readme).toContain('(docs/operations/pages.md)');
    expect(readme).toMatch(/once per customer/i);
    expect(readme).toMatch(/once per operator/i);
    expect(readme).toMatch(/once per website/i);
    expect(readme).toMatch(/fresh deployments only/i);
  });

  it('defines US1 as a complete fresh customer-backend journey', async () => {
    const guide = await text('docs/operations/cloudflare.md');
    expectJourney(guide, 'US1', /once per customer/i, [
      '## Prerequisites',
      '## Inputs',
      '## Security boundary',
      '## Verify US1',
      '## US1 handoff',
      '## Recovery and removal'
    ]);
    expect(guide).toMatch(/fresh deployments only/i);
    expect(guide).toMatch(/existing schema/i);
  });

  it('defines US2A as the complete direct-credential workstation journey', async () => {
    const guide = await text('docs/operations/local-analytics.md');
    expectJourney(guide, 'US2A', /once per operator/i, [
      '## Prerequisites',
      '## Inputs',
      '## Security boundary',
      '## Verify US2A',
      '## US2A handoff',
      '## Stop or remove access'
    ]);
    expect(guide).toMatch(/without OneCLI/i);
    expect(guide).not.toMatch(/onecli run/i);
  });

  it('defines US2B as the complete OneCLI workstation journey', async () => {
    const guide = await text('docs/operations/ops-cli.md');
    expectJourney(guide, 'US2B', /once per operator/i, [
      '## Prerequisites',
      '## Inputs',
      '## Security boundary',
      '## Verify US2B',
      '## US2B handoff',
      '## Revoke access'
    ]);
    expect(guide).toContain('onecli-managed');
    expect(guide).toMatch(/fail closed/i);
  });

  it('defines US3 as a repeatable, complete website journey', async () => {
    const guide = await text('docs/operations/pages.md');
    expectJourney(guide, 'US3', /once per website/i, [
      '## Prerequisites',
      '## Inputs',
      '## Security boundary',
      '## Verify US3',
      '## US3 handoff',
      '## Rotate or remove'
    ]);
    expect(guide).toMatch(/consent/i);
    expect(guide).toMatch(/returns \*\*202\*\*/);
    expect(guide).toMatch(/remain usable/i);
  });

  it('contains no active historical upgrade instructions', async () => {
    const active = await Promise.all(
      [
        'README.md',
        'docs/operations/cloudflare.md',
        'docs/operations/local-analytics.md',
        'docs/operations/ops-cli.md',
        'docs/operations/pages.md',
        'docs/operations/cost-model.md',
        'docs/operations/releases.md',
        'docs/operations/public-release.md',
        'docs/operations/troubleshooting.md',
        'docs/releases/v0.5.0.md'
      ].map(text)
    );
    const combined = active.join('\n');
    expect(combined).not.toMatch(
      /0002_admin_mcp|0003_dashboard|0004_local_operations|0005_dashboard_visual_refresh/
    );
    expect(combined).not.toMatch(/apply every (?:D1 )?migration through the latest/i);
    expect(combined).not.toMatch(/existing installations must/i);
  });
});
