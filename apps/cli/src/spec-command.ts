import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  VaultError,
  type FetchLike,
  type Vault
} from '../../local-ops-api/src/environments/vault.js';
import { WorkerClient } from '../../local-ops-api/src/remote-client/worker-client.js';
import { workerJson } from '../../local-ops-api/src/routes/websites.js';
import { expectedSchemaFrom } from '../../local-ops-api/src/setup/state.js';
import { noTrace, type Trace } from '../../local-ops-api/src/trace.js';
import type { SetupInventory } from '../../ingest-api/src/domain/types.js';
import { emptySpec, parseSiteSpec, type SiteSpec } from '../../ingest-api/src/spec/site-spec.js';
import {
  describeDiff,
  diffSpecs,
  filesToSpec,
  ONTOLOGY_FILE,
  renderOntology,
  SPEC_FILES,
  specToFiles
} from '../../ingest-api/src/spec/spec-files.js';
import { McpEnvironments, EnvironmentProblem } from './mcp/environments.js';
import { resolveRange } from './mcp/range.js';
import { locate } from './mcp/server.js';
import { describePlan, isEmptyPlan, planMapping } from './mapping/mapping-file.js';
import { specToMapping } from './spec/spec-mapping.js';
import type { Ask } from './prompt.js';

export type SpecDeps = {
  home: string;
  version: string;
  assetDir: string;
  out: (text: string) => void;
  err: (text: string) => void;
  interactive: boolean;
  ask: Ask;
  vault: Vault;
  cwd?: string | undefined;
  trace?: Trace | undefined;
  fetch?: FetchLike | undefined;
  now?: (() => Date) | undefined;
};

const USAGE = [
  'Usage: vizoalica spec <command>',
  '',
  'The spec (ontology) of a website: names and structure for pages, actions, events, campaigns,',
  'funnels and paths, kept as JSON files in a folder (default vizoalica-spec/<website>) with a',
  'generated ONTOLOGY.md beside them. With git the folder is the source of truth; without git the',
  'backend holds the only copy. The spec never holds personal data.',
  'Changes nothing: show, diff, validate. Writes local files: init, render, pull, export. Writes to the backend: apply, import.',
  '',
  '  init <environment> [--project <p>] [--website <w>] [--dir <folder>] [--no-git]',
  '      Create the folder (an empty spec), or with --no-git a working copy of the backend spec.',
  '  validate [folder] [--check]    Check the files; --check also fails if ONTOLOGY.md is stale.',
  '  render [folder]                Write ONTOLOGY.md from the JSON files.',
  '  diff <environment> [folder]    Show what applying the folder would change.',
  '  show <environment> [--json]',
  '      Print the latest spec stored on the backend as plain words (ONTOLOGY.md); --json prints it as JSON.',
  '  apply <environment> [folder] [--yes]',
  '      Store the folder as the latest spec on the backend and apply page names, grouping rules',
  '      and goals. Needs an administrator or website owner credential. Nothing is removed.',
  '  pull <environment> [folder] [--force]   Write the backend spec into a folder.',
  '  export <environment> [--out <file>]     Back up the backend spec to one JSON file.',
  '  import <environment> <file> [--yes] [--force]',
  '      Restore a backup as the latest spec on the backend; --force allows a backup from another environment.',
  '',
  'Guide: https://vizoalica.dev/operations/spec'
].join('\n');

const VALUE_FLAGS = new Set(['--project', '--website', '--dir', '--out']);
const BOOLEAN_FLAGS = new Set(['--json', '--yes', '--no-git', '--check', '--force']);
const BASE_FILE = '.vizoalica-base.json';

type Parsed =
  { positional: string[]; flags: Map<string, string>; bool: Set<string> } | { error: string };

function parse(args: readonly string[]): Parsed {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  const bool = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (BOOLEAN_FLAGS.has(arg)) bool.add(arg);
    else if (VALUE_FLAGS.has(arg)) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) return { error: `${arg} needs a value.` };
      flags.set(arg, value);
      index += 1;
    } else if (arg.startsWith('--')) return { error: `Unknown option: ${arg}` };
    else positional.push(arg);
  }
  return { positional, flags, bool };
}

