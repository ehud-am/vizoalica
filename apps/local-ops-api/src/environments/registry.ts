import { statSync } from 'node:fs';
import { environmentsPath, readEnvironments, type LoadResult, type Role } from './file.js';
import { readPreferences, updatePreferences } from '../preferences.js';
import {
  resolveSecret,
  verifyEnvironment,
  type EnvironmentState,
  type VerifyDeps
} from './verify.js';
import type { FetchLike, Vault } from './vault.js';

/** What the rest of the service needs to talk to the selected environment's Worker. */
export type Connection = {
  name: string;
  remoteUrl: string;
  credential: string;
  fetch: FetchLike;
  role: Role;
};

export type Snapshot = {
  file: { status: 'ok' | 'broken'; path: string; reason?: string };
  environments: EnvironmentState[];
  selected: string | undefined;
};

export type RegistryOptions = {
  /** Where `environments.json` and `preferences.json` live. Without it, `load` supplies the definitions. */
  homeDir?: string | undefined;
  load?: (() => LoadResult) | undefined;
  preferencesPath?: string | undefined;
  version: string;
  expectedSchema: number | null;
  vault: Vault;
  fetch?: FetchLike | undefined;
  /** Tests replace the check of each environment. */
  verify?: typeof verifyEnvironment | undefined;
  /** How long a check stays fresh; an edit of the file is noticed sooner than this. */
  ttlMs?: number | undefined;
  now?: (() => number) | undefined;
};

/**
 * The environments this computer knows about, read from `environments.json` (never written here) and
 * verified against their Workers. The selected one is the environment the console works on.
 */
export class Registry {
  private snapshot_: Snapshot = {
    file: { status: 'ok', path: '' },
    environments: [],
    selected: undefined
  };
  private connection_: Connection | undefined;
  private connectionKey = '';
  private revision_ = 0;
  private choice: string | undefined;
  private signature: string | undefined;
  private checkedAt = -Infinity;
  private inflight: Promise<void> | undefined;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly path: string;
  private readonly verifyDeps: VerifyDeps;

  constructor(private readonly options: RegistryOptions) {
    this.ttlMs = options.ttlMs ?? 30_000;
    this.now = options.now ?? Date.now;
    this.path = options.homeDir ? environmentsPath(options.homeDir) : '';
    this.verifyDeps = {
      version: options.version,
      expectedSchema: options.expectedSchema,
      vault: options.vault,
      ...(options.fetch ? { fetch: options.fetch } : {})
    };
  }

  private fileSignature(): string {
    if (!this.path) return '';
    try {
      const stats = statSync(this.path);
      return `${stats.mtimeMs}:${stats.size}`;
    } catch {
      return 'missing';
    }
  }

  private persistedChoice(): string | undefined {
    const file = this.options.preferencesPath;
    if (!file) return undefined;
    try {
      return readPreferences(file)?.environment;
    } catch {
      return undefined;
    }
  }

  /** Re-reads and re-verifies when the file changed, the last check is stale, or `force` is set. */
  refresh(force = false): Promise<void> {
    if (this.inflight) return this.inflight;
    const signature = this.fileSignature();
    if (!force && signature === this.signature && this.now() - this.checkedAt < this.ttlMs)
      return Promise.resolve();
    this.inflight = this.check(signature).finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  private async check(signature: string): Promise<void> {
    const loaded = this.options.load ? this.options.load() : readEnvironments(this.path);
    const states: EnvironmentState[] = [];
    const defs = new Map<string, Parameters<typeof verifyEnvironment>[1]>();
    if (loaded.status === 'ok') {
      const checks: Promise<EnvironmentState>[] = loaded.entries.map((entry) => {
        if ('problem' in entry)
          return Promise.resolve<EnvironmentState>({
            name: entry.name,
            cloudflare: 'none',
            usable: false,
            problems: [{ code: 'invalid', message: `The entry is not valid: ${entry.problem}.` }]
          });
        defs.set(entry.name, entry.def);
        return (this.options.verify ?? verifyEnvironment)(entry.name, entry.def, this.verifyDeps);
      });
      states.push(...(await Promise.all(checks)));
    }
    const usable = states.filter((state) => state.usable).map((state) => state.name);
    const wanted = this.choice ?? this.persistedChoice();
    const selected = wanted && usable.includes(wanted) ? wanted : usable[0];
    this.snapshot_ = {
      file:
        loaded.status === 'ok'
          ? { status: 'ok', path: loaded.path }
          : { status: 'broken', path: loaded.path, reason: loaded.reason },
      environments: states,
      selected
    };
    const def = selected ? defs.get(selected) : undefined;
    const key = def ? JSON.stringify([selected, def]) : '';
    if (def && selected) {
      const { credential, fetch } = resolveSecret(def.secret, this.verifyDeps);
      this.connection_ = { name: selected, remoteUrl: def.url, credential, fetch, role: def.role };
    } else this.connection_ = undefined;
    if (key !== this.connectionKey) {
      this.connectionKey = key;
      this.revision_ += 1;
    }
    this.signature = signature;
    this.checkedAt = this.now();
  }

  get snapshot(): Snapshot {
    return this.snapshot_;
  }

  current(): Connection | undefined {
    return this.connection_;
  }

  /** Changes whenever the selected environment, or what it points at, changes. */
  get revision(): number {
    return this.revision_;
  }

  /** Selects a usable environment and remembers it for next time. */
  async select(name: string): Promise<void> {
    await this.refresh();
    const state = this.snapshot_.environments.find((item) => item.name === name);
    if (!state) throw new Error('environment_not_found');
    if (!state.usable) throw new Error('environment_unusable');
    this.choice = name;
    if (this.options.preferencesPath) {
      try {
        updatePreferences(this.options.preferencesPath, { environment: name });
      } catch {
        // Remembering the choice is a convenience; it still applies until the console stops.
      }
    }
    await this.refresh(true);
  }
}
