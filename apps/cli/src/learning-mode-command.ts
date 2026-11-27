import { join } from 'node:path';
import {
  VaultError,
  type FetchLike,
  type Vault
} from '../../local-ops-api/src/environments/vault.js';
import { workerJson } from '../../local-ops-api/src/routes/websites.js';
import { expectedSchemaFrom } from '../../local-ops-api/src/setup/state.js';
import { noTrace, type Trace } from '../../local-ops-api/src/trace.js';
import { McpEnvironments, EnvironmentProblem } from './mcp/environments.js';

export type LearningModeDeps = {
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
  'Usage: vizoalica learning-mode <command> <environment>',
  '',
  'Learning mode lets a share of visits describe their pages (headings, landmarks, control and',
  "form-field labels; never field values or body text) so an assistant can learn the website's",
  'structure. It is off until you set a start date on the backend Worker.',
  '',
  'This command never changes anything: it reads the backend, or prints instructions for you to follow.',
  '',
  '  status <environment>              Read the backend: is learning mode set, and when does it end.',
  '  enable <environment> [--start <YYYY-MM-DD>] [--duration <1-90>] [--sample-percent <1-100>]',
  '      Print the three Worker variables to set yourself (start: today, duration: 14 days, 10 percent of visits).',
  '  disable <environment>             Print how to turn learning mode off yourself.',
  '',
  'Guide: https://vizoalica.dev/operations/spec'
].join('\n');

type Info = {
  learn?: { startUtc: string; endUtc: string; days: number; samplePercent: number } | null;
};

/** `vizoalica learning-mode`: the learning window of a backend (read from the backend; set on the Worker). */
export async function learningModeCommand(
  args: readonly string[],
  deps: LearningModeDeps
): Promise<number> {
  const [sub, environment, ...rest] = args;
  if (sub === undefined || sub === 'help' || sub === '--help' || sub === '-h') {
    deps.out(`${USAGE}\n`);
    return 0;
  }
  if (!['status', 'enable', 'disable'].includes(sub) || !environment) {
    deps.err(
      `${!environment && sub ? 'Name the environment.' : `Unknown command: ${sub}`}\n${USAGE}\n`
    );
    return 1;
  }
  const flags = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index]!;
    const value = rest[index + 1];
    if (
      !['--start', '--duration', '--sample-percent'].includes(name) ||
      sub !== 'enable' ||
      value === undefined ||
      value.startsWith('--')
    ) {
      deps.err(
        `${name.startsWith('--') && sub === 'enable' && value === undefined ? `${name} needs a value.` : `Unexpected argument: ${name}`}\n${USAGE}\n`
      );
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
      if (!learn)
        deps.out(
          `Environment: ${ref.name}\nLearning mode is off (no VIZOALICA_LEARN_START on the Worker). See how to turn it on: vizoalica learning-mode enable ${ref.name}\n`
        );
      else {
        const open = now >= new Date(learn.startUtc) && now < new Date(learn.endUtc);
        deps.out(
          `Environment: ${ref.name}\nLearning mode is ${open ? 'open' : now < new Date(learn.startUtc) ? 'set but not open yet' : 'closed'}: ${learn.startUtc.slice(0, 10)} to ${learn.endUtc.slice(0, 10)} UTC (${learn.days} days), ${learn.samplePercent}% of visits describe their pages.\n${open || now >= new Date(learn.endUtc) ? `Next: ask your assistant "/vizoalica learn" to propose a spec, then vizoalica spec apply ${ref.name}. View the latest spec with: vizoalica spec show ${ref.name}\n` : ''}`
        );
      }
      return 0;
    }
    if (sub === 'disable') {
      deps.out(
        `Environment: ${ref.name}\nNothing was changed. To turn learning mode off, delete the variable VIZOALICA_LEARN_START on the "${ref.name}" Worker (Cloudflare dashboard: Workers & Pages, the Worker, Settings, Variables and Secrets). Pages stop describing themselves within an hour (the script is cached). ${learn ? '' : 'It is already off.'}\n`
      );
      return 0;
    }
    const start = flags.get('--start') ?? now.toISOString().slice(0, 10);
    const days = flags.get('--duration') ?? '14';
    const sample = flags.get('--sample-percent') ?? '10';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(Date.parse(`${start}T00:00:00Z`)))
      throw new EnvironmentProblem('--start must be a date such as 2026-12-01.');
    if (!/^\d+$/.test(days) || Number(days) < 1 || Number(days) > 90)
      throw new EnvironmentProblem('--duration must be a whole number from 1 to 90 (days).');
    if (!/^\d+$/.test(sample) || Number(sample) < 1 || Number(sample) > 100)
      throw new EnvironmentProblem('--sample-percent must be a whole number from 1 to 100.');
    deps.out(
      [
        `Environment: ${ref.name}`,
        'Nothing was changed. Set these variables on the Worker yourself (Cloudflare dashboard: Workers & Pages, the Worker, Settings, Variables and Secrets), then save:',
        `  VIZOALICA_LEARN_START = ${start}`,
        `  VIZOALICA_LEARN_DAYS = ${days}`,
        `  VIZOALICA_LEARN_SAMPLE = ${sample}`,
        'They survive "vizoalica deploy --update". Websites that load /vizoalica.js from this backend pick the window up within an hour. While it is open, pages describe themselves only in browsers that did not deny analytics consent; the backend drops these events outside the window.',
        `Check with: vizoalica learning-mode status ${ref.name}`,
        learn ? 'Learning mode is already set; these values replace it.' : ''
      ]
        .filter(Boolean)
        .join('\n') + '\n'
    );
    return 0;
  } catch (error) {
    if (error instanceof EnvironmentProblem || error instanceof VaultError)
      deps.err(`${error.message}\n`);
    else
      deps.err(
        `The backend for "${environment}" did not answer. Check it with: vizoalica env check ${environment}\n`
      );
    return 1;
  }
}
