import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { AnalyticsRangeError } from '../../../ingest-api/src/analytics/range.js';
import type { ActionsReport, AnalyticsOverview } from '../../../ingest-api/src/domain/types.js';
import { versionStatus } from '../../../local-ops-api/src/compat.js';
import { VaultError } from '../../../local-ops-api/src/environments/vault.js';
import type { EnvironmentState } from '../../../local-ops-api/src/environments/verify.js';
import { checkInstall, checkReachability } from '../../../local-ops-api/src/routes/reachability.js';
import {
  analyticsActions,
  analyticsOverview
} from '../../../local-ops-api/src/routes/analytics.js';
import { workerJson } from '../../../local-ops-api/src/routes/websites.js';
import { isSafeId } from '../../../local-ops-api/src/contracts.js';
import type { WorkerClient } from '../../../local-ops-api/src/remote-client/worker-client.js';
import {
  EnvironmentProblem,
  type EnvironmentRef,
  type McpEnvironments,
  type Target
} from './environments.js';
import { PRESETS, previousRange, resolveRange, type Range } from './range.js';

export const SERVER_INSTRUCTIONS = `Vizoalica is self-hosted, privacy-first web analytics. These tools are read-only and return aggregates only (no visitor identifiers or raw events).

This computer can have several environments (for example dev, stage, prod), each a separate backend with its own data. Every result starts with an "Environment:" line naming the environment it came from. Always tell the user which environment an answer is about, and say so again whenever it changes. Tools take an optional "environment"; without it they use this session's environment (see list_environments; change it with use_environment).

Ranges are UTC and at most 30 days. Never ask the user for a secret or access key; setup and secret steps (vizoalica env add, deploy, rotate) are for the user to run in their own terminal.`;

export type ServerDeps = {
  environments: McpEnvironments;
  version: string;
  expectedSchema: number | null;
  /** Tests replace the probes of a website's own address. */
  probe?: { reachability: typeof checkReachability; install: typeof checkInstall } | undefined;
  now?: () => Date;
};

type Project = { id: string; name: string; status?: string };
type Website = { id: string; name: string; allowedOrigins?: string[]; status?: string };

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;

const environmentArg = z
  .string()
  .optional()
  .describe("Environment name (see list_environments). Omit to use this session's environment.");
const projectArg = z
  .string()
  .optional()
  .describe('Project name or id. May be omitted when only one project is visible.');
const websiteArg = z
  .string()
  .optional()
  .describe('Website name or id within the project. Omit for all websites of the project.');
const rangeArgs = {
  preset: z
    .enum(PRESETS)
    .optional()
    .describe(
      'A named range ending now (UTC). Default last_7_days. Do not combine with start/end.'
    ),
  start: z
    .string()
    .optional()
    .describe('Range start: a date (YYYY-MM-DD, midnight UTC) or an ISO time.'),
  end: z
    .string()
    .optional()
    .describe(
      'Range end, exclusive: a date or ISO time. Defaults to now. At most 30 days after start.'
    )
};
const limitArg = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe('How many rows to return per ranking (default 10).');

/** The first line of every answer: where it came from, and how that environment was chosen. */
function header(ref: EnvironmentRef, others: string[]): string {
  const how: Record<EnvironmentRef['chosenBy'], string> = {
    argument: 'as requested',
    session: "this session's environment",
    console: 'default: the one last used in the console',
    only: 'the only environment on this computer',
    'first-usable': 'default: the first working environment'
  };
  const rest = others.filter((name) => name !== ref.name);
  return `Environment: ${ref.name} (${ref.role}, ${ref.url}; ${how[ref.chosenBy]})${
    rest.length && ref.chosenBy !== 'argument' && ref.chosenBy !== 'session'
      ? `. Other environments: ${rest.join(', ')}; pass "environment" or call use_environment to switch.`
      : ''
  }`;
}

function result(
  ref: EnvironmentRef | undefined,
  others: string[],
  summary: string,
  data: object
): CallToolResult {
  const structured = ref
    ? { environment: { name: ref.name, role: ref.role, url: ref.url }, ...data }
    : data;
  const lines = [ref ? header(ref, others) : '', summary, JSON.stringify(structured)].filter(
    Boolean
  );
  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    structuredContent: structured as Record<string, unknown>
  };
}

