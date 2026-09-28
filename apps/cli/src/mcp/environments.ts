import { statSync } from 'node:fs';
import {
  environmentsPath,
  readEnvironments,
  type EnvironmentDef,
  type LoadResult,
  type Role
} from '../../../local-ops-api/src/environments/file.js';
import type { FetchLike, Vault } from '../../../local-ops-api/src/environments/vault.js';
import {
  resolveSecret,
  verifyEnvironment,
  type EnvironmentState
} from '../../../local-ops-api/src/environments/verify.js';
import { readPreferences } from '../../../local-ops-api/src/preferences.js';
import { WorkerClient } from '../../../local-ops-api/src/remote-client/worker-client.js';
import { join } from 'node:path';

/** Why a tool call works on the environment it does; shown so an answer never hides which backend it used. */
export type ChosenBy = 'argument' | 'session' | 'console' | 'only' | 'first-usable';

/** What an answer says about where it came from. Never a secret. */
export type EnvironmentRef = { name: string; url: string; role: Role; chosenBy: ChosenBy };

export type Target = { ref: EnvironmentRef; client: WorkerClient };

export type Overview = {
  file: { status: 'ok' | 'broken'; path: string; reason?: string };
  environments: EnvironmentState[];
  /** The environment calls without an `environment` argument use, when one is decided. */
  current: string | undefined;
};

export type McpEnvironmentsOptions = {
  /** Holds `environments.json` and `preferences.json` (`~/.config/vizoalica`). */
  homeDir: string;
  version: string;
  expectedSchema: number | null;
  vault: Vault;
  /** Tests replace the network and the check of each environment. */
  fetch?: FetchLike | undefined;
  verify?: typeof verifyEnvironment | undefined;
  ttlMs?: number | undefined;
  now?: (() => number) | undefined;
};

/** A plain explanation for the agent; the message is safe to show and names the fix. */
export class EnvironmentProblem extends Error {}

/**
 * Every environment on this computer, as `vizoalica env` defines them, for one MCP session. Unlike the
 * console it never writes preferences: switching here (`use_environment`) lasts for this session only.
 * The default is the console's last-used environment, so both start on the same backend.
 */
export class McpEnvironments {
  private chosen: { name: string; by: ChosenBy } | undefined;
  private cache: { signature: string; at: number; overview: Omit<Overview, 'current'> } | undefined;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(private readonly options: McpEnvironmentsOptions) {
    this.ttlMs = options.ttlMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  private get path(): string {
    return environmentsPath(this.options.homeDir);
  }

  private signature(): string {
    try {
      const stats = statSync(this.path);
      return `${stats.mtimeMs}:${stats.size}`;
    } catch {
      return 'missing';
    }
  }

  private load(): LoadResult {
    return readEnvironments(this.path);
  }

  private definitions(): Map<string, EnvironmentDef> {
    const loaded = this.load();
    if (loaded.status === 'broken')
      throw new EnvironmentProblem(
        `The environments file ${loaded.path} cannot be used: ${loaded.reason}`
      );
    const defs = new Map<string, EnvironmentDef>();
    for (const entry of loaded.entries) if ('def' in entry) defs.set(entry.name, entry.def);
    return defs;
  }

  private consoleChoice(): string | undefined {
    try {
      return readPreferences(join(this.options.homeDir, 'preferences.json'))?.environment;
    } catch {
      return undefined;
    }
  }

  /** The names in the file, without checking them. */
  names(): string[] {
    try {
      return [...this.definitions().keys()];
    } catch {
      return [];
    }
  }

  /** Every environment and whether it works (checked against its Worker, cached briefly). */
  async overview(force = false): Promise<Overview> {
    const signature = this.signature();
    if (
      force ||
      !this.cache ||
      this.cache.signature !== signature ||
      this.now() - this.cache.at >= this.ttlMs
    ) {
      const loaded = this.load();
      const deps = {
        version: this.options.version,
        expectedSchema: this.options.expectedSchema,
        vault: this.options.vault,
        ...(this.options.fetch ? { fetch: this.options.fetch } : {})
      };
      const environments =
        loaded.status === 'ok'
          ? await Promise.all(
              loaded.entries.map((entry) =>
                'problem' in entry
                  ? Promise.resolve<EnvironmentState>({
                      name: entry.name,
                      cloudflare: 'none',
                      usable: false,
                      problems: [
                        { code: 'invalid', message: `The entry is not valid: ${entry.problem}.` }
                      ]
                    })
                  : (this.options.verify ?? verifyEnvironment)(entry.name, entry.def, deps)
              )
            )
          : [];
      this.cache = {
        signature,
        at: this.now(),
        overview: {
          file:
            loaded.status === 'ok'
              ? { status: 'ok', path: loaded.path }
              : { status: 'broken', path: loaded.path, reason: loaded.reason },
          environments
        }
      };
    }
    return { ...this.cache.overview, current: this.chosen?.name };
  }

  /** Makes `name` the environment for calls without an `environment` argument, for this session. */
  async use(name: string): Promise<EnvironmentState> {
    const defs = this.definitions();
    if (!defs.has(name)) throw new EnvironmentProblem(unknownMessage(name, [...defs.keys()]));
    const state = (await this.overview(true)).environments.find((item) => item.name === name)!;
    if (!state.usable)
      throw new EnvironmentProblem(
        `Environment "${name}" does not work right now: ${state.problems.map((p) => p.message).join(' ')} Check it with: vizoalica env check ${name}`
      );
    this.chosen = { name, by: 'session' };
    return state;
  }

  /** The environment a call works on: its argument, else this session's choice, else a default. */
  async target(requested?: string): Promise<Target> {
    const defs = this.definitions();
    if (defs.size === 0)
      throw new EnvironmentProblem(
        'No environments are defined on this computer. The user should run "vizoalica env add" in a terminal.'
      );
    let name: string;
    let by: ChosenBy;
    if (requested !== undefined) {
      if (!defs.has(requested))
        throw new EnvironmentProblem(unknownMessage(requested, [...defs.keys()]));
      name = requested;
      by = 'argument';
    } else if (this.chosen && defs.has(this.chosen.name)) {
      name = this.chosen.name;
      by = this.chosen.by;
    } else {
      ({ name, by } = await this.pickDefault(defs));
      this.chosen = { name, by };
    }
    const def = defs.get(name)!;
    const { credential, fetch } = resolveSecret(def.secret, {
      vault: this.options.vault,
      ...(this.options.fetch ? { fetch: this.options.fetch } : {})
    });
    return {
      ref: { name, url: def.url, role: def.role, chosenBy: by },
      client: new WorkerClient(def.url, credential, fetch)
    };
  }

  private async pickDefault(
    defs: Map<string, EnvironmentDef>
  ): Promise<{ name: string; by: ChosenBy }> {
    if (defs.size === 1) return { name: [...defs.keys()][0]!, by: 'only' };
    const usable = (await this.overview()).environments
      .filter((item) => item.usable)
      .map((item) => item.name);
    const preferred = this.consoleChoice();
    if (preferred && usable.includes(preferred)) return { name: preferred, by: 'console' };
    if (usable[0]) return { name: usable[0], by: 'first-usable' };
    throw new EnvironmentProblem(
      `None of the environments on this computer works right now (${[...defs.keys()].join(', ')}). Call list_environments to see why, or have the user run "vizoalica env list".`
    );
  }
}

function unknownMessage(name: string, known: string[]): string {
  return `There is no environment named "${name}". Environments on this computer: ${known.length ? known.join(', ') : 'none'}.`;
}
