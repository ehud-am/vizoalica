/** A failure whose message is the whole story; callers print it without a stack. */
export class OpsCoreError extends Error {}

export const DEFAULT_NAMES = {
  worker: 'vizoalica-ingest',
  database: 'vizoalica-config',
  bucket: 'vizoalica-events'
};

/** 3 to 63 lowercase letters, digits, or dashes, starting and ending with a letter or digit. */
export function assertResourceName(kind: string, name: string): void {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name))
    throw new OpsCoreError(
      `${kind} name "${name}" must be 3-63 lowercase letters, digits, or dashes, starting and ending with a letter or digit.`
    );
}

/** A Cloudflare account id: 32 lowercase hex characters. */
export function assertAccountId(id: string): void {
  if (!/^[0-9a-f]{32}$/.test(id)) throw new OpsCoreError(`"${id}" is not a valid account id.`);
}

const LONGEST_DEFAULT_SUFFIX = '-vizoalica-worker';
/** Cloudflare's own resource-name limit; the environment prefix must leave room for the suffix above. */
const MAX_RESOURCE_NAME_LENGTH = 63;

/**
 * An environment's name doubles as its Cloudflare resource-name prefix (research R26), so it is
 * validated more strictly than a resource name: lowercase letters, digits, and dashes, starting with a
 * letter, and short enough that `<name>-vizoalica-worker` still fits Cloudflare's resource-name limit.
 */
export function assertEnvironmentName(name: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    throw new OpsCoreError(
      `Environment name "${name}" must start with a lowercase letter and contain only lowercase letters, digits, and dashes.`
    );
  if (name.length + LONGEST_DEFAULT_SUFFIX.length > MAX_RESOURCE_NAME_LENGTH)
    throw new OpsCoreError(
      `Environment name "${name}" is too long: "${name}${LONGEST_DEFAULT_SUFFIX}" would exceed Cloudflare's ${MAX_RESOURCE_NAME_LENGTH}-character resource name limit.`
    );
}

/** The default resource names for one environment, each carrying its prefix (research R26). */
export function defaultNames(environment: string): {
  worker: string;
  database: string;
  bucket: string;
} {
  assertEnvironmentName(environment);
  return {
    worker: `${environment}-vizoalica-worker`,
    database: `${environment}-vizoalica-db`,
    bucket: `${environment}-vizoalica-bucket`
  };
}

/**
 * Like `assertResourceName`, but also requires the name to start with the environment's prefix, so a
 * console-driven deploy can never create or attach a resource belonging to a different environment.
 */
export function assertEnvironmentResourceName(
  kind: string,
  name: string,
  environment: string
): void {
  assertResourceName(kind, name);
  if (!name.startsWith(`${environment}-`))
    throw new OpsCoreError(
      `${kind} name "${name}" must start with "${environment}-" (the "${environment}" environment's prefix).`
    );
}