function failure(message: string, ref?: EnvironmentRef): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: ref ? `Environment: ${ref.name}\n${message}` : message }]
  };
}

/** Turns what the Worker client throws into one plain sentence with the next step. */
function explain(error: unknown, ref: EnvironmentRef | undefined): string {
  if (error instanceof EnvironmentProblem || error instanceof VaultError) return error.message;
  if (error instanceof AnalyticsRangeError) return `Invalid range: ${error.message}`;
  const code = error instanceof Error ? error.message : '';
  const name = ref?.name ?? 'the environment';
  if (code === 'unauthorized' || code === 'access_revoked')
    return `The Worker for "${name}" rejected its credential (it may have been rotated or revoked). The user can check it with: vizoalica env check ${name}`;
  if (code === 'not_found')
    return `Not found in "${name}", or not visible to the ${ref?.role ?? ''} role there. Call list_websites to see what this environment holds.`;
  if (code === 'invalid_request')
    return 'The request was not valid; check the names, ids and filters.';
  return `The Worker for "${name}" did not answer (${ref?.url ?? ''}). The user can check it with: vizoalica env check ${name}`;
}

async function listProjects(client: WorkerClient): Promise<Project[]> {
  const projects = (await workerJson(client, '/v1/admin/projects')) as Project[];
  return projects.filter((project) => project.status !== 'deleted');
}

async function listWebsites(client: WorkerClient, projectId: string): Promise<Website[]> {
  const sources = (await workerJson(
    client,
    `/v1/admin/projects/${encodeURIComponent(projectId)}/sources`
  )) as Website[];
  return sources
    .filter((source) => source.status !== 'deleted')
    .map(({ id, name, allowedOrigins, status }) => ({
      id,
      name,
      ...(allowedOrigins ? { allowedOrigins } : {}),
      ...(status ? { status } : {})
    }));
}

function match<T extends { id: string; name: string }>(
  items: T[],
  wanted: string,
  kind: string
): T {
  const exact =
    items.find((item) => item.id === wanted) ??
    items.filter((item) => item.name.toLowerCase() === wanted.toLowerCase());
  if (!Array.isArray(exact)) return exact;
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1)
    throw new EnvironmentProblem(
      `More than one ${kind} is named "${wanted}": ${exact.map((item) => item.id).join(', ')}. Use the id.`
    );
  throw new EnvironmentProblem(
    `No ${kind} "${wanted}" here. Available: ${items.map((item) => `${item.name} (${item.id})`).join(', ') || 'none'}.`
  );
}

/** Finds the project, and the website when one is named, by name or id. */
async function locate(
  client: WorkerClient,
  project: string | undefined,
  website: string | undefined
): Promise<{ project: Project; website?: Website; websites: Website[] }> {
  const projects = await listProjects(client);
  let chosen: Project;
  if (project) chosen = match(projects, project, 'project');
  else if (projects.length === 1) chosen = projects[0]!;
  else
    throw new EnvironmentProblem(
      projects.length === 0
        ? 'This environment has no projects yet.'
        : `Name a project: ${projects.map((item) => `${item.name} (${item.id})`).join(', ')}.`
    );
  if (!isSafeId(chosen.id)) throw new Error('invalid_request');
  const websites = await listWebsites(client, chosen.id);
  return website
    ? { project: chosen, website: match(websites, website, 'website'), websites }
    : { project: chosen, websites };
}

type RankedResult = AnalyticsOverview['rankings']['pagePaths'];

function trim(ranked: RankedResult, limit: number): RankedResult {
  if (!ranked || ranked.items.length <= limit) return ranked;
  const extra = ranked.items.slice(limit).reduce((sum, item) => sum + item.count, 0);
  return { ...ranked, items: ranked.items.slice(0, limit), otherCount: ranked.otherCount + extra };
}

function scopeText(project: Project, website: Website | undefined): string {
  return website
    ? `${website.name} (project ${project.name})`
    : `all websites of project ${project.name}`;
}

function availabilityText(state: string | undefined): string {
  if (!state || state === 'complete') return '';
  return state === 'processing' || state === 'incomplete'
    ? ` Data is ${state}: recent numbers may still grow.`
    : ' Data is unavailable for this range.';
}

