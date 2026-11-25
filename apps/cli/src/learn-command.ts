import { join } from 'node:path';
import { VaultError, type FetchLike, type Vault } from '../../local-ops-api/src/environments/vault.js';
import { workerJson } from '../../local-ops-api/src/routes/websites.js';
import { expectedSchemaFrom } from '../../local-ops-api/src/setup/state.js';
import { noTrace, type Trace } from '../../local-ops-api/src/trace.js';
import { McpEnvironments, EnvironmentProblem } from './mcp/environments.js';

export type LearnDeps = {
  home: string;
  version: string;
  assetDir: string;
  out: (text: string) => void;
  err: (text: string) => void;
  vault: Vault;
  trace?: Trace | undefined;
  fetch?: FetchLike | undefined;
  now?: (() => Date) | undefined;
};

const USAGE = [
  'Usage: vizoalica learn <command> <environment>',
  '',
  'The learning window lets a small share of page loads describe their pages (headings, landmarks,',
  'control and form-field labels; never field values or body text) so an assistant can learn the',
  'website\'s structure. It is off until you set a start date on the backend.',
  '',
  '  status <environment>                     Show whether the window is set, and when it ends.',
  '  enable <environment> [--start <YYYY-MM-DD>] [--days <1-90>] [--sample <1-100>]',
  '      Show the three Worker variables to set (start defaults to today, 14 days, 10 percent).',
  '  disable <environment>                    Show how to turn it off.',
  '',
  'Guide: https://vizoalica.dev/operations/spec'
].join('\n');

type Info = { learn?: { startUtc: string; endUtc: string; days: number; samplePercent: number } | null };

/** `vizoalica learn`: the learning window of a backend (read from the backend; set on the Worker). */
export async function learnCommand(args: readonly string[], deps: LearnDeps): Promise<number> {
  const [sub, environment, ...rest] = args;
  if (sub === undefined || sub === 'help' || sub === '--help' || sub === '-h') {
    deps.out(`${USAGE}\n`);
    return 0;
  }
  if (!['status', 'enable', 'disable'].includes(sub) || !environment) {
    deps.err(`${!environment && sub ? 'Name the environment.' : `Unknown command: ${sub}`}\n${USAGE}\n`);
    return 1;
  }
  const flags = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index]!;
    const value = rest[index + 1];
    if (!['--start', '--days', '--sample'].includes(name) || sub !== 'enable' || value === undefined || value.startsWith('--')) {
      deps.err(`${name.startsWith('--') && sub === 'enable' && value === undefined ? `${name} needs a value.` : `Unexpected argument: ${name}`}\n${USAGE}\n`);
      return 1;
    }
    flags.set(name, value);
  }
  const now = (deps.now ?? (() => new Date()))();
  try {
    const environments = new McpEnvironments({
      homeDir: join(deps.home, '.config', 'vizoalica'),
      version: deps.version,
      expectedSchema: expectedSchemaFrom(join(deps.assetDir, 'schema')),
      vault: deps.vault,
      fetch: deps.fetch
    });
    const { ref, client } = await environments.target(environment);
    (deps.trace ?? noTrace)(`Environment ${ref.name} (${ref.role}, ${ref.url})`);
    const info = (await workerJson(client, '/v1/admin/backend')) as Info;
    const learn = info.learn ?? null;
    if (sub === 'status') {
      if (!learn) deps.out(`Environment: ${ref.name}\nThe learning window is off (no VIZOALICA_LEARN_START on the Worker). Turn it on with: vizoalica learn enable ${ref.name}\n`);
      else {
        const open = now >= new Date(learn.startUtc) && now < new Date(learn.endUtc);
        deps.out(
          `Environment: ${ref.name}\nThe learning window is ${open ? 'open' : now < new Date(learn.startUtc) ? 'set but not open yet' : 'closed'}: ${learn.startUtc.slice(0, 10)} to ${learn.endUtc.slice(0, 10)} UTC (${learn.days} days), ${learn.samplePercent}% of page loads.\n`
        );
      }
      return 0;
    }
    if (sub === 'disable') {
      deps.out(
        `Environment: ${ref.name}\nTo turn the learning window off, delete the variable VIZOALICA_LEARN_START on the "${ref.name}" Worker (Cloudflare dashboard: Workers & Pages, the Worker, Settings, Variables and Secrets). Pages stop describing themselves within an hour (the script is cached). ${learn ? '' : 'It is already off.'}\n`
      );
      return 0;
    }
    const start = flags.get('--start') ?? now.toISOString().slice(0, 10);
    const days = flags.get('--days') ?? '14';
    const sample = flags.get('--sample') ?? '10';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(Date.parse(`${start}T00:00:00Z`)))
      throw new EnvironmentProblem('--start must be a date such as 2026-12-01.');
    if (!/^\d+$/.test(days) || Number(days) < 1 || Number(days) > 90)
      throw new EnvironmentProblem('--days must be a whole number from 1 to 90.');
    if (!/^\d+$/.test(sample) || Number(sample) < 1 || Number(sample) > 100)
      throw new EnvironmentProblem('--sample must be a whole number from 1 to 100.');
    deps.out(
      [
        `Environment: ${ref.name}`,
        'Set these variables on the Worker (Cloudflare dashboard: Workers & Pages, the Worker, Settings, Variables and Secrets), then save:',
        `  VIZOALICA_LEARN_START = ${start}`,
        `  VIZOALICA_LEARN_DAYS = ${days}`,
        `  VIZOALICA_LEARN_SAMPLE = ${sample}`,
        'They survive "vizoalica deploy --update". Websites that load /vizoalica.js from this backend pick the window up within an hour. While it is open, pages describe themselves only in browsers that did not deny analytics consent; the backend drops these events outside the window.',
        `Check with: vizoalica learn status ${ref.name}`,
        learn ? 'A window is already set; these values replace it.' : ''
      ]
        .filter(Boolean)
        .join('\n') + '\n'
    );
    return 0;
  } catch (error) {
    if (error instanceof EnvironmentProblem || error instanceof VaultError) deps.err(`${error.message}\n`);
    else deps.err(`The backend for "${environment}" did not answer. Check it with: vizoalica env check ${environment}\n`);
    return 1;
  }
}