class Refusal extends Error {}

function explain(error: unknown, environment: string): string {
  if (
    error instanceof Refusal ||
    error instanceof EnvironmentProblem ||
    error instanceof VaultError
  )
    return error.message;
  const code = error instanceof Error ? error.message : '';
  if (code === 'access_revoked')
    return `The backend for "${environment}" refused this credential. Writing a spec needs an administrator or website owner credential; check it with: vizoalica env check ${environment}`;
  if (code === 'not_found')
    return `The backend for "${environment}" does not have this yet. Update it with: vizoalica deploy ${environment} --update`;
  if (code === 'database_update_needed')
    return `The database for "${environment}" needs its latest update: vizoalica deploy ${environment} --update`;
  if (code === 'invalid_request') return 'The backend refused the request as not valid.';
  return `The backend for "${environment}" did not answer. Check it with: vizoalica env check ${environment}`;
}

type StoredSpec = {
  version: number;
  contentHash?: string;
  spec?: unknown;
  renderedMd?: string;
  gitSha?: string;
  appliedAt?: string;
  appliedBy?: string;
};

const slug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'website';

function insideGit(start: string): boolean {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, '.git'))) return true;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

function gitSha(folder: string): string {
  try {
    const sha = execFileSync('git', ['-C', folder, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return /^[0-9a-f]{7,64}$/i.test(sha) ? sha : '';
  } catch {
    return '';
  }
}

function readFolder(folder: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of [...SPEC_FILES, ONTOLOGY_FILE, BASE_FILE]) {
    const path = join(folder, name);
    if (existsSync(path)) files[name] = readFileSync(path, 'utf8');
  }
  return files;
}

function writeFolder(folder: string, files: Record<string, string>): void {
  mkdirSync(folder, { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(folder, name), content);
}

/** The folder argument, or the only folder under ./vizoalica-spec that holds a spec. */
function findFolder(argument: string | undefined, cwd: string): string {
  if (argument) return resolve(cwd, argument);
  const base = resolve(cwd, 'vizoalica-spec');
  if (existsSync(join(base, 'spec.json'))) return base;
  if (existsSync(base) && statSync(base).isDirectory()) {
    const found = readdirSync(base).filter((name) => existsSync(join(base, name, 'spec.json')));
    if (found.length === 1) return join(base, found[0]!);
    if (found.length > 1)
      throw new Refusal(`Several spec folders exist (${found.join(', ')}); name one.`);
  }
  throw new Refusal('No spec folder found. Create one with: vizoalica spec init <environment>');
}

function loadFolder(folder: string): { spec: SiteSpec; files: Record<string, string> } {
  if (!existsSync(join(folder, 'spec.json'))) throw new Refusal(`${folder} has no spec.json.`);
  const files = readFolder(folder);
  const parsed = filesToSpec(files);
  if (!parsed.ok)
    throw new Refusal(
      `The spec in ${folder} is not valid:\n${parsed.errors.map((line) => `  ${line}`).join('\n')}`
    );
  return { spec: parsed.spec, files };
}

const mdIsStale = (spec: SiteSpec, files: Record<string, string>): boolean =>
  files[ONTOLOGY_FILE] !== renderOntology(spec);

/** `vizoalica spec`: the versioned spec (ontology) of a website. */
export async function specCommand(args: readonly string[], deps: SpecDeps): Promise<number> {
  const [sub, ...rest] = args;
  if (sub === undefined || sub === 'help' || sub === '--help' || sub === '-h') {
    deps.out(`${USAGE}\n`);
    return 0;
  }
  const known = ['init', 'validate', 'render', 'diff', 'apply', 'pull', 'show', 'export', 'import'];
  if (!known.includes(sub)) {
    deps.err(`Unknown command: ${sub}\n${USAGE}\n`);
    return 1;
  }
  const parsed = parse(rest);
  if ('error' in parsed) {
    deps.err(`${parsed.error}\n${USAGE}\n`);
    return 1;
  }
  const { positional, flags, bool } = parsed;
  const cwd = deps.cwd ?? process.cwd();
  try {
    if (sub === 'validate' || sub === 'render') {
      if (positional.length > 1) throw new Refusal(`Name at most one folder.\n${USAGE}`);
      const folder = findFolder(positional[0], cwd);
      const { spec, files } = loadFolder(folder);
      if (sub === 'render') {
        writeFileSync(join(folder, ONTOLOGY_FILE), renderOntology(spec));
        deps.out(`Wrote ${join(folder, ONTOLOGY_FILE)}\n`);
        return 0;
      }
      if (bool.has('--check') && mdIsStale(spec, files)) {
        deps.err(
          `${ONTOLOGY_FILE} is out of date. Run: vizoalica spec render ${positional[0] ?? ''}\n`.replace(
            / \n$/,
            '\n'
          )
        );
        return 1;
      }
      deps.out(
        `Valid: ${spec.pages.length} pages, ${spec.actions.length} actions, ${spec.events.length} events, ${spec.funnels.length} funnels, ${spec.decisions.length} decisions.\n`
      );
      return 0;
    }
    const needsFile = sub === 'import';
    const environment = positional[0];
    if (!environment) throw new Refusal(`Name the environment.\n${USAGE}`);
    if (needsFile && positional.length !== 2)
      throw new Refusal(`Name the environment and the backup file.\n${USAGE}`);
    if (!needsFile && positional.length > 2) throw new Refusal(`Too many arguments.\n${USAGE}`);
    const trace = deps.trace ?? noTrace;
    const environments = new McpEnvironments({
      homeDir: join(deps.home, '.config', 'vizoalica'),
      version: deps.version,
      expectedSchema: expectedSchemaFrom(join(deps.assetDir, 'schema')),
      vault: deps.vault,
      fetch: deps.fetch
    });
    const { ref, client } = await environments.target(environment);
    trace(`Environment ${ref.name} (${ref.role}, ${ref.url})`);
    const found = await locate(client, flags.get('--project'), flags.get('--website'));
    const site = found.website ?? (found.websites.length === 1 ? found.websites[0] : undefined);
    if (!site)
      throw new EnvironmentProblem(
        `Name the website with --website. Available: ${found.websites.map((item) => item.name).join(', ') || 'none yet'}.`
      );
    const base = `/v1/admin/projects/${encodeURIComponent(found.project.id)}/sources/${encodeURIComponent(site.id)}`;
    const ctx: Ctx = {
      client,
      deps,
      environment: ref.name,
      project: found.project.name,
      website: site.name,
      base,
      cwd
    };
    const folderArg = needsFile ? undefined : positional[1];
    switch (sub) {
      case 'init':
        return await init(ctx, flags.get('--dir') ?? folderArg, bool);
      case 'diff':
        return await apply(ctx, findFolder(folderArg, cwd), { dryRun: true, yes: false });
      case 'apply':
        return await apply(ctx, findFolder(folderArg, cwd), {
          dryRun: false,
          yes: bool.has('--yes')
        });
      case 'pull':
        return await pull(ctx, folderArg ?? defaultFolder(cwd, site.name), bool.has('--force'));
      case 'show':
        return await show(ctx, bool.has('--json'));
      case 'export':
        return await exportBackup(ctx, flags.get('--out'));
      default:
        return await importBackup(ctx, positional[1]!, bool.has('--yes'), bool.has('--force'));
    }
  } catch (error) {
    deps.err(`${explain(error, positional[0] ?? '')}\n`);
    return 1;
  }
}

type Ctx = {
  client: WorkerClient;
  deps: SpecDeps;
  environment: string;
  project: string;
  website: string;
  base: string;
  cwd: string;
};

const defaultFolder = (cwd: string, website: string): string =>
  resolve(cwd, 'vizoalica-spec', slug(website));

async function fetchStored(ctx: Ctx): Promise<{ stored: StoredSpec; spec: SiteSpec | undefined }> {
  const stored = (await workerJson(ctx.client, `${ctx.base}/spec`)) as StoredSpec;
  if (!stored.version) return { stored, spec: undefined };
  const parsed = parseSiteSpec(stored.spec);
  if (!parsed.ok)
    throw new Refusal('The spec stored on the backend is not valid for this version of Vizoalica.');
  return { stored, spec: parsed.spec };
}

function metaFor(ctx: Ctx, store: 'git' | 'backend'): SiteSpec['meta'] {
  return {
    version: 1,
    store,
    environment: ctx.environment,
    project: ctx.project,
    website: ctx.website
  };
}

async function init(ctx: Ctx, dir: string | undefined, bool: Set<string>): Promise<number> {
  const { deps } = ctx;
  const folder = dir ? resolve(ctx.cwd, dir) : defaultFolder(ctx.cwd, ctx.website);
  if (existsSync(join(folder, 'spec.json'))) throw new Refusal(`${folder} already holds a spec.`);
  const store: 'git' | 'backend' = bool.has('--no-git')
    ? 'backend'
    : insideGit(folder) || insideGit(ctx.cwd)
      ? 'git'
      : 'backend';
  const { stored, spec } = await fetchStored(ctx);
  const start = spec
    ? { ...spec, meta: { ...spec.meta, ...metaFor(ctx, store) } }
    : emptySpec(metaFor(ctx, store));
  writeFolder(folder, {
    ...specToFiles(start),
    [ONTOLOGY_FILE]: renderOntology(start),
    '.gitignore': `${BASE_FILE}\n`,
    ...(stored.version
      ? {
          [BASE_FILE]: `${JSON.stringify({ version: stored.version, contentHash: stored.contentHash })}\n`
        }
      : {})
  });
  deps.out(
    `Created ${folder} (${store === 'git' ? 'git: commit this folder; it is the source of truth' : 'no git: the backend holds the only copy'}).\n${
      spec
        ? 'It starts from the spec already on the backend.\n'
        : 'It is empty. Ask your assistant to run /vizoalica learn.\n'
    }`
  );
  return 0;
}

async function show(ctx: Ctx, json: boolean): Promise<number> {
  const { stored } = await fetchStored(ctx);
  if (!stored.version) {
    ctx.deps.out(
      `No spec is stored for ${ctx.environment} yet. Create one: run /vizoalica learn in your assistant, then vizoalica spec apply ${ctx.environment}.\n`
    );
    return 0;
  }
  if (json) {
    ctx.deps.out(`${JSON.stringify(stored.spec, null, 2)}\n`);
    return 0;
  }
  ctx.deps.out(
    `Spec version ${stored.version} for ${ctx.environment}${stored.appliedAt ? `, applied ${stored.appliedAt}` : ''}.\n\n${stored.renderedMd ?? ''}\n`
  );
  return 0;
}

async function pull(ctx: Ctx, folder: string, force: boolean): Promise<number> {
  const { stored, spec } = await fetchStored(ctx);
  if (!spec)
    throw new Refusal(
      `There is no spec on ${ctx.environment} / ${ctx.website} yet. Create one with: vizoalica spec init ${ctx.environment}`
    );
  if (existsSync(join(folder, 'spec.json')) && !force)
    throw new Refusal(
      `${folder} already holds a spec. Use --force to replace its files with the backend copy.`
    );
  const store = spec.meta.store ?? 'backend';
  const files = specToFiles({ ...spec, meta: { ...spec.meta, store } });
  writeFolder(folder, {
    ...files,
    [ONTOLOGY_FILE]: renderOntology(spec),
    '.gitignore': `${BASE_FILE}\n`,
    [BASE_FILE]: `${JSON.stringify({ version: stored.version, contentHash: stored.contentHash })}\n`
  });
  ctx.deps.out(
    `Pulled version ${stored.version} of ${ctx.environment} / ${ctx.website} into ${folder}.\n`
  );
  return 0;
}

async function putSpec(
  ctx: Ctx,
  spec: SiteSpec,
  baseVersion: number,
  sha: string
): Promise<{ version: number; contentHash: string }> {
  const response = await ctx.client.request(`${ctx.base}/spec`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ spec, baseVersion, ...(sha ? { gitSha: sha } : {}) })
  });
  if (response.status === 409)
    throw new Refusal(
      'The spec on the backend changed since this folder was last pulled or applied. Run: vizoalica spec diff, then pull (or merge) before applying again.'
    );
  if (response.status === 400) {
    const body = (await response.json().catch(() => ({}))) as { errors?: string[] };
    throw new Refusal(
      `The backend refused the spec:\n${(body.errors ?? []).map((line) => `  ${line}`).join('\n')}`
    );
  }
  if (response.status === 401 || response.status === 403) throw new Error('access_revoked');
  if (response.status === 404) throw new Error('not_found');
  if (response.status === 503) throw new Error('database_update_needed');
  if (!response.ok) throw new Error('remote_unavailable');
  return (await response.json()) as { version: number; contentHash: string };
}

