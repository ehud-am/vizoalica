export type VersionStatus =
  'current' | 'update-available' | 'console-older' | 'unknown' | 'unsupported';
/** Which side needs to move: the backend (Worker and database) or this console's package. */
export type UpdateSide = 'backend' | 'console' | null;
export type ComponentStatus = { status: VersionStatus; message: string; update: UpdateSide };

function majorMinor(version: string | null | undefined): [number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.exec(version ?? '');
  return match ? [Number(match[1]), Number(match[2])] : undefined;
}

/** The Worker is compared by major and minor; a patch difference never needs an update. */
export function workerStatus(
  consoleVersion: string,
  workerVersion: string | null | undefined
): ComponentStatus {
  const worker = majorMinor(workerVersion);
  const local = majorMinor(consoleVersion);
  if (!worker || !local)
    return {
      status: 'unknown',
      message:
        'This backend does not report its version, so it was set up with an older release. It works, and updating it will bring it up to date.',
      update: 'backend'
    };
  const order = worker[0] - local[0] || worker[1] - local[1];
  if (order === 0)
    return { status: 'current', message: 'The Worker matches this console.', update: null };
  return order < 0
    ? {
        status: 'update-available',
        message: `The Worker (${workerVersion}) is older than this console (${consoleVersion}). Update the backend.`,
        update: 'backend'
      }
    : {
        status: 'console-older',
        message: `The Worker (${workerVersion}) is newer than this console (${consoleVersion}). Update the console: npm update -g vizoalica`,
        update: 'console'
      };
}

/** The database schema is a number: the highest migration applied, against the highest this console carries. */
export function schemaStatus(
  expected: number | null | undefined,
  applied: number | null | undefined
): ComponentStatus {
  if (applied === null || applied === undefined)
    return {
      status: 'unknown',
      message: 'The database does not record which changes were applied to it.',
      update: 'backend'
    };
  if (applied < 1)
    return {
      status: 'unsupported',
      message:
        'This database is older than the oldest schema this console can update. Set up a new backend instead.',
      update: null
    };
  if (expected === null || expected === undefined)
    return {
      status: 'unknown',
      message: 'This console does not know which schema it expects.',
      update: null
    };
  if (applied === expected)
    return { status: 'current', message: 'The database schema is up to date.', update: null };
  return applied < expected
    ? {
        status: 'update-available',
        message: `The database schema (${applied}) is behind what this console expects (${expected}). Update the backend.`,
        update: 'backend'
      }
    : {
        status: 'console-older',
        message: `The database schema (${applied}) is newer than this console expects (${expected}). Update the console: npm update -g vizoalica`,
        update: 'console'
      };
}

export type BackendVersions = {
  workerVersion: string | null;
  schemaApplied: number | null;
};

export function versionStatus(
  local: { consoleVersion: string; expectedSchema: number | null },
  backend: BackendVersions
): { worker: ComponentStatus; schema: ComponentStatus } {
  return {
    worker: workerStatus(local.consoleVersion, backend.workerVersion),
    schema: schemaStatus(local.expectedSchema, backend.schemaApplied)
  };
}

/** True when this console cannot safely work with the backend, as opposed to merely being able to update it. */
export function isIncompatible(status: { worker: ComponentStatus; schema: ComponentStatus }) {
  return status.schema.status === 'unsupported' || status.schema.status === 'console-older';
}
