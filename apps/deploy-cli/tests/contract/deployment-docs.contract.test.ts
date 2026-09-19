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
  it('explains the three parts first, then a quick start for a demo, then production deployment', async () => {
    const readme = await text('README.md');
    for (const heading of [
      '## The three parts, in order',
      '## Quick start',
      '## Production deployment, part by part',
      '### 1. Backend',
      '### 2. Console',
      '### 3. Website',
      '## Keep it running',
      '## Build from source'
    ])
      expect(readme).toContain(heading);
    const at = (heading: string) => readme.indexOf(heading);
    // Concepts before the command that uses them, and the demo before the production path.
    expect(at('## The three parts, in order')).toBeLessThan(at('## Quick start'));
    expect(at('## Quick start')).toBeLessThan(at('## Production deployment, part by part'));
    expect(at('### 1. Backend')).toBeLessThan(at('### 2. Console'));
    expect(at('### 2. Console')).toBeLessThan(at('### 3. Website'));
    expect(at('## Production deployment, part by part')).toBeLessThan(at('## Build from source'));
    expect(readme).not.toContain('## Try it');
    // The diagram states the sequence explicitly.
    expect(readme).toMatch(/1\. BACKEND[\s\S]*2\. CONSOLE[\s\S]*3\. WEBSITE/);
    // The quick start is one command, says what it covers, and points on to production.
    const quick = readme.slice(at('## Quick start'), at('## Production deployment, part by part'));
    expect(quick).toContain('pnpm vizoalica install');
    expect(quick).toMatch(/demo app/);
    expect(quick).toMatch(/Ready for production\?/);
    for (const command of [
      'pnpm vizoalica backend',
      'pnpm vizoalica connect',
      'pnpm vizoalica console',
      'pnpm vizoalica rotate',
      'pnpm vizoalica demo'
    ])
      expect(readme).toContain(command);
    // Each part ends by pointing at its full guide.
    expect(readme).toContain('(docs/operations/cloudflare.md)');
    expect(readme).toContain('(docs/operations/local-analytics.md)');
    expect(readme).toContain('(docs/operations/onecli.md)');
    expect(readme).toContain('(docs/operations/pages.md)');
    // The default console setup is the private file; OneCLI is supported but opt-in.
    expect(readme).toMatch(/OneCLI is supported and is the more secure option/);
    expect(readme).toMatch(/not\s+(?:>\s+)?the default/);
  });

  it('describes the project in plain, findable terms for people, search, and agents', async () => {
    const readme = await text('README.md');
    const manifest = JSON.parse(await text('package.json')) as {
      description: string;
      keywords: string[];
    };
    const intro = readme.slice(0, readme.indexOf('## The three parts, in order'));
    for (const phrase of [
      'open-source',
      'self-hosted',
      'privacy',
      'Cloudflare',
      'web and product analytics'
    ])
      expect(intro, phrase).toMatch(new RegExp(phrase, 'i'));
    // The summary is a heading (with the architecture diagram beneath it), not a lead-in line.
    expect(intro).toMatch(/^## At a glance$/m);
    expect(manifest.description).toMatch(/self-hosted.*analytics.*Cloudflare/i);
    expect(manifest.keywords).toEqual(
      expect.arrayContaining(['analytics', 'self-hosted', 'cloudflare-workers'])
    );
    // The logo's alt text carries the description too, since bots read it.
    expect(readme).toMatch(/alt="Vizoalica: [^"]*analytics[^"]*"/);
  });

  it('keeps an llms.txt whose links all exist', async () => {
    const llms = await text('llms.txt');
    expect(llms).toMatch(/^# Vizoalica\n\n> /);
    expect(llms).toContain('pnpm vizoalica install');
    const links = [...llms.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]!);
    expect(links.length).toBeGreaterThan(5);
    for (const link of links) await expect(readFile(link), link).resolves.toBeInstanceOf(Buffer);
  });

  it('gives the README a logo, badges, and a screenshot that exist', async () => {
    const readme = await text('README.md');
    // One image that reads on light and dark pages: <picture> is not rendered everywhere (see below).
    expect(readme).toContain('docs/assets/vizoalica-logo.svg');
    for (const badge of ['actions/workflows/ci.yml/badge.svg', 'License-MIT', 'node-%3E%3D22'])
      expect(readme).toContain(badge);
    // These two were removed on purpose.
    expect(readme).not.toContain('package-json/v/');
    expect(readme).not.toMatch(/runs%20on-Cloudflare/i);
    for (const [, path] of readme.matchAll(/(?:src|srcset)="((?:apps|docs)\/[^"]+)"/g)) {
      await expect(readFile(path!), path).resolves.toBeInstanceOf(Buffer);
    }
  });

  it('uses only the HTML that both GitHub and gitlocal render (p, strong, img)', async () => {
    // gitlocal renders <p align>, <strong>, and <img>; <picture>, <a><img></a>, <br>, and <sub> show up as
    // raw text there. Badges are plain markdown links instead.
    const readme = (await text('README.md'))
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`\n]*`/g, '');
    const tags = new Set(
      [...readme.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].map((match) => match[1]!.toLowerCase())
    );
    expect([...tags].sort()).toEqual(['img', 'p', 'strong']);
    expect(readme).toMatch(/\[!\[CI\]\(https:\/\/github\.com\/[^)]+badge\.svg[^)]*\)\]\(/);
  });

  it('only mentions pnpm vizoalica commands that exist', async () => {
    const { help } = await import('../../../../scripts/vizoalica.js');
    const known = new Set(
      [...help().matchAll(/pnpm vizoalica ([a-z-]+)/g)].map((match) => match[1])
    );
    for (const command of ['help', 'show']) known.add(command); // real commands the help text does not list as rows
    for (const path of [
      'README.md',
      'docs/operations/cloudflare.md',
      'docs/operations/local-analytics.md',
      'docs/operations/pages.md'
    ])
      for (const [, command] of (await text(path)).matchAll(/pnpm vizoalica ([a-z-]+)/g))
        expect(known, `${path}: pnpm vizoalica ${command}`).toContain(command);
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

  it('leads the backend guide with the automated install, rotation, and update', async () => {
    const guide = await text('docs/operations/cloudflare.md');
    for (const heading of [
      '## Automated install (recommended)',
      '## Manual install',
      '## Rotate a secret'
    ])
      expect(guide).toContain(heading);
    expect(guide.indexOf('## Automated install (recommended)')).toBeLessThan(
      guide.indexOf('## Quick command reference')
    );
    for (const command of [
      'pnpm vizoalica install',
      'pnpm vizoalica backend --update',
      'pnpm vizoalica rotate admin'
    ])
      expect(guide).toContain(command);
    expect(guide).toMatch(/never adopts an existing database/i);
  });

  it('separates first install from updating a running backend', async () => {
    const guide = await text('docs/operations/cloudflare.md');
    expect(guide).toContain('## Update an existing backend');
    expect(guide).toContain(
      'pnpm exec wrangler deploy --config deploy/cloudflare/wrangler.production.toml'
    );
    expect(guide).toMatch(/first-install\*{0,2}\s+commands/i);
    expect(guide).toContain('### Deleted websites and projects');
    expect(guide).toContain('pnpm vizoalica purge-deleted --apply');
    // `deploy:apply` refuses a non-empty database, so no doc may tell operators to use it to update.
    expect(guide).not.toMatch(/redeploy with `pnpm deploy:apply`/);
  });

  it('starts the console with one command in both credential modes', async () => {
    for (const path of [
      'docs/operations/local-analytics.md',
      'docs/operations/onecli.md',
      'docs/operations/operator-local.md',
      'docs/operations/troubleshooting.md'
    ])
      expect(await text(path), path).not.toMatch(/pnpm vizoalica run\b(?!` is an alias)/);
    expect(await text('docs/operations/local-analytics.md')).toContain('pnpm vizoalica console');
    expect(await text('docs/operations/onecli.md')).toContain('pnpm vizoalica console');
  });

  it('uses one placeholder shape for the Worker origin', async () => {
    for (const path of [
      'README.md',
      'docs/operations/cloudflare.md',
      'docs/operations/local-analytics.md',
      'docs/operations/onecli.md',
      'docs/operations/pages.md'
    ])
      expect(await text(path), path).not.toMatch(
        /<worker>\.|YOUR_ACCOUNT_SUBDOMAIN|https:\/\/YOUR_WORKER\.workers\.dev/
      );
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
    expect(guide).toContain('pnpm vizoalica status');
    expect(guide).toContain('pnpm vizoalica console');
    expect(guide).toMatch(/never start the API yourself with `pnpm local-ops-api:dev`/i);
    expect(guide).toMatch(/do not switch modes merely by changing the startup command/i);
  });

  it('defines the complete OneCLI workstation journey', async () => {
    const guide = await text('docs/operations/onecli.md');
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
    expect(guide).toContain('pnpm vizoalica verify');
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
        'docs/operations/onecli.md',
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