async function apply(
  ctx: Ctx,
  folder: string,
  mode: { dryRun: boolean; yes: boolean }
): Promise<number> {
  const { deps } = ctx;
  const { spec, files } = loadFolder(folder);
  if (spec.meta.environment && spec.meta.environment !== ctx.environment)
    throw new Refusal(
      `The spec was written for environment "${spec.meta.environment}", not "${ctx.environment}". Fix "environment" in spec.json if that is intended.`
    );
  if (!mode.dryRun && mdIsStale(spec, files))
    throw new Refusal(`${ONTOLOGY_FILE} is out of date. Run: vizoalica spec render ${folder}`);
  const { stored, spec: current } = await fetchStored(ctx);
  const diffs = diffSpecs(current, spec);
  const { mapping, problems } = specToMapping(spec);
  const range = resolveRange({ preset: 'last_30_days' }, (deps.now ?? (() => new Date()))());
  const query = new URLSearchParams({ start: range.startUtc, end: range.endUtc });
  const inventory = (await workerJson(
    ctx.client,
    `${ctx.base}/inventory?${query.toString()}`
  )) as SetupInventory;
  const plan = planMapping(inventory, mapping);
  deps.out(
    `Environment: ${ctx.environment}\nWebsite: ${ctx.website} (project ${ctx.project})\nBackend spec: ${stored.version ? `version ${stored.version}` : 'none yet'}\n\nSpec changes:\n${describeDiff(diffs)}\n\nReports:\n${describePlan(plan)}\n`
  );
  for (const problem of problems) deps.out(`Problem: ${problem}\n`);
  if (plan.problems.length || problems.length) {
    deps.err('Nothing was changed. Fix the spec and try again.\n');
    return 1;
  }
  if (mode.dryRun) return 0;
  if (diffs.length === 0 && isEmptyPlan(plan)) {
    deps.out('Nothing to change.\n');
    return 0;
  }
  if (!mode.yes) {
    if (!deps.interactive) {
      deps.out('Nothing was changed. Run again with --yes to apply.\n');
      return 0;
    }
    const answer = await deps.ask(`Apply this to ${ctx.environment} / ${ctx.website}? [y/N] `);
    if (!/^y(es)?$/i.test(answer.trim())) {
      deps.out('Nothing changed.\n');
      return 0;
    }
  }
  // The folder's recorded base wins (a pull or earlier apply); otherwise the version just read.
  let baseVersion = stored.version;
  if (files[BASE_FILE]) {
    try {
      const recorded = JSON.parse(files[BASE_FILE]!) as { version?: unknown };
      if (typeof recorded.version === 'number') baseVersion = recorded.version;
    } catch {
      /* an unreadable base file is ignored */
    }
  }
  const saved = await putSpec(ctx, spec, baseVersion, gitSha(folder));
  // Record the new base at once: if a later step fails, running apply again must not be refused as
  // a change made elsewhere.
  writeFileSync(
    join(folder, BASE_FILE),
    `${JSON.stringify({ version: saved.version, contentHash: saved.contentHash })}\n`
  );
  // Goals first, then rules, then names, as in guided setup.
  for (const goal of plan.result.goalsToCreate)
    await workerJson(ctx.client, `${ctx.base}/goals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(goal)
    });
  if (plan.rules.add.length > 0)
    await workerJson(ctx.client, ctx.base, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ groupingRules: plan.result.groupingRules })
    });
  if (plan.labels.add.length + plan.labels.change.length > 0)
    await workerJson(ctx.client, `${ctx.base}/labels`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ labels: plan.result.labels })
    });
  deps.out(
    `Applied to ${ctx.environment} / ${ctx.website}: spec version ${saved.version}, ${plan.labels.add.length + plan.labels.change.length} names, ${plan.rules.add.length} rules, ${plan.goals.add.length} goals.\n`
  );
  return 0;
}

const BACKUP_KIND = 'vizoalica-spec-backup';

async function exportBackup(ctx: Ctx, out: string | undefined): Promise<number> {
  const { stored, spec } = await fetchStored(ctx);
  if (!spec)
    throw new Refusal(`There is no spec on ${ctx.environment} / ${ctx.website} to back up.`);
  const text = `${JSON.stringify(
    {
      kind: BACKUP_KIND,
      format: 1,
      environment: ctx.environment,
      project: ctx.project,
      website: ctx.website,
      version: stored.version,
      contentHash: stored.contentHash,
      ...(stored.gitSha ? { gitSha: stored.gitSha } : {}),
      spec
    },
    null,
    2
  )}\n`;
  if (!out) {
    ctx.deps.out(text);
    return 0;
  }
  const path = resolve(ctx.cwd, out);
  if (existsSync(path)) throw new Refusal(`${path} already exists; choose another file name.`);
  writeFileSync(path, text, { mode: 0o600 });
  ctx.deps.out(
    `Wrote ${path}: version ${stored.version} of ${ctx.environment} / ${ctx.website}.\n`
  );
  return 0;
}

async function importBackup(ctx: Ctx, file: string, yes: boolean, force: boolean): Promise<number> {
  const { deps } = ctx;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resolve(ctx.cwd, file), 'utf8'));
  } catch {
    throw new Refusal(`${file} could not be read as JSON.`);
  }
  const backup = raw as {
    kind?: unknown;
    format?: unknown;
    spec?: unknown;
    website?: unknown;
    environment?: unknown;
  };
  if (!backup || backup.kind !== BACKUP_KIND || backup.format !== 1)
    throw new Refusal(`${file} is not a Vizoalica spec backup.`);
  const parsed = parseSiteSpec(backup.spec);
  if (!parsed.ok)
    throw new Refusal(
      `The backup is not a valid spec:\n${parsed.errors.map((line) => `  ${line}`).join('\n')}`
    );
  if (typeof backup.environment === 'string' && backup.environment !== ctx.environment && !force)
    throw new Refusal(
      `The backup is of environment "${backup.environment}", not "${ctx.environment}". Add --force to restore it here anyway.`
    );
  const { stored, spec: current } = await fetchStored(ctx);
  deps.out(
    `Environment: ${ctx.environment}\nWebsite: ${ctx.website} (project ${ctx.project})\nBackup is of website "${String(backup.website ?? 'unknown')}".\nBackend spec: ${stored.version ? `version ${stored.version}` : 'none yet'}\n\nWhat the restore changes on the backend spec:\n${describeDiff(diffSpecs(current, parsed.spec))}\n`
  );
  if (diffSpecs(current, parsed.spec).length === 0) {
    deps.out('Nothing to change.\n');
    return 0;
  }
  if (!yes) {
    if (!deps.interactive) {
      deps.out('Nothing was changed. Run again with --yes to restore.\n');
      return 0;
    }
    const answer = await deps.ask(
      `Replace the spec of ${ctx.environment} / ${ctx.website} with this backup? [y/N] `
    );
    if (!/^y(es)?$/i.test(answer.trim())) {
      deps.out('Nothing changed.\n');
      return 0;
    }
  }
  const saved = await putSpec(ctx, parsed.spec, stored.version, '');
  deps.out(
    `Restored as version ${saved.version}. Page names, rules and goals were not touched; run "vizoalica spec apply ${ctx.environment}" from your spec folder to reapply them.\n`
  );
  return 0;
}