const pageKey = (item: { label: string; website?: string }) =>
  item.website ? `${item.website} ${item.label}` : item.label;

/** Builds the MCP server. It only reads: nothing here creates, changes, or deletes anything. */
export function createMcpServer(deps: ServerDeps): McpServer {
  const server = new McpServer(
    { name: 'vizoalica', title: 'Vizoalica analytics', version: deps.version },
    { instructions: SERVER_INSTRUCTIONS }
  );
  const envs = deps.environments;
  const now = deps.now ?? (() => new Date());

  /** Runs a tool against its environment; every failure becomes a readable error result. */
  const withTarget = async (
    environment: string | undefined,
    run: (target: Target) => Promise<CallToolResult>
  ): Promise<CallToolResult> => {
    let target: Target | undefined;
    try {
      target = await envs.target(environment);
      return await run(target);
    } catch (error) {
      return failure(explain(error, target?.ref), target?.ref);
    }
  };

  server.registerTool(
    'list_environments',
    {
      title: 'List environments',
      description:
        'Every Vizoalica environment on this computer (dev, stage, prod, ...): address, role, whether it works and why not, and which one this session uses. Call this first when the user has more than one.',
      inputSchema: {},
      annotations: READ_ONLY
    },
    async () => {
      try {
        const overview = await envs.overview(true);
        const current = overview.current;
        const environments = overview.environments.map((item: EnvironmentState) => ({
          name: item.name,
          url: item.url,
          role: item.role,
          works: item.usable,
          problems: item.problems.map((problem) => problem.message),
          workerVersion: item.workerVersion ?? null,
          current: item.name === current
        }));
        const summary =
          overview.file.status === 'broken'
            ? `The environments file ${overview.file.path} cannot be used: ${overview.file.reason}`
            : environments.length === 0
              ? 'No environments are defined. The user should run "vizoalica env add" in a terminal.'
              : `${environments.length} environment(s); ${environments.filter((item) => item.works).length} working. Current for this session: ${current ?? 'not chosen yet (the first call picks the one last used in the console)'}.`;
        return result(undefined, [], summary, { environments, current: current ?? null });
      } catch (error) {
        return failure(explain(error, undefined));
      }
    }
  );

  server.registerTool(
    'use_environment',
    {
      title: 'Switch environment',
      description:
        'Make an environment the default for the rest of this session. Affects this conversation only, not the console.',
      inputSchema: { environment: z.string().describe('Environment name from list_environments.') },
      annotations: { ...READ_ONLY, idempotentHint: true }
    },
    async ({ environment }) => {
      try {
        await envs.use(environment);
        const target = await envs.target();
        return result(
          target.ref,
          [],
          `Now using environment "${environment}" for this session.`,
          {}
        );
      } catch (error) {
        return failure(explain(error, undefined));
      }
    }
  );

  server.registerTool(
    'get_environment_status',
    {
      title: 'Backend health',
      description:
        'Health of an environment\'s backend: the credential\'s role and scope, Worker and database versions against this vizoalica package, and database/storage health. Use for "is everything working?" and "do I need to update?".',
      inputSchema: { environment: environmentArg },
      annotations: READ_ONLY
    },
    ({ environment }) =>
      withTarget(environment, async ({ ref, client }) => {
        const principal = await client.whoami();
        const info = await client.backendInfo();
        const workerVersion = info.workerVersion ?? principal.workerVersion;
        const statuses = versionStatus(
          { consoleVersion: deps.version, expectedSchema: deps.expectedSchema },
          { workerVersion, schemaApplied: info.schema.applied }
        );
        const healthy =
          info.health === null || (info.health.database === 'ok' && info.health.storage === 'ok');
        const summary = [
          `Role ${principal.role}${principal.scope.projectId ? `, limited to project ${principal.scope.projectId}${principal.scope.sourceId ? ` website ${principal.scope.sourceId}` : ''}` : ''}.`,
          `Worker ${workerVersion ?? 'unknown'}: ${statuses.worker.message}`,
          `Database schema ${info.schema.applied ?? 'unknown'} (this package expects ${deps.expectedSchema ?? 'unknown'}): ${statuses.schema.message}`,
          info.health
            ? `Database ${info.health.database}, storage ${info.health.storage}.`
            : 'This backend does not report health.',
          healthy
            ? ''
            : 'Something is unavailable; the user should look at the Health page in the console.'
        ]
          .filter(Boolean)
          .join(' ');
        return result(ref, envs.names(), summary, {
          role: principal.role,
          scope: principal.scope,
          packageVersion: deps.version,
          worker: { version: workerVersion, ...statuses.worker },
          schema: {
            applied: info.schema.applied,
            expected: deps.expectedSchema,
            ...statuses.schema
          },
          health: info.health
        });
      })
  );

  server.registerTool(
    'list_websites',
    {
      title: 'List projects and websites',
      description:
        'Projects and their websites in an environment (names, ids, allowed addresses, status). Use the names or ids with the other tools.',
      inputSchema: { environment: environmentArg },
      annotations: READ_ONLY
    },
    ({ environment }) =>
      withTarget(environment, async ({ ref, client }) => {
        const projects = await listProjects(client);
        const withWebsites = await Promise.all(
          projects
            .filter((project) => isSafeId(project.id))
            .map(async (project) => ({
              id: project.id,
              name: project.name,
              websites: await listWebsites(client, project.id)
            }))
        );
        const count = withWebsites.reduce((sum, project) => sum + project.websites.length, 0);
        return result(
          ref,
          envs.names(),
          `${withWebsites.length} project(s), ${count} website(s).`,
          { projects: withWebsites }
        );
      })
  );

  server.registerTool(
    'get_website_status',
    {
      title: 'Website status',
      description:
        "Is a website set up and sending data? Reports collection and configuration status from the backend and, unless check_site is false, probes the website's own address for the Vizoalica files (a few plain HTTP requests to that site).",
      inputSchema: {
        environment: environmentArg,
        project: projectArg,
        website: z.string().describe('Website name or id.'),
        check_site: z.boolean().optional().describe('Probe the live website (default true).')
      },
      annotations: { ...READ_ONLY, openWorldHint: true }
    },
    ({ environment, project, website, check_site }) =>
      withTarget(environment, async ({ ref, client }) => {
        const found = await locate(client, project, website);
        const site = found.website!;
        const base = `/v1/admin/projects/${encodeURIComponent(found.project.id)}/sources/${encodeURIComponent(site.id)}`;
        const status = (await workerJson(client, `${base}/status`)) as Record<string, unknown>;
        const origins = site.allowedOrigins ?? [];
        let live: object | undefined;
        if (check_site !== false && origins.length > 0) {
          const probe = deps.probe ?? { reachability: checkReachability, install: checkInstall };
          const reach = await probe.reachability(origins[0]!);
          const install = await probe.install(origins, 'snippet', reach.configEndpointReachable);
          live = { configEndpointReachable: reach.configEndpointReachable, install };
        }
        const install = (live as { install?: { code: string; nextAction: string } } | undefined)
          ?.install;
        const summary = `${site.name}: collection ${String(status.collection)}, configuration ${String(status.configuration ?? 'unknown')}.${install ? ` Site check: ${install.code}. ${install.nextAction}` : ''}`;
        return result(ref, envs.names(), summary, {
          project: { id: found.project.id, name: found.project.name },
          website: site,
          status,
          ...(live ? { site: live } : {})
        });
      })
  );

  const overviewFor = async (
    client: WorkerClient,
    projectId: string,
    websiteId: string | undefined,
    range: Range
  ) => analyticsOverview(client, projectId, websiteId, range.startUtc, range.endUtc);

  server.registerTool(
    'get_traffic_overview',
    {
      title: 'Traffic overview',
      description:
        'Page views and unique visitors for a project or one website over a range: totals, trend, top pages (each named with its website across a project), referrers, countries, browsers, operating systems, devices, and bot vs human traffic.',
      inputSchema: {
        environment: environmentArg,
        project: projectArg,
        website: websiteArg,
        ...rangeArgs,
        limit: limitArg
      },
      annotations: READ_ONLY
    },
    ({ environment, project, website, preset, start, end, limit }) =>
      withTarget(environment, async ({ ref, client }) => {
        const range = resolveRange({ preset, start, end }, now());
        const found = await locate(client, project, website);
        const overview = await overviewFor(client, found.project.id, found.website?.id, range);
        const rows = limit ?? 10;
        const rankings = Object.fromEntries(
          Object.entries(overview.rankings ?? {}).map(([key, value]) => [key, trim(value, rows)])
        );
        const top = rankings.pagePaths?.items?.[0];
        const summary = `${scopeText(found.project, found.website)}, ${range.startUtc} to ${range.endUtc} (UTC): ${overview.totals.pageViews} page views, ${overview.totals.uniqueUsers} unique visitors.${top ? ` Top page: ${pageKey(top)} (${top.count}).` : ''}${availabilityText(overview.availability?.state)}`;
        return result(ref, envs.names(), summary, {
          scope: { project: found.project.name, website: found.website?.name ?? null },
          range,
          totals: overview.totals,
          trend: overview.trend,
          rankings,
          distributions: overview.distributions,
          availability: overview.availability
        });
      })
  );

  server.registerTool(
    'compare_periods',
    {
      title: 'Compare two periods',
      description:
        'Compares page views and visitors between a period and the one before it (same length, or previous_start/previous_end), with the pages that changed most. Use for "how did this week compare with last week?".',
      inputSchema: {
        environment: environmentArg,
        project: projectArg,
        website: websiteArg,
        ...rangeArgs,
        previous_start: z
          .string()
          .optional()
          .describe('Start of the period to compare with (default: the period just before).'),
        previous_end: z.string().optional().describe('End of the period to compare with.'),
        limit: limitArg
      },
      annotations: READ_ONLY
    },
    ({ environment, project, website, preset, start, end, previous_start, previous_end, limit }) =>
      withTarget(environment, async ({ ref, client }) => {
        const current = resolveRange({ preset, start, end }, now());
        const previous = previous_start
          ? resolveRange({ start: previous_start, end: previous_end }, now())
          : previousRange(current);
        const found = await locate(client, project, website);
        const [a, b] = await Promise.all([
          overviewFor(client, found.project.id, found.website?.id, current),
          overviewFor(client, found.project.id, found.website?.id, previous)
        ]);
        const change = (now_: number, before: number) => ({
          current: now_,
          previous: before,
          change: now_ - before,
          percent: before === 0 ? null : Math.round(((now_ - before) / before) * 1000) / 10
        });
        const before = new Map(
          (b.rankings?.pagePaths?.items ?? []).map((item) => [pageKey(item), item.count])
        );
        const after = new Map(
          (a.rankings?.pagePaths?.items ?? []).map((item) => [pageKey(item), item.count])
        );
        const pages = [...new Set([...after.keys(), ...before.keys()])]
          .map((page) => ({ page, ...change(after.get(page) ?? 0, before.get(page) ?? 0) }))
          .sort((x, y) => Math.abs(y.change) - Math.abs(x.change))
          .slice(0, limit ?? 10);
        const views = change(a.totals.pageViews, b.totals.pageViews);
        const visitors = change(a.totals.uniqueUsers, b.totals.uniqueUsers);
        const pct = (value: number | null) =>
          value === null ? 'n/a' : `${value > 0 ? '+' : ''}${value}%`;
        const summary = `${scopeText(found.project, found.website)}: ${views.current} page views vs ${views.previous} (${pct(views.percent)}), ${visitors.current} visitors vs ${visitors.previous} (${pct(visitors.percent)}). Current ${current.startUtc} to ${current.endUtc}; previous ${previous.startUtc} to ${previous.endUtc} (UTC).${availabilityText(a.availability?.state)}`;
        return result(ref, envs.names(), summary, {
          scope: { project: found.project.name, website: found.website?.name ?? null },
          current: { range: current, availability: a.availability?.state ?? null },
          previous: { range: previous, availability: b.availability?.state ?? null },
          pageViews: views,
          uniqueVisitors: visitors,
          pages,
          note: "Page changes compare each period's top-page rankings; a page outside a ranking counts as 0 there."
        });
      })
  );

  server.registerTool(
    'get_actions',
    {
      title: 'Clicks (actions)',
      description:
        'Which buttons and links are clicked, on which pages, how often, and by how many visitors. Filter by page (exact page key such as /pricing or /orders/:id) or action name.',
      inputSchema: {
        environment: environmentArg,
        project: projectArg,
        website: websiteArg,
        ...rangeArgs,
        page: z.string().max(1024).optional().describe('Exact page key, for example /pricing.'),
        action: z.string().max(80).optional().describe('Exact action name.'),
        limit: limitArg
      },
      annotations: READ_ONLY
    },
    ({ environment, project, website, preset, start, end, page, action, limit }) =>
      withTarget(environment, async ({ ref, client }) => {
        const range = resolveRange({ preset, start, end }, now());
        const found = await locate(client, project, website);
        const report: ActionsReport = await analyticsActions(
          client,
          found.project.id,
          found.website?.id,
          range.startUtc,
          range.endUtc,
          { ...(page ? { page } : {}), ...(action ? { action } : {}) }
        );
        const rows = report.rows.slice(0, limit ?? 20);
        const top = rows[0];
        const summary = `${scopeText(found.project, found.website)}${page ? `, page ${page}` : ''}${action ? `, action "${action}"` : ''}, ${range.startUtc} to ${range.endUtc} (UTC): ${report.totals.actions} actions by ${report.totals.uniqueUsers} visitors.${top ? ` Most used: "${top.action}" on ${top.page} (${top.count}).` : ''}${availabilityText(report.availability?.state)}`;
        return result(ref, envs.names(), summary, {
          scope: { project: found.project.name, website: found.website?.name ?? null },
          range,
          totals: report.totals,
          rows,
          other: {
            rows: report.other.rows + (report.rows.length - rows.length),
            count:
              report.other.count +
              report.rows.slice(rows.length).reduce((sum, row) => sum + row.count, 0)
          },
          actions: report.actions.slice(0, limit ?? 20),
          ...(report.selection ? { selection: report.selection } : {}),
          availability: report.availability
        });
      })
  );

  const scopeArgs = {
    environment: z.string().optional().describe('Environment name; omit for the current one.'),
    project: z.string().optional().describe('Project name or id.'),
    website: z.string().optional().describe('Website name or id; omit for the whole project.')
  };
  const where = (args: {
    environment?: string | undefined;
    project?: string | undefined;
    website?: string | undefined;
  }) =>
    [
      args.environment ? `environment "${args.environment}"` : 'the current environment',
      args.project ? `project "${args.project}"` : '',
      args.website ? `website "${args.website}"` : ''
    ]
      .filter(Boolean)
      .join(', ');
  const prompt = (text: string) => ({
    messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }]
  });

  server.registerPrompt(
    'weekly_report',
    {
      title: 'Weekly report',
      description: 'A short traffic report for the last 7 days.',
      argsSchema: scopeArgs
    },
    (args) =>
      prompt(
        `Write a short weekly analytics report for ${where(args)} with the Vizoalica tools. Use compare_periods with preset last_7_days, then get_traffic_overview for the same range and get_actions for the top clicks. Start with the environment and the exact UTC range. Give totals with change against the previous 7 days, the top 5 pages, top referrers and countries, and the most used actions. Say if data is still processing. Keep it under 200 words.`
      )
  );
  server.registerPrompt(
    'compare_weeks',
    {
      title: 'This week vs last week',
      description: 'What changed between the last 7 days and the 7 before.',
      argsSchema: scopeArgs
    },
    (args) =>
      prompt(
        `Compare the last 7 days with the 7 days before for ${where(args)} using compare_periods. Name the environment and ranges, then explain the biggest changes in page views, visitors, and pages, and suggest one likely cause for each where the data supports it. Mark guesses as guesses.`
      )
  );
  server.registerPrompt(
    'page_actions',
    {
      title: 'Clicks on a page',
      description: 'Which buttons and links people use on one page.',
      argsSchema: { ...scopeArgs, page: z.string().describe('Page key, for example /pricing.') }
    },
    (args) =>
      prompt(
        `For page ${args.page} in ${where(args)}, use get_actions with that page over the last 30 days. Name the environment and range, list the actions by use with visitors and the share of page views, and point out links or buttons that are rarely used.`
      )
  );

  return server;
}
